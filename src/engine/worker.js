import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { appendEvent, saveCheckpoint } from '../state/checkpoint.js';
import { classifyError, canRetry, shouldSkipRound } from './errors.js';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i], process.argv[i + 1]);
}

const runId = args.get('--run-id');
const runDir = process.env.AUTOSIMTRADE_RUN_DIR;
const live = process.env.AUTOSIMTRADE_LIVE === '1';

if (!runId || !runDir) {
  throw new Error('missing --run-id or AUTOSIMTRADE_RUN_DIR');
}

function emit(event) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`);
}

async function wait(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function runVerifiedStep(round, stepName, fn, verify) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await saveCheckpoint(runDir, {
      runId,
      round: round.index,
      contractNo: round.contractNo,
      step: stepName,
      status: 'running',
      attempt
    });
    emit({ level: 'info', message: `${round.contractNo} ${stepName} attempt ${attempt}` });

    try {
      await fn();
      const verified = await verify();
      if (!verified.ok) throw new Error(verified.message || `${stepName} verification failed`);

      await appendEvent(runDir, {
        runId,
        round: round.index,
        contractNo: round.contractNo,
        step: stepName,
        status: 'done',
        score: verified.score ?? null
      });
      emit({ level: 'ok', message: `${round.contractNo} ${stepName} done`, score: verified.score ?? null });
      return { ok: true };
    } catch (err) {
      const type = classifyError(err);
      await appendEvent(runDir, {
        runId,
        round: round.index,
        contractNo: round.contractNo,
        step: stepName,
        status: 'error',
        errorType: type,
        message: err.message
      });
      emit({ level: 'warn', message: `${round.contractNo} ${stepName} ${type}: ${err.message}` });

      if (shouldSkipRound(type)) return { ok: false, skipped: true, errorType: type, message: err.message };
      if (attempt < maxAttempts && canRetry(type)) {
        await wait(1200 * attempt);
        continue;
      }
      return { ok: false, failed: true, errorType: type, message: err.message };
    }
  }
}

async function dryRunStep(round, stepName) {
  await wait(120);
  return {
    ok: true,
    score: round.expectedDocuments.some(doc => stepName.includes(doc)) ? 90 : null
  };
}

async function liveStepPlaceholder(round, stepName) {
  await wait(100);
  throw new Error(`LIVE adapter for "${stepName}" is not wired yet. Existing scripts must be modularized before real execution.`);
}

function buildSteps(round) {
  const routeSteps = round.route || [];
  return routeSteps.map((name, idx) => ({
    name,
    index: idx + 1
  }));
}

async function runRound(round) {
  emit({
    level: 'info',
    message: `round ${round.index} start: ${round.contractNo} ${round.payment}+${round.term} exporter=${round.exporter} importer=${round.importer} factory=${round.factory}`,
    round
  });

  await saveCheckpoint(runDir, {
    runId,
    round: round.index,
    contractNo: round.contractNo,
    status: 'round-started'
  });

  for (const step of buildSteps(round)) {
    const result = await runVerifiedStep(
      round,
      step.name,
      async () => {
        if (live) await liveStepPlaceholder(round, step.name);
        else await wait(80);
      },
      async () => {
        if (live) return { ok: true };
        return dryRunStep(round, step.name);
      }
    );

    if (!result.ok) {
      const status = result.skipped ? 'round-skipped' : 'round-failed';
      await saveCheckpoint(runDir, {
        runId,
        round: round.index,
        contractNo: round.contractNo,
        status,
        errorType: result.errorType,
        message: result.message
      });
      emit({ level: result.skipped ? 'warn' : 'error', message: `${round.contractNo} ${status}: ${result.errorType}` });
      return result;
    }
  }

  await saveCheckpoint(runDir, {
    runId,
    round: round.index,
    contractNo: round.contractNo,
    status: 'round-done'
  });
  emit({ level: 'ok', message: `round ${round.index} completed: ${round.contractNo}` });
  return { ok: true };
}

function mapPlanToLegacyRound(round, index) {
  const stablePayment = ['L/C', 'D/A', 'D/P', 'T/T'].includes(round.payment) ? round.payment : 'D/A';
  const stableTerm = ['CIF', 'CFR', 'FOB'].includes(round.term) ? round.term : 'CIF';
  return {
    idx: Number(String(Date.now()).slice(-5)) + index,
    exporter: round.exporter,
    importer: round.importer,
    factory: round.factory,
    payment: stablePayment,
    term: stableTerm,
    qty: 90 + ((index - 1) % 3) * 10,
    price: 8.2 + ((index - 1) % 4) * 0.2,
    domestic: 35.4 + ((index - 1) % 3) * 0.2,
    port: 'BOMBAY',
    country: 'INDIA'
  };
}

function defaultAccountRecord(account) {
  return {
    reportsTo: '',
    ratings: {
      exporter: 1,
      importer: 1,
      factory: 1
    },
    roleRuns: {
      exporter: 0,
      importer: 0,
      factory: 0
    },
    completed: {
      exporter: {
        'L/C': false,
        'D/P': false,
        'D/A': false,
        'T/T': false
      },
      importer: {
        'L/C': false,
        'D/P': false,
        'D/A': false,
        'T/T': false
      },
      factoryDeals: 0
    }
  };
}

function ensureAccountRecord(state, account) {
  state.accounts ||= {};
  state.accounts[account] ||= defaultAccountRecord(account);
  state.accounts[account].ratings ||= defaultAccountRecord(account).ratings;
  state.accounts[account].completed ||= defaultAccountRecord(account).completed;
  state.accounts[account].completed.exporter ||= defaultAccountRecord(account).completed.exporter;
  state.accounts[account].completed.importer ||= defaultAccountRecord(account).completed.importer;
  state.accounts[account].roleRuns ||= {};
  state.accounts[account].roleRuns.exporter ??= Object.values(state.accounts[account].completed.exporter).filter(Boolean).length;
  state.accounts[account].roleRuns.importer ??= Object.values(state.accounts[account].completed.importer).filter(Boolean).length;
  state.accounts[account].roleRuns.factory ??= Number(state.accounts[account].completed.factoryDeals || 0);
  return state.accounts[account];
}

async function updateAccountState(projectRoot, plan, liveResult) {
  const statePath = join(projectRoot, 'data', 'profiles', 'account-state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const finalRatings = liveResult.finalRatings || [];
  for (const row of finalRatings) {
    const account = ensureAccountRecord(state, row.account);
    if (row.roleName === '出口商') account.ratings.exporter = row.rating;
    if (row.roleName === '进口商') account.ratings.importer = row.rating;
    if (row.roleName === '工厂') account.ratings.factory = row.rating;
  }

  for (let i = 0; i < plan.rounds.length; i += 1) {
    const planned = plan.rounds[i];
    const actual = mapPlanToLegacyRound(planned, i + 1);
    const completed = liveResult.completed?.[i];
    if (!completed?.ok) continue;
    const exporter = ensureAccountRecord(state, actual.exporter);
    const importer = ensureAccountRecord(state, actual.importer);
    const factory = ensureAccountRecord(state, actual.factory);
    if (exporter?.completed?.exporter) exporter.completed.exporter[actual.payment] = true;
    if (importer?.completed?.importer) importer.completed.importer[actual.payment] = true;
    if (factory?.completed) factory.completed.factoryDeals = Number(factory.completed.factoryDeals || 0) + 1;
    if (exporter?.roleRuns) exporter.roleRuns.exporter = Number(exporter.roleRuns.exporter || 0) + 1;
    if (importer?.roleRuns) importer.roleRuns.importer = Number(importer.roleRuns.importer || 0) + 1;
    if (factory?.roleRuns) factory.roleRuns.factory = Number(factory.roleRuns.factory || 0) + 1;
  }

  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

async function runLegacyCompat(plan) {
  const appRoot = resolve(runDir, '..', '..', '..');
  const workspaceRoot = resolve(appRoot, '..');
  const localSourcePath = join(appRoot, 'src', 'live', 'simtrade_multi_full_closure_rounds.js');
  const legacySourcePath = join(workspaceRoot, 'scripts', 'simtrade_multi_full_closure_rounds.js');
  const sourcePath = existsSync(localSourcePath) ? localSourcePath : legacySourcePath;
  const runtimeRoot = existsSync(localSourcePath) ? appRoot : workspaceRoot;
  let source = await readFile(sourcePath, 'utf8');
  const legacyRounds = plan.rounds.map(mapPlanToLegacyRound);
  const legacyAccounts = [...new Set(legacyRounds.flatMap(round => [round.exporter, round.importer, round.factory]))];

  source = source.replace(
    /const root = path\.resolve\(__dirname, '\.\.'\);\s*const outDir = path\.join\(root, 'simtradebook'\);/,
    `const root = ${JSON.stringify(runtimeRoot)};\nconst outDir = ${JSON.stringify(runDir)};`
  );
  source = source.replace(/const accounts = \[[\s\S]*?\];/, `const accounts = ${JSON.stringify(legacyAccounts)};`);
  source = source.replace(/const passwords = \{[\s\S]*?\};/, `const passwords = JSON.parse(process.env.AUTOSIMTRADE_CREDENTIALS || '{}');`);
  source = source.replace(/const rounds = \[[\s\S]*?\];\s*const results = \[\];/, `const rounds = ${JSON.stringify(legacyRounds, null, 2)};\n\nconst results = [];`);
  source = source.replace(/if \(completed\.length >= 10\) break;/g, `if (completed.length >= ${legacyRounds.length}) break;`);

  const compatPath = join(runDir, 'legacy-live-runner.cjs');
  await writeFile(compatPath, source, 'utf8');
  const baseUrl = process.env.AUTOSIMTRADE_BASE_URL || 'http://10.14.60.254/simtrade/';
  const headed = /^(1|true|yes)$/i.test(String(process.env.AUTOSIMTRADE_HEADED || '').trim()) ? '1' : '0';
  emit({ level: 'info', message: `live legacy runner generated: ${compatPath}` });
  emit({ level: 'info', message: `simtrade base: ${baseUrl} headed=${headed}` });

  const child = spawn(process.execPath, [compatPath], {
    cwd: runtimeRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      AUTOSIMTRADE_BASE_URL: baseUrl,
      AUTOSIMTRADE_HEADED: headed
    }
  });

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', data => {
    for (const line of data.split(/\r?\n/).filter(Boolean)) {
      emit({ level: 'live', message: line });
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', data => emit({ level: 'error', message: data.trim() }));

  const code = await new Promise(resolve => child.on('exit', resolve));
  if (code !== 0) throw new Error(`legacy live runner exited with ${code}`);

  const resultPath = join(runDir, 'multi_full_closure_results.json');
  const result = JSON.parse(await readFile(resultPath, 'utf8'));
  await updateAccountState(appRoot, plan, result);
  return result;
}

async function main() {
  const plan = JSON.parse(await readFile(join(runDir, 'plan.json'), 'utf8'));
  emit({ level: 'info', message: `loaded PDF-first plan: ${plan.rounds.length} round(s)` });

  if (live) {
    await saveCheckpoint(runDir, { runId, status: 'live-started' });
    const liveResult = await runLegacyCompat(plan);
    await writeFile(join(runDir, 'summary.json'), JSON.stringify({
      runId,
      live,
      summary: {
        completed: liveResult.completed?.length || 0,
        failed: liveResult.failed?.length || 0,
        finalRatings: liveResult.finalRatings || [],
        results: liveResult.results || []
      }
    }, null, 2), 'utf8');
    await saveCheckpoint(runDir, { runId, status: 'live-done' });
    emit({ level: 'ok', message: `live run ${runId} finished`, completed: liveResult.completed?.length || 0, failed: liveResult.failed?.length || 0 });
    return;
  }

  const summary = [];
  for (const round of plan.rounds) {
    const result = await runRound(round);
    summary.push({ round: round.index, contractNo: round.contractNo, result });
  }

  await writeFile(join(runDir, 'summary.json'), JSON.stringify({ runId, live, summary }, null, 2), 'utf8');
  emit({ level: 'ok', message: `run ${runId} finished`, summary });
}

main().catch(async err => {
  await appendEvent(runDir, { runId, status: 'fatal', message: err.message, stack: err.stack });
  emit({ level: 'error', message: err.message, stack: err.stack });
  process.exit(1);
});
