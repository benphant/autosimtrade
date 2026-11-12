import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planRounds } from './src/engine/scheduler.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = __dirname;
const publicDir = join(root, 'public');
const dataDir = join(root, 'data');
const runsDir = join(dataDir, 'runs');
const guidePath = join(root, 'src', 'guide', 'guide-spec.json');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const activeRuns = new Map();
const clients = new Set();
const eventBuffer = [];
const maxBufferedEvents = 500;
let eventSeq = 0;

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendEvent(event) {
  const enriched = { seq: ++eventSeq, time: new Date().toISOString(), ...event };
  eventBuffer.push(enriched);
  while (eventBuffer.length > maxBufferedEvents) eventBuffer.shift();
  const payload = `data: ${JSON.stringify(enriched)}\n\n`;
  for (const res of clients) res.write(payload);
}

function normalizeAccounts(input) {
  if (Array.isArray(input)) return input.map(String).map(s => s.trim()).filter(Boolean);
  return String(input || '')
    .split(/[\s,，;；]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function resolveBaseUrl(input) {
  const fallback = 'http://10.14.60.254/simtrade/';
  const raw = String(input || '').trim().replace(/[\r\n]/g, '');
  return raw || String(process.env.AUTOSIMTRADE_BASE_URL || '').trim() || fallback;
}

function resolveHeaded(body) {
  if (typeof body.headed === 'boolean') return body.headed;
  if (body.headed === '1' || body.headed === 'true' || body.headed === 'yes') return true;
  return /^(1|true|yes)$/i.test(String(process.env.AUTOSIMTRADE_HEADED || '').trim());
}

function normalizeCredentials(input, accounts) {
  const source = input && typeof input === 'object' ? input : {};
  const result = {};
  for (const account of accounts) {
    result[account] = String(source[account] ?? '');
  }
  return result;
}

async function createPlan(body) {
  const accounts = normalizeAccounts(body.accounts);
  const guide = await readJson(guidePath);
  const state = await readJson(join(dataDir, 'profiles', 'account-state.json'));
  const liveDefaultPayments = ['D/A', 'D/P', 'T/T', 'L/C'];
  return planRounds({
    guide,
    state,
    accounts,
    rounds: Number(body.rounds || 1),
    mode: body.mode || 'balanced',
    preferredPayments: body.payments || liveDefaultPayments,
    preferredTerms: body.terms || ['CIF', 'CFR', 'FOB']
  });
}

async function startRun(body) {
  const running = [...activeRuns.values()].find(run => run.status === 'running' || run.status === 'stopping');
  if (running) {
    const err = new Error(`已有任务正在运行：${running.runId}`);
    err.status = 409;
    throw err;
  }

  await mkdir(runsDir, { recursive: true });
  const plan = await createPlan(body);
  const credentials = normalizeCredentials(body.credentials, plan.accounts);
  const baseUrl = resolveBaseUrl(body.baseUrl);
  const headed = resolveHeaded(body);
  const runId = `run_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const runDir = join(runsDir, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'plan.json'), JSON.stringify(plan, null, 2), 'utf8');

  const workerPath = join(root, 'src', 'engine', 'worker.js');
  const child = spawn(process.execPath, [workerPath, '--run-id', runId], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      AUTOSIMTRADE_RUN_DIR: runDir,
      AUTOSIMTRADE_LIVE: body.live === false ? '0' : '1',
      AUTOSIMTRADE_BASE_URL: baseUrl,
      AUTOSIMTRADE_HEADED: headed ? '1' : '0',
      AUTOSIMTRADE_CREDENTIALS: JSON.stringify(credentials)
    }
  });

  const run = { runId, pid: child.pid, status: 'running', plan, startedAt: new Date().toISOString() };
  activeRuns.set(runId, { ...run, child });
  sendEvent({ type: 'run-started', run });

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', data => {
    for (const line of data.split(/\r?\n/).filter(Boolean)) {
      try {
        const event = JSON.parse(line);
        sendEvent({ type: 'log', runId, event });
      } catch {
        sendEvent({ type: 'log', runId, event: { level: 'info', message: line } });
      }
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', data => {
    sendEvent({ type: 'log', runId, event: { level: 'error', message: data.trim() } });
  });

  child.on('exit', code => {
    const current = activeRuns.get(runId);
    if (current) {
      current.status = code === 0 ? 'done' : 'failed';
      current.exitCode = code;
      current.finishedAt = new Date().toISOString();
    }
    sendEvent({ type: 'run-finished', runId, code });
  });

  return run;
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });
    res.write(': connected\n\n');
    clients.add(res);
    const snapshot = {
      type: 'snapshot',
      activeRuns: [...activeRuns.values()].map(({ child, ...run }) => run),
      events: eventBuffer.slice(-120)
    };
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (url.pathname === '/api/spec') return json(res, 200, await readJson(guidePath));
  if (url.pathname === '/api/status') {
    return json(res, 200, {
      activeRuns: [...activeRuns.values()].map(({ child, ...run }) => run)
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/plan') {
    return json(res, 200, await createPlan(await readBody(req)));
  }

  if (req.method === 'POST' && url.pathname === '/api/run') {
    return json(res, 200, await startRun(await readBody(req)));
  }

  if (req.method === 'POST' && url.pathname === '/api/stop') {
    const { runId } = await readBody(req);
    const run = activeRuns.get(runId);
    if (!run) return json(res, 404, { error: 'run not found' });
    run.child.kill('SIGTERM');
    run.status = 'stopping';
    return json(res, 200, { ok: true });
  }

  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = resolve(publicDir, `.${pathname}`);
  if (!file.startsWith(publicDir) || !existsSync(file)) {
    return json(res, 404, { error: 'not found' });
  }
  res.writeHead(200, { 'content-type': contentTypes[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

const port = Number(process.env.PORT || 3099);
const server = createServer((req, res) => {
  route(req, res).catch(err => json(res, err.status || 500, { error: err.message, stack: err.stack }));
});

server.listen(port, async () => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'server.pid.json'), JSON.stringify({
    pid: process.pid,
    url: `http://localhost:${port}`,
    started: new Date().toISOString()
  }, null, 2), 'utf8');
  console.log(`AutoSimTrade listening on http://localhost:${port}`);
});

setInterval(() => {
  for (const res of clients) res.write(': heartbeat\n\n');
}, 15000).unref();
