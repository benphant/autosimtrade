const $ = selector => document.querySelector(selector);
const logs = $('#logs');
const planView = $('#planView');
const statusEl = $('#status');
const runBtn = $('#runBtn');
let currentRunId = null;

function selected(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
}

function payload() {
  const accounts = [];
  const credentials = {};
  for (const i of [1, 2, 3, 4, 5]) {
    const account = document.querySelector(`#account${i}`).value.trim();
    const password = document.querySelector(`#password${i}`).value;
    if (!account) continue;
    accounts.push(account);
    credentials[account] = password || '';
  }
  return {
    accounts,
    credentials,
    rounds: Number(document.querySelector('#rounds').value || 1),
    mode: 'guide-coverage',
    payments: ['L/C', 'D/P', 'D/A', 'T/T'],
    terms: ['CIF', 'CFR', 'FOB'],
    baseUrl: document.querySelector('#baseUrl').value.trim(),
    headed: document.querySelector('#headed').checked,
    live: true
  };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function appendLog(line) {
  logs.textContent += `${line}\n`;
  logs.scrollTop = logs.scrollHeight;
}

function setRunning(runId, plan) {
  currentRunId = runId;
  runBtn.disabled = true;
  runBtn.textContent = '运行中';
  statusEl.textContent = `运行中：${runId}`;
  if (plan) planView.textContent = JSON.stringify(plan, null, 2);
}

function setIdle(message = '未运行') {
  currentRunId = null;
  runBtn.disabled = false;
  runBtn.textContent = '开始运行';
  statusEl.textContent = message;
}

async function refreshStatus() {
  try {
    const response = await fetch('/api/status');
    const status = await response.json();
    const running = (status.activeRuns || []).find(run => run.status === 'running' || run.status === 'stopping');
    if (running) setRunning(running.runId, running.plan);
    else if (!currentRunId) setIdle('未运行');
  } catch (err) {
    statusEl.textContent = `状态读取失败：${err.message}`;
  }
}

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  runBtn.textContent = '运行中';
  statusEl.textContent = '正在启动...';
  logs.textContent = '';
  try {
    const run = await postJson('/api/run', payload());
    setRunning(run.runId, run.plan);
  } catch (err) {
    statusEl.textContent = `启动失败：${err.message}`;
    await refreshStatus();
  }
});

const events = new EventSource('/api/events');
events.onmessage = event => {
  const data = JSON.parse(event.data);
  if (data.type === 'snapshot') {
    const running = (data.activeRuns || []).find(run => run.status === 'running' || run.status === 'stopping');
    if (running) setRunning(running.runId, running.plan);
    for (const oldEvent of data.events || []) {
      if (oldEvent.type === 'log') {
        const item = oldEvent.event;
        appendLog(`[${item.level || 'info'}] ${item.message || JSON.stringify(item)}`);
      }
    }
    return;
  }
  if (data.type === 'run-started') {
    setRunning(data.run.runId, data.run.plan);
  }
  if (data.type === 'run-finished') {
    setIdle(`已结束：${data.runId}，退出码 ${data.code}`);
  }
  if (data.type === 'log') {
    const item = data.event;
    appendLog(`[${item.level || 'info'}] ${item.message || JSON.stringify(item)}`);
  }
};

events.onerror = () => {
  statusEl.textContent = currentRunId ? `运行中：${currentRunId}，日志连接重试中` : '日志连接重试中';
};

refreshStatus();
setInterval(refreshStatus, 5000);
