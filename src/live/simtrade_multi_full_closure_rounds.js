const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const defaultBase = 'http://10.14.60.254/simtrade/';
const edgeCandidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

function normalizeBase(value) {
  let raw = String(value || '').trim().replace(/[\r\n]/g, '') || defaultBase;
  raw = raw.replace(/\/login\.aspx\/?$/i, '');
  if (!raw.endsWith('/')) raw += '/';
  return raw;
}

function isHeaded() {
  return /^(1|true|yes)$/i.test(String(process.env.AUTOSIMTRADE_HEADED || '').trim());
}

function browserLaunchOptions() {
  const headless = !isHeaded();
  for (const candidate of edgeCandidates) {
    if (fs.existsSync(candidate)) return { headless, executablePath: candidate };
  }
  console.log('Edge not found; falling back to bundled Chromium');
  return { headless };
}

const base = normalizeBase(process.env.AUTOSIMTRADE_BASE_URL || defaultBase);
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'simtradebook');

const roleNames = { 1: '出口商', 2: '进口商', 3: '工厂', 4: '出口地银行', 5: '进口地银行' };
const accounts = ['2023060136', '2023060066', '2023060140', '2023060053', '2023060028'];
const passwords = {};

const product = {
  no: '01001',
  cn: '洋菇罐头(整粒) 每箱24罐，每罐425克',
  en: 'CANNED WHOLE MUSHROOMS 425Gx24TINS/CTN',
  hs: '2003101100',
  unit: 'CARTON',
};

const rounds = [
  { idx: 1, exporter: '2023060053', importer: '2023060028', factory: '2023060066', payment: 'D/P', term: 'CFR', qty: 90, price: 8.2, domestic: 35.4, port: 'BOMBAY', country: 'INDIA' },
  { idx: 2, exporter: '2023060028', importer: '2023060053', factory: '2023060066', payment: 'D/A', term: 'FOB', qty: 90, price: 7.8, domestic: 35.2, port: 'JAKARTA', country: 'INDONESIA' },
  { idx: 3, exporter: '2023060066', importer: '2023060053', factory: '2023060028', payment: 'T/T', term: 'CIF', qty: 100, price: 8.5, domestic: 35.6, port: 'BOMBAY', country: 'INDIA' },
  { idx: 4, exporter: '2023060053', importer: '2023060136', factory: '2023060028', payment: 'L/C', term: 'CIF', qty: 100, price: 8.6, domestic: 35.8, port: 'HAMBURG', country: 'GERMANY' },
  { idx: 5, exporter: '2023060028', importer: '2023060066', factory: '2023060140', payment: 'D/P', term: 'FOB', qty: 100, price: 8.0, domestic: 35.5, port: 'BOMBAY', country: 'INDIA' },
  { idx: 6, exporter: '2023060066', importer: '2023060028', factory: '2023060140', payment: 'D/A', term: 'CFR', qty: 110, price: 8.4, domestic: 35.7, port: 'JAKARTA', country: 'INDONESIA' },
  { idx: 7, exporter: '2023060140', importer: '2023060053', factory: '2023060066', payment: 'T/T', term: 'CFR', qty: 100, price: 8.3, domestic: 35.5, port: 'BOMBAY', country: 'INDIA' },
  { idx: 8, exporter: '2023060053', importer: '2023060140', factory: '2023060028', payment: 'D/P', term: 'CIF', qty: 100, price: 8.7, domestic: 35.9, port: 'JAKARTA', country: 'INDONESIA' },
  { idx: 9, exporter: '2023060028', importer: '2023060136', factory: '2023060066', payment: 'D/A', term: 'CIF', qty: 110, price: 8.8, domestic: 36.0, port: 'HAMBURG', country: 'GERMANY' },
  { idx: 10, exporter: '2023060136', importer: '2023060053', factory: '2023060028', payment: 'T/T', term: 'FOB', qty: 90, price: 8.1, domestic: 35.4, port: 'BOMBAY', country: 'INDIA' },
  { idx: 11, exporter: '2023060053', importer: '2023060066', factory: '2023060140', payment: 'D/P', term: 'CFR', qty: 100, price: 8.3, domestic: 35.5, port: 'BOMBAY', country: 'INDIA' },
  { idx: 12, exporter: '2023060028', importer: '2023060140', factory: '2023060066', payment: 'T/T', term: 'CIF', qty: 100, price: 8.6, domestic: 35.8, port: 'JAKARTA', country: 'INDONESIA' },
];

const results = [];

function uid(account, role) {
  return `${account}${role}`;
}

function rootCode(account) {
  return account;
}

const importerDest = {
  '2023060028': { country: 'Morocco', port: 'CASABLANCA' },
  '2023060053': { country: 'Italy', port: 'GENOA' },
  '2023060066': { country: 'India', port: 'BOMBAY' },
  '2023060136': { country: 'Indonesia', port: 'JAKARTA' },
  '2023060140': { country: 'Italy', port: 'GENOA' },
};

function moneyWords(amount) {
  const rounded = Number(amount).toFixed(2);
  return `SAY US DOLLARS ${rounded} ONLY.`;
}

function cleanText(text, max = 1400) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function log(step, text, extra = {}) {
  const item = { time: new Date().toISOString(), step, text: cleanText(text), ...extra };
  results.push(item);
  console.log(`[${item.time}] ${step}: ${item.text}`);
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setTag(xml, tag, value, parent) {
  const val = esc(value);
  const full = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`);
  const empty = new RegExp(`<${tag}\\s*\\/>`);
  if (full.test(xml)) return xml.replace(full, `<${tag}>${val}</${tag}>`);
  if (empty.test(xml)) return xml.replace(empty, `<${tag}>${val}</${tag}>`);
  return xml.replace(`</${parent}>`, `<${tag}>${val}</${tag}></${parent}>`);
}

function frameScopes(page) {
  const main = page.mainFrame();
  return [main, ...page.frames().filter((frame) => frame !== main)];
}

function frameList(page) {
  return page.frames().map((frame) => frame.url() || frame.name() || '(empty)').join(' | ');
}

async function findVisible(page, selector, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of frameScopes(page)) {
      const locator = frame.locator(selector).first();
      const visible = await locator.isVisible().catch(() => false);
      if (visible) return locator;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await page.waitForTimeout(Math.min(250, remaining));
  }
  return null;
}

async function failLogin(page, reason) {
  const frames = frameList(page);
  let screenshot = '';
  try {
    fs.mkdirSync(outDir, { recursive: true });
    screenshot = path.join(outDir, 'login-timeout.png');
    await page.screenshot({ path: screenshot, fullPage: true });
  } catch (err) {
    screenshot = `unavailable (${err.message})`;
  }
  const hint = String(page.url() || '').toLowerCase().includes('login.aspx')
    ? ''
    : ' Landed page is not login.aspx; check the SimTrade base URL.';
  throw new Error(`${reason}${hint} url=${page.url()} frames=${frames} screenshot=${screenshot}`);
}

async function selectLoginRole(scope, role) {
  const roleValue = String(role);
  const roleLink = scope.locator(`#role${roleValue}`);
  if (await roleLink.count().catch(() => 0) && await roleLink.first().isVisible().catch(() => false)) {
    await roleLink.first().click({ noWaitAfter: true });
    const hiddenRole = scope.locator('input#cblUsrCls').first();
    if (await scope.locator('input#cblUsrCls').count().catch(() => 0)) {
      const current = await hiddenRole.inputValue().catch(() => '');
      if (current !== roleValue) {
        await hiddenRole.evaluate((el, value) => {
          el.value = value;
        }, roleValue);
      }
    }
    return;
  }
  const roleSelect = scope.locator('select#cblUsrCls');
  if (await roleSelect.count().catch(() => 0)) {
    await roleSelect.first().selectOption(roleValue);
    return;
  }
  const hiddenRole = scope.locator('#cblUsrCls');
  if (await hiddenRole.count().catch(() => 0)) {
    await hiddenRole.first().evaluate((el, value) => {
      el.value = value;
    }, roleValue);
    return;
  }
  throw new Error(`role control not found for role ${roleValue}`);
}

async function login(page, account, role) {
  await page.context().clearCookies();
  const loginUrl = base + 'login.aspx';
  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (err) {
    throw new Error(`Could not open login page ${loginUrl}. ${err.message}`);
  }
  console.log('login url:', page.url());

  const user = await findVisible(page, '#txtUsrName');
  if (!user) await failLogin(page, '#txtUsrName not found.');
  await user.fill(account);

  const handle = await user.elementHandle();
  const scope = (handle && await handle.ownerFrame()) || page.mainFrame();
  if (handle) await handle.dispose().catch(() => {});

  try {
    await selectLoginRole(scope, role);
  } catch (err) {
    await failLogin(page, err.message);
  }

  await scope.locator('#txtUsrPwd').fill(passwords[account] || '');
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    scope.locator('#btnLogin').click(),
  ]);
  await page.waitForTimeout(350);
}

async function bodyText(page, max = 1400) {
  return cleanText(await page.locator('body').innerText().catch(() => ''), max);
}

async function profile(page, account, role) {
  await login(page, account, role);
  await page.goto(base + `Common/CastInfo.aspx?cls=${role}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(150);
  const data = await page.evaluate(() => {
    const v = (sel) => document.querySelector(sel)?.value?.trim() || '';
    return {
      cn: v('#txtB0306'),
      shortCn: v('#txtB0348') || v('#txtB0306'),
      en: v('#txtB0307'),
      shortEn: v('#txtB0349') || v('#txtB0307'),
      legalCn: v('#txtB0305'),
      legalEn: v('#txtB0345') || v('#txtB0305'),
      tel: v('#txtB0312'),
      fax: v('#txtB0313'),
      zip: v('#txtB0311'),
      addrCn: v('#txtB0308'),
      addrEn: v('#txtB0309'),
      code: v('#txtB0303') || '',
      bankAccount: v('#txtB0328') || '',
      customsCode: v('#txtB0340') || '',
      country: v('#txtB0337') || '',
    };
  });
  const prefix = `A${account.slice(-3)} R${role}`;
  if (!data.cn) data.cn = `${prefix}${roleNames[role]}`;
  if (!data.en || data.en.length < 3) data.en = `${prefix} ${roleNames[role]} Co., Ltd.`;
  if (!data.shortCn) data.shortCn = data.cn.slice(0, 8);
  if (!data.shortEn) data.shortEn = data.en.split(/\s+/).slice(0, 2).join(' ');
  if (!data.legalCn) data.legalCn = role === 2 ? '林进口' : role === 3 ? '王制造' : '陈出口';
  if (!data.legalEn) data.legalEn = 'SimTrade Operator';
  if (!data.tel) data.tel = `025-${account.slice(-4)}${role}`;
  if (!data.fax) data.fax = `025-${account.slice(-4)}${role + 5}`;
  if (!data.zip) data.zip = '210000';
  if (!data.addrCn) data.addrCn = `实训路${account.slice(-3)}号${roleNames[role]}办公室`;
  if (!data.addrEn) data.addrEn = `Room ${role}01, SimTrade Road ${account.slice(-3)}, China`;
  if (!data.code) data.code = `00000${account.slice(-3)}-${role}`;
  if (!data.bankAccount) data.bankAccount = `000000000000${account.slice(-3)}`;
  if (!data.customsCode) data.customsCode = `0000000${account.slice(-3)}`;
  data.uid = uid(account, role);
  data.account = account;
  data.role = role;
  return data;
}

async function loadProfiles(page) {
  const out = {};
  for (const account of accounts) {
    out[account] = {};
    for (const role of [1, 2, 3, 4, 5]) out[account][role] = await profile(page, account, role);
  }
  return out;
}

async function currentRating(page, account, role) {
  await login(page, account, role);
  await page.waitForTimeout(450);
  const frames = page.frames();
  for (const frame of frames) {
    const found = await frame.locator('img').evaluateAll((imgs) => {
      for (const img of imgs) {
        const s = img.getAttribute('src') || '';
        const a = img.getAttribute('alt') || '';
        const m = (s + ' ' + a).match(/score(\d+)|等级[:：]\s*(\d+)/i);
        if (m) return Number(m[1] || m[2]);
      }
      return null;
    }).catch(() => null);
    if (found !== null) return found;
  }
  return 0;
}

async function ratingSnapshot(page, label, roundIdx = null) {
  const rows = [];
  for (const account of accounts) {
    for (const role of [1, 2, 3]) {
      rows.push({ account, role, roleName: roleNames[role], rating: await currentRating(page, account, role) });
    }
  }
  log(label, JSON.stringify(rows), roundIdx ? { round: roundIdx } : {});
  return rows;
}

async function getXml(page, type, docNo) {
  const raw = await (await page.request.get(base + `doc/Xml/Document.aspx?a1=${type}&a2=${docNo}`)).text();
  const start = raw.indexOf('<ROOT>');
  if (start < 0) return '';
  return raw.slice(start);
}

async function saveDoc(page, type, docNo, docUid, values, detail = '', stripChildren = []) {
  let xml = await getXml(page, type, docNo);
  if (!xml) throw new Error(`No XML for ${type}/${docNo}`);
  for (const [tag, value] of Object.entries(values)) xml = setTag(xml, tag, value, type);
  for (const child of stripChildren) xml = xml.replace(new RegExp(`<${child}>[\\s\\S]*?<\\/${child}>`, 'g'), '');
  if (detail) xml = xml.replace('</ROOT>', `${detail}</ROOT>`);
  const resp = await page.request.post(base + `doc/PostForm.aspx?tb=${type}&uid=${docUid}`, {
    data: xml,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  });
  const text = await resp.text();
  log(`save ${type}`, `${docNo} ${text}`);
  return text;
}

async function listNotes(page, contractNo, op) {
  await page.goto(base + `Common/NoteList.aspx?op=${op}&id=${contractNo}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(250);
  const rows = await page.locator('tr').evaluateAll((trs) => trs.map((tr) => {
    const mark = tr.querySelector('input[name=mark]')?.value || '';
    const text = tr.innerText.replace(/\s+/g, ' ').trim();
    const type = mark.split(',')[1] || '';
    const docNo = (text.match(/\b(?:EXP|ST|DOM)[A-Z0-9]*\d{3,}\b/) || [])[0] || '';
    const linkIds = Array.from(tr.querySelectorAll('a')).map((a) => ({ id: a.id, text: a.innerText.trim() }));
    return { mark, type, docNo, text, linkIds };
  }).filter((r) => r.mark && r.text)).catch(() => []);
  const seen = new Set();
  return rows.filter((r) => {
    const key = `${r.mark}|${r.docNo}|${r.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function ensureDoc(page, contractNo, flag, xmlType, op = 'E2') {
  let notes = await listNotes(page, contractNo, op);
  const existing = notes.find((r) => r.type === flag || r.type === xmlType);
  if (existing) return existing.docNo;
  await page.goto(base + `Export/E2_AddNote.aspx?id=${contractNo}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ flag, contractNo }) => {
    const form = document.forms[0];
    const set = (name, value) => {
      let el = document.querySelector(`[name="${name}"]`) || document.querySelector(`#${name}`);
      if (!el) {
        el = document.createElement('input');
        el.type = 'hidden';
        el.name = name;
        form.appendChild(el);
      }
      el.value = value;
    };
    const radio = Array.from(document.querySelectorAll('input[name=mark]')).find((r) => r.value === flag);
    if (radio) radio.checked = true;
    set('flag', flag);
    set('flag1', contractNo);
  }, { flag, contractNo });
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    page.click('#btnOk'),
  ]);
  await page.waitForTimeout(650);
  notes = await listNotes(page, contractNo, op);
  const created = notes.find((r) => r.type === flag || r.type === xmlType);
  if (!created) throw new Error(`Could not create ${flag} for ${contractNo}`);
  log('add doc', `${flag} -> ${created.docNo}`, { contract: contractNo });
  return created.docNo;
}

async function doPost(page, url, label, round) {
  await page.goto(base + url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  const text = await bodyText(page);
  log(label, text, { round: round.idx, contract: round.contractNo });
  return text;
}

async function checkDoc(page, contractNo, op, type, round) {
  const notes = await listNotes(page, contractNo, op);
  const row = notes.find((r) => r.type === type);
  const checkId = row?.linkIds.find((l) => /lbtn1$/.test(l.id))?.id;
  if (!checkId) {
    log(`check skip ${type}`, 'no check link', { round: round.idx, contract: contractNo });
    return '';
  }
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    page.click(`#${checkId}`),
  ]);
  await page.waitForTimeout(850);
  const text = await bodyText(page, 900);
  log(`check ${type}`, text, { round: round.idx, contract: contractNo });
  return text;
}

async function submitNoteList(page, contractNo, op, neededTypes, label, round) {
  await page.goto(base + `Common/NoteList.aspx?op=${op}&id=${contractNo}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(250);
  const selected = await page.evaluate((neededTypes) => {
    const picked = [];
    for (const cb of document.querySelectorAll('input[name="mark"]')) {
      const type = cb.value.split(',')[1];
      if (neededTypes.includes(type)) {
        cb.checked = true;
        picked.push(cb.value);
      }
    }
    const flag = document.querySelector('[name=flag]');
    if (flag) flag.value = picked.join('|');
    if (typeof GetID === 'function') GetID();
    return { flag: document.querySelector('[name=flag]')?.value || '', picked };
  }, neededTypes);
  log(`${label} select`, JSON.stringify(selected), { round: round.idx, contract: contractNo });
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    page.click('#_ctl0_btnOk'),
  ]);
  await page.waitForTimeout(1100);
  const text = await bodyText(page, 1100);
  log(label, text, { round: round.idx, contract: contractNo });
  return text;
}

function marketMessage(kind, round, roleLabel, adType = '产品') {
  const lead = `${product.cn}，商品编号${product.no}，HS ${product.hs}`;
  if (kind === 'ad' && roleLabel === '出口商') {
    if (adType === '公司') {
      return `本公司长期经营食品罐头类出口业务，熟悉${round.payment}结算、${round.term}贸易术语、出口预算、订舱、报检、保险、报关、提单和结汇核销流程。可根据进口商目的港${round.port}安排单证和装运衔接，重视合同履约、单据一致和交期控制，欢迎建立稳定外贸合作关系。`;
    }
    return `出口供应${lead}。本轮可供${round.qty} ${product.unit}，出口包装为425Gx24TINS/CTN，计划上海港装运，目的港${round.port}，价格条件${round.term}，付款方式${round.payment}。可配合商业发票、装箱单、产地证、保险单、海运提单、汇票等单据要求，适合按指导书完成完整出口履约。`;
  }
  if (kind === 'ad' && roleLabel === '工厂') {
    if (adType === '公司') {
      return `本厂专注罐头食品生产和出口备货配套，能够按外销合同要求组织生产、检验包装、放货和缴税。可与出口商签订国内买卖合同，配合交货期、数量、包装规格和税务资料，保证后续报检、报关和装船环节有稳定货源。`;
    }
    return `工厂供应${lead}。本轮计划生产${round.qty} ${product.unit}，国内单价RMB ${round.domestic.toFixed(2)}，包装稳定、数量明确，可按出口商外销合同${round.contractNo}的交货节奏备货，支持国内采购合同、生产、放货和缴税手续。`;
  }
  if (kind === 'info' && roleLabel === '进口商') {
    return `采购需求：拟进口${lead}，数量约${round.qty} ${product.unit}，目的港${round.port}，希望采用${round.payment}结算和${round.term}条件。重点关注报价有效期、装运期、保险责任、单据完整性、进口报检报关、缴税提货及后续销货安排，请出口商按完整外贸流程报价。`;
  }
  if (kind === 'info' && roleLabel === '出口商') {
    return `出口供盘准备：我方可组织${lead}出口业务，计划数量${round.qty} ${product.unit}，从上海港发运至${round.port}。报价将综合国内采购价、海运费、保险费、报检报关费用和退税因素，付款方式按${round.payment}办理，单据按合同和结算方式准备。`;
  }
  if (kind === 'info' && roleLabel === '工厂') {
    return `供应信息：本厂可按出口商备货要求生产${lead}，数量${round.qty} ${product.unit}，国内成交价RMB ${round.domestic.toFixed(2)}。可配合国内买卖合同、生产入库、放货和缴税，并保证包装、品名、数量与后续外销单据保持一致。`;
  }
  return `${roleLabel}围绕${lead}发布${round.payment}+${round.term}业务信息，重点跟进询盘、报价、合同、单证和履约。`;
}

async function postInfoOrAd(page, kind, round, roleLabel, adType = '产品') {
  const isAd = kind === 'ad';
  await page.goto(base + (isAd ? 'Common/Adv.aspx' : 'Common/Info.aspx'), { waitUntil: 'domcontentloaded' });
  const text = marketMessage(kind, round, roleLabel, adType);
  if (isAd) {
    await page.fill('#txtA0303', `${roleLabel}${adType}广告 ${round.payment} ${round.term} ${product.no}`);
    await page.fill('#txtA0305', `${roleLabel}${adType} ${product.no} ${round.port}`);
    await page.selectOption('#txtA0310', adType).catch(() => {});
    if (adType === '产品') await page.selectOption('#txtA0311', product.no).catch(() => {});
    await page.fill('#txtA0304', text);
  } else {
    await page.fill('#txtA0103', `${roleLabel} ${round.payment} ${round.term} ${product.no} 交易信息`);
    await page.fill('#txtA0105', `${roleLabel} ${product.no} ${round.port}`);
    await page.selectOption('#txtA0111', '1').catch(() => {});
    await page.fill('#txtA0104', text);
  }
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    page.click('#btnOk'),
  ]);
  await page.waitForTimeout(500);
  log(isAd ? `post ${roleLabel} ${adType} ad` : `post ${roleLabel} info`, `${roleLabel} ${await bodyText(page, 650)}`, { round: round.idx, contract: round.contractNo });
}

function enrichRound(raw) {
  const amount = raw.qty * raw.price;
  const gross = raw.qty * 11.2;
  const net = raw.qty * 10.2;
  const cbm = raw.qty * 0.014739;
  const suffix = String(200 + raw.idx).padStart(3, '0');
  const dest = importerDest[raw.importer] || { country: raw.country || 'India', port: raw.port || 'BOMBAY' };
  return {
    ...raw,
    term: ['CIF', 'CFR', 'FOB'].includes(raw.term) ? raw.term : 'CIF',
    contractNo: `EXP260425${suffix}`,
    domesticNo: `DOM260425${suffix}`,
    amount,
    gross,
    net,
    cbm,
    shipDate: '2026-05-20',
    latestShip: '2026-05-31',
    expire: '2026-06-30',
    portFrom: 'SHANGHAI',
    port: dest.port,
    country: dest.country,
  };
}

async function createSaleContract(page, round, P) {
  const ex = P[round.exporter][1];
  const im = P[round.importer][2];
  await login(page, round.exporter, 1);
  await page.goto(base + 'export/E2_Contract_add.aspx', { waitUntil: 'domcontentloaded' });
  await page.fill('#txtM0701', round.contractNo);
  await page.fill('#txtM0739', rootCode(round.importer));
  await page.fill('#txtM0742', rootCode(round.exporter));
  await page.check('#chkMain').catch(() => {});
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    page.click('#btnOk'),
  ]);
  await page.waitForTimeout(700);
  let xml = await getXml(page, 'M07', round.contractNo);
  if (!xml) throw new Error(`sale contract not created ${round.contractNo}`);
  const values = {
    M0706: 'S/C',
    M0707: ex.en,
    M0708: ex.addrEn,
    M0709: `${im.cn}\n${im.addrCn}`,
    M0710: 'We are pleased to confirm this SimTrade sale under the following terms.',
    M0711: '2026-04-25',
    M0712: round.term,
    M0713: round.term === 'FOB' ? round.portFrom : round.port,
    M0714: String(round.qty),
    M0715: product.unit,
    M0717: 'USD',
    M0718: round.amount.toFixed(2),
    M0719: moneyWords(round.amount),
    M0720: round.payment,
    M0721: '425Gx24TINS/CTN',
    M0722: round.portFrom,
    M0723: round.port,
    M0724: `Shipment before ${round.latestShip}; partial shipment and transshipment allowed.`,
    M0725: 'N/M',
    M0726: 'Quality to be in conformity with agreed specification.',
    M0727: round.term === 'CIF' ? 'Insurance to be covered by seller for 110% of invoice value.' : 'Insurance to be arranged according to the trade term.',
    M0729: 'This contract is made for SimTrade foreign trade practice.',
    M0730: im.cn,
    M0731: im.legalCn,
    M0732: ex.en,
    M0733: ex.legalEn,
    M0734: 'SALES CONFIRMATION',
    M0735: round.payment === 'D/A' ? 'D/A 30 DAYS' : round.payment === 'T/T' ? 'T/T AFTER SHIPMENT' : 'AT SIGHT',
    M0736: uid(round.exporter, 1),
    M0739: uid(round.importer, 2),
    M0742: uid(round.exporter, 4),
    M0745: uid(round.importer, 5),
    M0748: round.gross.toFixed(0),
    M0749: round.net.toFixed(0),
    M0750: round.cbm.toFixed(3),
    M0751: '1',
    M0752: '1',
    M0753: String(2700 + round.idx),
    M0754: (round.qty * 0.04488).toFixed(2),
    M0755: (round.amount * 0.538853).toFixed(2),
    M0756: round.amount.toFixed(2),
    M0759: 'Y',
    M0760: 'Y',
  };
  for (const [tag, value] of Object.entries(values)) xml = setTag(xml, tag, value, 'M07');
  xml = xml.replace(/<M08>[\s\S]*?<\/M08>/g, '');
  const detail = [
    '<M08>',
    `<M0801>${round.contractNo}</M0801>`,
    '<M0802 />',
    `<M0803>${product.no}</M0803>`,
    `<M0804>${product.en}</M0804>`,
    `<M0805>${round.qty}</M0805>`,
    `<M0806>${product.unit}</M0806>`,
    '<M0807>USD</M0807>',
    `<M0808>${round.price.toFixed(2)}</M0808>`,
    `<M0809>${round.amount.toFixed(2)}</M0809>`,
    `<M0810>${round.gross.toFixed(0)}</M0810>`,
    `<M0811>${round.net.toFixed(0)}</M0811>`,
    `<M0812>${round.cbm.toFixed(3)}</M0812>`,
    `<M0813>${round.qty}</M0813>`,
    '</M08>',
  ].join('');
  xml = xml.replace('</ROOT>', `${detail}</ROOT>`);
  const resp = await page.request.post(base + `doc/PostForm.aspx?tb=M07&uid=${uid(round.exporter, 1)}`, {
    data: xml,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  });
  log('save M07', `${round.contractNo} ${await resp.text()}`, { round: round.idx, contract: round.contractNo });
  await doPost(page, `export/ExportDoPost.aspx?cls=E202&id=${round.contractNo}`, 'export check sale contract', round);
}

async function saveBudgets(page, round) {
  await login(page, round.exporter, 1);
  const m50a = await ensureDoc(page, round.contractNo, 'M50A', 'M50', 'E2');
  await saveDoc(page, 'M50', m50a, uid(round.exporter, 1), {
    M5006: round.contractNo,
    M5007: (round.amount * 7.05).toFixed(2),
    M5008: (round.qty * round.domestic).toFixed(2),
    M5009: (round.amount * 7.05).toFixed(2),
    M5010: '180.00',
    M5011: '120.00',
    M5012: '120.00',
    M5013: '800.00',
    M5014: round.term === 'CIF' ? '180.00' : '0.00',
    M5015: '80.00',
    M5016: '160.00',
    M5017: '120.00',
    M5018: (round.amount * 0.08).toFixed(2),
    M5019: (round.amount * 7.05 - round.qty * round.domestic - 1600).toFixed(2),
  });
  await doPost(page, `export/ExportDoPost.aspx?cls=E204&id=${round.contractNo}`, 'send sale contract to importer', round);

  await login(page, round.importer, 2);
  const m50b = await ensureDoc(page, round.contractNo, 'M50B', 'M50', 'I2');
  await saveDoc(page, 'M50', m50b, uid(round.importer, 2), {
    M5006: round.contractNo,
    M5007: round.amount.toFixed(2),
    M5008: round.amount.toFixed(2),
    M5009: round.term === 'CIF' ? '0.00' : '120.00',
    M5010: '100.00',
    M5011: '120.00',
    M5012: '300.00',
    M5013: (round.amount * 1.2).toFixed(2),
    M5014: '0.00',
    M5015: '180.00',
    M5016: '80.00',
    M5017: '100.00',
    M5018: '80.00',
    M5019: (round.amount * 0.15).toFixed(2),
  });
  await doPost(page, `Import/importDoPost.aspx?cls=I202&id=${round.contractNo}`, 'import check sale contract', round);
  await page.goto(base + 'export/E2_Contract_confirm.aspx', { waitUntil: 'domcontentloaded' });
  await page.fill('#txtM0701', round.contractNo);
  await page.fill('#txtBankName', rootCode(round.importer));
  await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click('#btnOk')]);
  await page.waitForTimeout(850);
  log('import confirm sale contract', await bodyText(page), { round: round.idx, contract: round.contractNo });
}

async function createDomesticAndProduce(page, round, P) {
  const ex = P[round.exporter][1];
  const fa = P[round.factory][3];
  await login(page, round.exporter, 1);
  await page.goto(base + 'Export/E3_Contract_add.aspx', { waitUntil: 'domcontentloaded' });
  await page.fill('#txtM1201', round.domesticNo);
  await page.fill('#txtM1245', rootCode(round.factory));
  await page.check('#chkMain').catch(() => {});
  await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click('#btnOk')]);
  await page.waitForTimeout(650);
  let xml = await getXml(page, 'M12', round.domesticNo);
  if (!xml) throw new Error(`domestic contract not created ${round.domesticNo}`);
  const total = round.qty * round.domestic;
  const values = {
    M1206: round.contractNo,
    M1207: fa.cn,
    M1208: ex.cn,
    M1209: '2026-04-25',
    M1210: '南京',
    M1211: product.unit,
    M1212: String(round.qty),
    M1214: total.toFixed(2),
    M1216: `按外销合同${round.contractNo}备货，${round.qty} ${product.unit} 于2026年5月内交付。`,
    M1217: `${total.toFixed(2)}元整`,
    M1218: '本合同用于外销备货，包装和质量须符合出口流通要求。',
    M1219: '质量符合出口优级品标准。',
    M1220: '工厂交货。',
    M1221: '由供方送至需方指定仓库。',
    M1222: '纸箱包装符合出口标准。',
    M1223: '需方按出口标准验收。',
    M1224: '凭发票及票据结算。',
    M1225: '违约方承担相应违约责任。',
    M1226: '协商解决。',
    M1227: fa.cn,
    M1228: fa.addrCn,
    M1229: fa.legalCn,
    M1230: fa.tel,
    M1231: fa.code,
    M1232: 'SimTrade工厂结算账户',
    M1233: fa.bankAccount,
    M1234: fa.zip,
    M1235: ex.cn,
    M1236: ex.addrCn,
    M1237: ex.legalCn,
    M1238: ex.tel,
    M1239: ex.code,
    M1240: 'SimTrade出口商结算账户',
    M1241: ex.bankAccount,
    M1242: ex.zip,
  };
  for (const [tag, value] of Object.entries(values)) xml = setTag(xml, tag, value, 'M12');
  xml = xml.replace(/<M13>[\s\S]*?<\/M13>/g, '');
  const detail = [
    '<M13>',
    `<M1301>${round.domesticNo}</M1301>`,
    `<M1303>${product.no}</M1303>`,
    `<M1304>${product.cn}</M1304>`,
    `<M1305>${product.unit}</M1305>`,
    `<M1306>${round.qty}</M1306>`,
    `<M1307>${round.domestic.toFixed(2)}</M1307>`,
    `<M1308>${total.toFixed(2)}</M1308>`,
    '</M13>',
  ].join('');
  xml = xml.replace('</ROOT>', `${detail}</ROOT>`);
  const resp = await page.request.post(base + `doc/PostForm.aspx?tb=M12&uid=${uid(round.exporter, 1)}`, {
    data: xml,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  });
  log('save M12', `${round.domesticNo} ${await resp.text()}`, { round: round.idx, contract: round.contractNo });
  await doPost(page, `export/ExportDoPost.aspx?cls=E302&id=${round.domesticNo}`, 'export check domestic', round);
  await doPost(page, `export/ExportDoPost.aspx?cls=E304&id=${round.domesticNo}`, 'send domestic to factory', round);

  await login(page, round.factory, 3);
  await doPost(page, `Factory/FactoryDoPost.aspx?cls=F202&id=${round.domesticNo}`, 'factory check domestic', round);
  await doPost(page, `Factory/FactoryDoPost.aspx?cls=F205&id=${round.domesticNo}`, 'factory confirm domestic', round);
  await page.goto(base + `factory/F3_Produce.aspx?no=${product.no}`, { waitUntil: 'domcontentloaded' });
  await page.fill('#txtINumber', String(round.qty));
  await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click('#btnOk')]);
  await page.waitForTimeout(850);
  log('factory produce goods', await bodyText(page), { round: round.idx, contract: round.contractNo });
  await doPost(page, `Factory/FactoryDoPost.aspx?cls=F206&id=${round.domesticNo}`, 'factory release goods', round);
  await doPost(page, `Factory/FactoryDoPost.aspx?cls=F401&id=${round.domesticNo}`, 'factory tax payment', round);
}

async function fillExportCoreDocs(page, round, docs, P) {
  const ex = P[round.exporter][1];
  const im = P[round.importer][2];
  const exBank = P[round.exporter][4];
  const imBank = P[round.importer][5];
  const exporterBlock = `${ex.en}\n${ex.addrEn}`;
  const importerBlock = `${im.en}\n${im.addrEn}`;
  const lcNo = docs.M30 || '';

  await saveDoc(page, 'M14', docs.M14, uid(round.exporter, 1), {
    M1407: '2026-04-25',
    M1408: round.contractNo,
    M1409: `SHIP${round.contractNo.replace(/\D/g, '').slice(-8)}`,
    M1411: lcNo,
    M1412: imBank.en,
    M1413: `${ex.cn}\n${ex.addrCn}`,
    M1414: round.payment,
    M1415: '一般贸易',
    M1416: round.country,
    M1417: round.payment === 'T/T' ? im.en : 'TO ORDER',
    M1418: 'SEA',
    M1419: round.country,
    M1420: round.latestShip,
    M1421: round.portFrom,
    M1422: importerBlock,
    M1423: round.expire,
    M1424: round.port,
    M1425: 'YES',
    M1426: 'YES',
    M1427: 'YES',
    M1428: 'NO',
    M1429: round.qty,
    M1430: product.unit,
    M1431: round.gross.toFixed(2),
    M1432: 'KGS',
    M1433: round.net.toFixed(2),
    M1434: 'KGS',
    M1435: round.net.toFixed(2),
    M1436: 'KGS',
    M1437: round.amount.toFixed(2),
    M1438: 'USD',
    M1439: `Please arrange shipment before ${round.latestShip}.`,
    M1440: Math.max(round.amount - 100, 1).toFixed(2),
    M1441: 'USD',
    M1442: round.cbm.toFixed(3),
    M1443: 'CBM',
    M1444: round.term === 'CIF' ? 'ALL RISKS AND WAR RISK' : '',
    M1445: 'USD',
    M1446: (round.amount * 1.1).toFixed(2),
    M1447: round.port,
    M1448: ex.customsCode,
    M1449: ex.legalCn,
    M1451: '世格国际货运代理有限公司',
    M1452: '025-84217835',
    M1453: '025-84217836',
    M1454: 'DESUN',
    M1456: ex.cn,
    M1457: ex.tel,
    M1458: ex.fax,
    M1459: ex.legalCn,
  }, [
    '<M15>',
    `<M1501>${docs.M14}</M1501>`,
    `<M1503>${product.no}</M1503>`,
    '<M1504>N/M</M1504>',
    `<M1505>${product.en}</M1505>`,
    `<M1508>${round.qty}</M1508>`,
    `<M1509>${product.unit}</M1509>`,
    `<M1506>${round.qty}</M1506>`,
    `<M1507>${product.unit}</M1507>`,
    `<M1510>${round.gross.toFixed(2)}</M1510>`,
    '<M1511>KGS</M1511>',
    `<M1512>${round.net.toFixed(2)}</M1512>`,
    '<M1513>USD</M1513>',
    `<M1514>${round.price.toFixed(2)}</M1514>`,
    `<M1515>${round.amount.toFixed(2)}</M1515>`,
    '</M15>',
  ].join(''), ['M15']);

  await saveDoc(page, 'M17', docs.M17A, uid(round.exporter, 1), {
    M1707: ex.cn,
    M1708: ex.code,
    M1709: ex.legalCn,
    M1710: ex.tel,
    M1711: '2026',
    M1712: '04',
    M1713: '25',
    M1714: ex.cn,
    M1715: exporterBlock,
    M1716: im.cn,
    M1717: importerBlock,
    M1718: 'Veendam / DY105-08',
    M1719: '一般贸易',
    M1720: 'SHANGHAI CY',
    M1721: round.contractNo,
    M1722: lcNo,
    M1723: '销售',
    M1724: round.shipDate,
    M1725: round.country,
    M1727: round.portFrom,
    M1728: round.port,
    M1729: ex.customsCode,
    M1730: "20' X 1",
    M1731: 'Inspection required before customs declaration.',
    M1732: 'N/M',
    M1733: '1',
    M1734: '1',
    M1735: '1',
    M1736: '1',
    M1749: '1',
    M1763: '1',
  }, [
    '<M18>',
    `<M1801>${docs.M17A}</M1801>`,
    `<M1803>${product.no}</M1803>`,
    `<M1804>${product.en}</M1804>`,
    `<M1805>${product.hs}</M1805>`,
    '<M1806>CHINA</M1806>',
    `<M1807>${round.qty}</M1807>`,
    `<M1808>${product.unit}</M1808>`,
    `<M1811>${round.qty}</M1811>`,
    `<M1812>${product.unit}</M1812>`,
    '<M1809>USD</M1809>',
    `<M1810>${round.amount.toFixed(2)}</M1810>`,
    '</M18>',
  ].join(''), ['M18']);

  await saveDoc(page, 'M19', docs.M19, uid(round.exporter, 1), {
    M1907: exporterBlock,
    M1908: importerBlock,
    M1909: '2026-04-25',
    M1910: round.contractNo,
    M1911: lcNo,
    M1912: round.payment,
    M1913: `FROM ${round.portFrom} TO ${round.port} BY SEA`,
    M1914: 'N/M',
    M1915: round.qty,
    M1916: product.unit,
    M1917: 'USD',
    M1918: round.amount.toFixed(2),
    M1919: moneyWords(round.amount),
    M1920: ex.en,
    M1921: ex.legalEn,
    M1922: `${round.term} ${round.port}`,
  }, [
    '<M20>',
    `<M2001>${docs.M19}</M2001>`,
    `<M2003>${product.no}</M2003>`,
    '<M2004>N/M</M2004>',
    `<M2005>${product.en}</M2005>`,
    `<M2006>${round.qty}</M2006>`,
    `<M2007>${product.unit}</M2007>`,
    '<M2008>USD</M2008>',
    `<M2009>${round.price.toFixed(2)}</M2009>`,
    `<M2010>${round.amount.toFixed(2)}</M2010>`,
    '</M20>',
  ].join(''), ['M20']);

  await saveDoc(page, 'M21', docs.M21, uid(round.exporter, 1), {
    M2107: exporterBlock,
    M2108: importerBlock,
    M2109: docs.M19,
    M2110: '2026-04-25',
    M2111: round.qty,
    M2112: product.unit,
    M2113: round.gross.toFixed(0),
    M2114: 'KGS',
    M2115: round.net.toFixed(0),
    M2116: 'KGS',
    M2117: round.cbm.toFixed(3),
    M2118: 'CBM',
    M2119: `SAY TOTAL ${round.qty} CARTONS ONLY.`,
    M2120: 'N/M',
    M2121: ex.en,
    M2122: ex.legalEn,
  }, [
    '<M22>',
    `<M2201>${docs.M21}</M2201>`,
    `<M2203>${product.no}</M2203>`,
    '<M2204>N/M</M2204>',
    `<M2205>${product.en}</M2205>`,
    `<M2206>${round.qty}</M2206>`,
    `<M2207>${product.unit}</M2207>`,
    `<M2208>${round.gross.toFixed(0)}</M2208>`,
    `<M2209>${round.net.toFixed(0)}</M2209>`,
    `<M2210>${round.cbm.toFixed(3)}</M2210>`,
    '</M22>',
  ].join(''), ['M22']);

  await saveDoc(page, 'M03', docs.M03B, uid(round.exporter, 1), {
    M0307: exporterBlock,
    M0308: importerBlock,
    M0309: `FROM ${round.portFrom}, CHINA TO ${round.port}, ${round.country} BY SEA`,
    M0310: '',
    M0311: 'NANJING, CHINA 2026-04-25',
    M0312: 'NANJING, CHINA 2026-04-25',
    M0322: round.country,
  }, [
    '<M04>',
    `<M0401>${docs.M03B}</M0401>`,
    '<M0402>1</M0402>',
    `<M0403>${product.no}</M0403>`,
    '<M0404>N/M</M0404>',
    `<M0405>${round.qty} CARTONS ${product.en}</M0405>`,
    '<M0406>P</M0406>',
    `<M0407>${round.gross.toFixed(0)}</M0407>`,
    '<M0408>KGS</M0408>',
    `<M0409>${docs.M19} 2026-04-25</M0409>`,
    '</M04>',
  ].join(''), ['M04']);

  if (docs.M25) {
    await saveDoc(page, 'M25', docs.M25, uid(round.exporter, 1), {
      M2507: ex.cn,
      M2508: '2026-04-25',
      M2509: docs.M19,
      M2510: exporterBlock,
      M2511: importerBlock,
      M2512: 'USD',
      M2513: (round.amount * 1.1).toFixed(2),
      M2514: round.portFrom,
      M2515: round.port,
      M2517: round.shipDate,
      M2518: 'Veendam / DY105-08',
      M2519: round.port,
      M2520: 'USD',
      M2521: '3',
      M2522: 'COVERING ALL RISKS AND WAR RISK FOR 110 PERCENT OF INVOICE VALUE.',
      M2523: '1',
      M2526: '1',
      M2528: '1',
      M2546: '2026-04-25',
    });
  }

  if (docs.M28A) {
    await saveDoc(page, 'M28', docs.M28A, uid(round.exporter, 1), {
      M2806: round.contractNo,
      M2807: ex.cn,
      M2808: ex.code,
      M2809: 'USD',
      M2810: round.amount.toFixed(2),
      M2811: round.payment,
      M2812: '2026-06-15',
      M2813: round.shipDate,
      M2814: '出口收汇核销备案',
      M2815: round.contractNo,
      M2817: ex.cn,
      M2818: ex.code,
      M2819: '收汇',
      M2820: round.amount.toFixed(2),
      M2821: '2026-06-15',
      M2823: exBank.en,
      M2825: '2026',
      M2826: '4',
      M2827: '25',
      M2828: ex.cn,
      M2829: ex.code,
      M2830: 'USD',
      M2831: '出口货款核销',
      M2833: '2026',
      M2834: '4',
      M2835: '25',
      M2839: round.amount.toFixed(2),
    });
  }

  if (docs.M05A) {
    await saveDoc(page, 'M05', docs.M05A, uid(round.exporter, 1), {
      M0507: docs.M05A,
      M0509: round.portFrom,
      M0511: round.shipDate,
      M0512: round.shipDate,
      M0513: ex.cn,
      M0514: '海运',
      M0515: 'Veendam / DY105-08',
      M0517: ex.cn,
      M0518: '一般贸易',
      M0519: '一般征税',
      M0520: round.payment,
      M0522: round.country,
      M0523: round.port,
      M0524: '南京',
      M0526: round.term,
      M0527: 'USD',
      M0528: '500.00',
      M0529: 'USD',
      M0530: round.term === 'CIF' ? '20.00' : '0.00',
      M0533: round.contractNo,
      M0534: round.qty,
      M0535: product.unit,
      M0536: round.gross.toFixed(0),
      M0537: round.net.toFixed(0),
      M0538: "20' X 1",
      M0539: '商业发票、装箱单、出境货物通关单、出口收汇核销单',
      M0540: P[round.factory][3].cn,
      M0541: 'N/M',
      M0547: ex.legalCn,
      M0548: ex.cn,
      M0549: ex.legalCn,
      M0550: ex.addrCn,
      M0551: ex.zip,
      M0552: ex.tel,
      M0554: round.shipDate,
    }, [
      '<M06>',
      `<M0601>${docs.M05A}</M0601>`,
      '<M0602>1</M0602>',
      `<M0603>${product.no}</M0603>`,
      `<M0613>${product.hs}</M0613>`,
      `<M0604>${product.en}</M0604>`,
      '<M0605>425Gx24TINS/CTN</M0605>',
      `<M0606>${round.qty}</M0606>`,
      `<M0607>${product.unit}</M0607>`,
      `<M0608>${round.country}</M0608>`,
      '<M0612>照章征税</M0612>',
      '<M0611>USD</M0611>',
      `<M0609>${round.price.toFixed(2)}</M0609>`,
      `<M0610>${round.amount.toFixed(2)}</M0610>`,
      '</M06>',
    ].join(''), ['M06']);
  }

  if (docs.M44) {
    const m01 = docs.M01 || '';
    await saveDoc(page, 'M44', docs.M44, uid(round.exporter, 1), {
      M4407: importerBlock,
      M4408: docs.M19,
      M4409: '2026-04-25',
      M4410: lcNo,
      M4411: round.contractNo,
      M4412: 'Veendam / DY105-08',
      M4413: round.portFrom,
      M4414: round.port,
      M4415: '2026-04-25',
      M4416: round.expire,
      M4429: "20' X 1",
      M4430: 'USD',
      M4431: '500.00',
      M4417: product.en,
      M4418: round.qty,
      M4419: product.unit,
      M4420: 'USD',
      M4421: round.amount.toFixed(2),
      M4422: docs.M19,
      M4423: docs.M21,
      M4424: m01,
      M4425: docs.M26 || '',
      M4426: 'We hereby advise that the goods under the above contract have been shipped.',
      M4427: ex.legalEn,
      M4428: ex.en,
    });
  }

  if (docs.M42) {
    const nonLcDraft = round.payment !== 'L/C';
    await saveDoc(page, 'M42', docs.M42, uid(round.exporter, 1), {
      M4207: '2026-04-25',
      M4208: 'USD',
      M4209: round.amount.toFixed(2),
      M4210: round.payment === 'D/A' ? '30 DAYS AFTER' : 'SIGHT',
      M4211: nonLcDraft ? exBank.cn : exBank.en,
      M4212: moneyWords(round.amount).replace(/\.$/, ''),
      M4213: nonLcDraft ? '' : lcNo,
      M4214: '2026-04-25',
      M4215: nonLcDraft ? ex.cn : imBank.en,
      M4216: nonLcDraft ? `${im.cn}\n${im.addrCn}` : `${imBank.en}\n${imBank.addrEn}`,
      M4217: nonLcDraft ? ex.legalCn : ex.legalEn,
    });
  }
}

async function setupLcIfNeeded(page, round, P, docs) {
  if (round.payment !== 'L/C') return;
  const im = P[round.importer][2];
  const ex = P[round.exporter][1];
  const imBank = P[round.importer][5];
  const exBank = P[round.exporter][4];
  await login(page, round.importer, 2);
  await doPost(page, `Import/importDoPost.aspx?cls=I606&id=${round.contractNo}`, 'import claim verification form', round);
  const notesI = await listNotes(page, round.contractNo, 'I2');
  docs.M40 = notesI.find((r) => r.type === 'M40')?.docNo || docs.M40;
  if (!docs.M40) {
    docs.M40 = await ensureDoc(page, round.contractNo, 'M40', 'M40', 'I2').catch(() => '');
  }
  if (docs.M40) {
    await saveDoc(page, 'M40', docs.M40, uid(round.importer, 2), {
      M4007: '320100',
      M4008: im.code,
      M4009: im.en,
      M4010: `${round.country} SAFE`,
      M4011: imBank.en,
      M4012: 'China',
      M4013: product.no,
      M4014: '0',
      M4015: '1',
      M4016: 'Import payment for canned mushrooms',
      M4017: 'USD',
      M4018: round.amount.toFixed(2),
      M4019: round.amount.toFixed(2),
      M4022: uid(round.importer, 2),
      M4023: uid(round.importer, 2),
      M4031: '2026-06-15',
      M4033: round.contractNo,
      M4036: '2026',
      M4037: '4',
      M4038: '25',
      M4039: '2026',
      M4040: '4',
      M4041: '25',
      M4042: '30',
    });
  }

  await page.goto(base + `Common/BankCreditList.aspx?id=${round.contractNo}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(250);
  if (await page.locator('#btnAddCreditEdit').count()) {
    await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click('#btnAddCreditEdit')]);
    await page.waitForTimeout(700);
  }
  let notesAfter = await listNotes(page, round.contractNo, 'I2');
  docs.M31 = notesAfter.find((r) => r.type === 'M31')?.docNo || docs.M31;
  if (!docs.M31) docs.M31 = await ensureDoc(page, round.contractNo, 'M31', 'M31', 'I2').catch(() => '');
  if (docs.M31) {
    await saveDoc(page, 'M31', docs.M31, uid(round.importer, 2), {
      M3107: imBank.en,
      M3108: '2026-04-25',
      M3112: '1',
      M3189: docs.M31,
      M3113: `${round.expire} ${round.port}`,
      M3114: `${im.en}\n${im.addrEn}`,
      M3115: `${ex.en}\n${ex.addrEn}`,
      M3116: `${exBank.en}\n${exBank.addrEn}`,
      M3117: 'USD',
      M3118: round.amount.toFixed(2),
      M3119: moneyWords(round.amount).replace(/\.$/, ''),
      M3120: '1',
      M3122: '1',
      M3124: exBank.en,
      M3125: round.portFrom,
      M3126: round.latestShip,
      M3127: round.port,
      M3128: '1',
      M3133: '1',
      M3134: '100',
      M3135: 'sight',
      M3136: imBank.en,
      M3139: '1',
      M3141: '1',
      M3150: '3',
      M3151: docs.M31,
      M3152: round.contractNo,
      M3142: '1',
      M3154: '1',
      M3155: '1',
      M3156: im.en,
      M3144: '1',
      M3162: '2',
      M3163: '110',
      M3164: round.port,
      M3165: 'All Risks and War Risk',
      M3145: '1',
      M3166: '3',
      M3148: '1',
      M3172: '1',
      M3173: 'China Council for the Promotion of International Trade',
      M3149: '1',
      M3174: '48',
      M3176: `${product.en}\nQuantity: ${round.qty} CARTONS\nUnit Price: USD ${round.price.toFixed(2)}/CARTON\nAmount: USD ${round.amount.toFixed(2)}`,
      M3177: '1',
      M3178: '1',
      M3183: '15',
      M3179: '1',
      M3181: '1',
      M3185: 'one lot',
    });
    await page.goto(base + `Common/BankCreditList.aspx?id=${round.contractNo}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(250);
    await page.evaluate((docNo) => {
      const marks = Array.from(document.querySelectorAll('input[name=mark]'));
      const target = marks.find((m) => m.closest('tr')?.innerText.includes(docNo)) || marks[0];
      if (target) {
        target.checked = true;
        const flag = document.querySelector('input[name=flag]');
        if (flag) flag.value = target.value;
      }
    }, docs.M31);
    if (await page.locator('#btnSend').count()) {
      await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click('#btnSend')]);
      await page.waitForTimeout(900);
      log('send lc application', await bodyText(page), { round: round.idx, contract: round.contractNo });
    }
  }

  await login(page, round.importer, 5);
  await page.goto(base + 'ImBank/CreditOperate.aspx?no=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate((contractNo) => {
    const marks = Array.from(document.querySelectorAll('input[name=mark]'));
    const target = marks.find((m) => m.value.includes(contractNo) || m.closest('tr')?.innerText.includes(contractNo));
    if (target) {
      target.checked = true;
      const flag = document.querySelector('input[name=flag]');
      if (flag) flag.value = target.value;
    }
  }, round.contractNo).catch(() => {});
  for (const id of ['btnAddCreditEdit', 'btn1', 'btnOk', 'btn2']) {
    if (await page.locator(`#${id}`).count()) {
      await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click(`#${id}`)]).catch(() => {});
      await page.waitForTimeout(900);
      log('import bank open lc action', await bodyText(page), { round: round.idx, contract: round.contractNo });
      break;
    }
  }
  let notesLC = await listNotes(page, round.contractNo, 'I2').catch(() => []);
  docs.M30 = notesLC.find((r) => r.type === 'M30')?.docNo || docs.M30;
  if (!docs.M30) {
    await page.goto(base + 'ImBank/CreditOperate.aspx?no=2', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    docs.M30 = ((await bodyText(page)).match(/\bSTLCN\d+\b/) || [])[0] || '';
  }
  if (docs.M30) {
    await saveDoc(page, 'M30', docs.M30, uid(round.importer, 5), {
      M3007: '1/1',
      M3008: 'IRREVOCABLE',
      M3009: docs.M30,
      M3010: '2026-04-25',
      M3011: `${round.expire} ${round.port}`,
      M3012: imBank.en,
      M3013: `${im.en}\n${im.addrEn}`,
      M3014: `${ex.en}\n${ex.addrEn}`,
      M3031: 'USD',
      M3015: round.amount.toFixed(2),
      M3016: `${exBank.en} BY SIGHT PAYMENT`,
      M3017: 'SIGHT',
      M3018: imBank.en,
      M3019: 'ALLOWED',
      M3020: 'ALLOWED',
      M3021: round.portFrom,
      M3022: round.port,
      M3023: round.latestShip,
      M3024: `${product.en}\n${round.qty} CARTONS AT USD ${round.price.toFixed(2)}/CARTON\n${round.term} ${round.port}`,
      M3025: 'SIGNED COMMERCIAL INVOICE, PACKING LIST, BILL OF LADING, INSURANCE POLICY AND CERTIFICATE OF ORIGIN.',
      M3026: `ALL DOCUMENTS MUST INDICATE L/C NO. AND CONTRACT NO. ${round.contractNo}.`,
      M3027: 'BANKING CHARGES OUTSIDE OPENING BANK ARE FOR BENEFICIARY ACCOUNT.',
      M3028: 'DOCUMENTS MUST BE PRESENTED WITHIN 15 DAYS AFTER SHIPMENT DATE.',
      M3029: 'WITHOUT',
      M3030: `${exBank.en}\n${exBank.addrEn}`,
      M3032: 'USD',
      M3033: round.amount.toFixed(2),
    });
    await page.goto(base + 'ImBank/CreditOperate.aspx?no=3', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await page.evaluate((contractNo) => {
      const marks = Array.from(document.querySelectorAll('input[name=mark]'));
      const target = marks.find((m) => m.value.includes(contractNo) || m.closest('tr')?.innerText.includes(contractNo)) || marks[0];
      if (target) {
        target.checked = true;
        const flag = document.querySelector('input[name=flag]');
        if (flag) flag.value = target.value;
      }
    }, round.contractNo).catch(() => {});
    for (const id of ['btn2', 'btnFF', 'btnOk']) {
      if (await page.locator(`#${id}`).count()) {
        await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click(`#${id}`)]).catch(() => {});
        await page.waitForTimeout(900);
        log('import bank send lc to importer', await bodyText(page), { round: round.idx, contract: round.contractNo });
        break;
      }
    }
  }
  await login(page, round.importer, 2);
  await page.goto(base + `Common/BankCreditList.aspx?id=${round.contractNo}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(250);
  await page.evaluate((contractNo) => {
    const marks = Array.from(document.querySelectorAll('input[name=mark]'));
    const target = marks.find((m) => m.value.includes(contractNo) || m.closest('tr')?.innerText.includes(contractNo)) || marks[0];
    if (target) {
      target.checked = true;
      const flag = document.querySelector('input[name=flag]');
      if (flag) flag.value = target.value;
    }
  }, round.contractNo).catch(() => {});
  for (const id of ['btnConfirm', 'btnOk', 'btnSend']) {
    if (await page.locator(`#${id}`).count()) {
      await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click(`#${id}`)]).catch(() => {});
      await page.waitForTimeout(800);
      log('importer confirm lc', await bodyText(page), { round: round.idx, contract: round.contractNo });
      break;
    }
  }
  await login(page, round.importer, 5);
  await page.goto(base + 'ImBank/CreditOperate.aspx?no=3', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.evaluate((contractNo) => {
    const marks = Array.from(document.querySelectorAll('input[name=mark]'));
    const target = marks.find((m) => m.value.includes(contractNo) || m.closest('tr')?.innerText.includes(contractNo)) || marks[0];
    if (target) {
      target.checked = true;
      const flag = document.querySelector('input[name=flag]');
      if (flag) flag.value = target.value;
    }
  }, round.contractNo).catch(() => {});
  for (const id of ['btnFF', 'btn2', 'btnOk']) {
    if (await page.locator(`#${id}`).count()) {
      await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click(`#${id}`)]).catch(() => {});
      await page.waitForTimeout(800);
      log('import bank send lc to export bank', await bodyText(page), { round: round.idx, contract: round.contractNo });
      break;
    }
  }
  await login(page, round.exporter, 4);
  await page.goto(base + 'ExBank/CreditOperate.aspx?no=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(350);
  docs.M34 = ((await bodyText(page)).match(/\bSTNDC\d+\b/) || [])[0] || docs.M34 || '';
  if (docs.M34) {
    await saveDoc(page, 'M34', docs.M34, uid(round.exporter, 4), {
      M3407: P[round.exporter][4].cn,
      M3408: P[round.exporter][4].en,
      M3409: P[round.exporter][4].addrEn,
      M3410: P[round.exporter][4].tel,
      M3411: '2026-04-25',
      M3412: `${ex.en}\n${ex.addrEn}`,
      M3413: docs.M34,
      M3414: `${imBank.en}\n${imBank.addrEn}`,
      M3415: docs.M30,
      M3416: '2026-04-25',
      M3417: 'USD',
      M3418: round.amount.toFixed(2),
      M3419: round.port,
      M3420: round.expire,
      M3421: 'SIGHT',
      M3422: P[round.exporter][4].tel,
      M3423: P[round.exporter][4].en,
    });
  }
  await page.goto(base + 'ExBank/CreditOperate.aspx?no=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.evaluate((contractNo) => {
    const marks = Array.from(document.querySelectorAll('input[name=mark]'));
    const target = marks.find((m) => m.value.includes(contractNo) || m.closest('tr')?.innerText.includes(contractNo)) || marks[0];
    if (target) {
      target.checked = true;
      const flag = document.querySelector('input[name=flag]');
      if (flag) flag.value = target.value;
    }
  }, round.contractNo).catch(() => {});
  for (const id of ['btnFF', 'btn2', 'btnOk']) {
    if (await page.locator(`#${id}`).count()) {
      await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click(`#${id}`)]).catch(() => {});
      await page.waitForTimeout(800);
      log('export bank notify lc', await bodyText(page), { round: round.idx, contract: round.contractNo });
      break;
    }
  }
  await login(page, round.exporter, 1);
  await page.goto(base + `Export/ExportDoPost.aspx?cls=E201&id=${round.contractNo}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(500);
}

async function fillImportPaymentVerification(page, round, P, docs) {
  const im = P[round.importer][2];
  const imBank = P[round.importer][5];
  let notes = await listNotes(page, round.contractNo, 'I2');
  docs.M40 = notes.find((r) => r.type === 'M40')?.docNo || docs.M40;
  if (!docs.M40) docs.M40 = await ensureDoc(page, round.contractNo, 'M40', 'M40', 'I2').catch(() => '');
  if (!docs.M40) return;
  await saveDoc(page, 'M40', docs.M40, uid(round.importer, 2), {
    M4007: '320100',
    M4008: im.code,
    M4009: im.cn,
    M4010: `${round.country} SAFE`,
    M4011: imBank.cn || imBank.en,
    M4012: 'China',
    M4013: product.no,
    M4014: '0',
    M4015: '1',
    M4016: '进口付汇核销备案',
    M4017: 'USD',
    M4018: round.amount.toFixed(2),
    M4019: round.amount.toFixed(2),
    M4022: uid(round.importer, 2),
    M4023: uid(round.importer, 2),
    M4031: '2026-06-15',
    M4033: round.contractNo,
    M4036: '2026',
    M4037: '4',
    M4038: '25',
    M4039: '2026',
    M4040: '4',
    M4041: '25',
    M4042: '30',
  });
  await checkDoc(page, round.contractNo, 'I2', 'M40', round);
}

async function exportPerformance(page, round, P) {
  await login(page, round.exporter, 1);
  if (round.term === 'FOB') {
    await login(page, round.importer, 2);
    await chooseShipment(page, round, 'importer designate shipment');
    await login(page, round.exporter, 1);
  } else {
    await chooseShipment(page, round, 'exporter designate shipment');
  }
  const docs = {};
  await setupLcIfNeeded(page, round, P, docs);
  await login(page, round.exporter, 1);
  docs.M14 = await ensureDoc(page, round.contractNo, 'M14', 'M14', 'E2');
  docs.M17A = await ensureDoc(page, round.contractNo, 'M17A', 'M17', 'E2');
  docs.M19 = await ensureDoc(page, round.contractNo, 'M19', 'M19', 'E2');
  docs.M21 = await ensureDoc(page, round.contractNo, 'M21', 'M21', 'E2');
  docs.M03B = await ensureDoc(page, round.contractNo, 'M03B', 'M03', 'E2');
  if (round.term === 'CIF') docs.M25 = await ensureDoc(page, round.contractNo, 'M25', 'M25', 'E2');
  await fillExportCoreDocs(page, round, docs, P);
  await checkDoc(page, round.contractNo, 'E4', 'M14', round);
  await bookSpace(page, round);
  for (const type of ['M17A', 'M19', 'M21']) await checkDoc(page, round.contractNo, 'E2', type, round);
  const inspectTypes = round.payment === 'L/C' && docs.M30 ? ['M07', 'M30', 'M17A', 'M19', 'M21'] : ['M07', 'M17A', 'M19', 'M21'];
  await submitNoteList(page, round.contractNo, 'E5', inspectTypes, 'export inspection', round);
  let notes = await listNotes(page, round.contractNo, 'E2');
  docs.M24A = notes.find((r) => r.type === 'M24A')?.docNo;
  docs.M23A = notes.find((r) => r.type === 'M23A')?.docNo;
  await checkDoc(page, round.contractNo, 'E2', 'M03B', round);
  await page.goto(base + `Export/E5_OriginCertificate.aspx?id=${round.contractNo}`, { waitUntil: 'domcontentloaded' });
  await page.selectOption('#txtContype', { label: '普惠制产地证明书' }).catch(() => page.selectOption('#txtContype', 'M03B').catch(() => {}));
  await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click('#btnOk')]);
  await page.waitForTimeout(850);
  log('origin certificate', await bodyText(page), { round: round.idx, contract: round.contractNo });
  if (round.term === 'CIF' && docs.M25) {
    await checkDoc(page, round.contractNo, 'E2', 'M25', round);
    await submitNoteList(page, round.contractNo, 'E7', ['M19', 'M25'], 'export insurance', round);
    notes = await listNotes(page, round.contractNo, 'E2');
    docs.M26 = notes.find((r) => r.type === 'M26')?.docNo;
  }
  await doPost(page, `Export/ExportDoPost.aspx?cls=E801&id=${round.contractNo}`, 'claim export verification', round);
  notes = await listNotes(page, round.contractNo, 'E2');
  docs.M28A = notes.find((r) => r.type === 'M28A')?.docNo;
  if (docs.M28A) {
    await fillExportCoreDocs(page, round, docs, P);
    await checkDoc(page, round.contractNo, 'E2', 'M28A', round);
    await doPost(page, `Export/ExportDoPost.aspx?cls=E901&id=${round.contractNo}`, 'customs filing', round);
  }
  await doPost(page, `Export/ExportDoPost.aspx?cls=E902&id=${round.contractNo}`, 'deliver goods to customs', round);
  docs.M05A = await ensureDoc(page, round.contractNo, 'M05A', 'M05', 'E2');
  await fillExportCoreDocs(page, round, docs, P);
  await checkDoc(page, round.contractNo, 'E2', 'M05A', round);
  await submitNoteList(page, round.contractNo, 'E9', ['M19', 'M21', 'M23A', 'M28A', 'M05A'], 'export customs declaration', round);
  await doPost(page, `Export/ExportDoPost.aspx?cls=E402&id=${round.contractNo}`, 'collect bill of lading', round);
  notes = await listNotes(page, round.contractNo, 'E2');
  docs.M01 = notes.find((r) => r.type === 'M01')?.docNo;
  docs.M44 = await ensureDoc(page, round.contractNo, 'M44', 'M44', 'E2');
  if (round.payment !== 'T/T') docs.M42 = await ensureDoc(page, round.contractNo, 'M42', 'M42', 'E2');
  await fillExportCoreDocs(page, round, docs, P);
  await checkDoc(page, round.contractNo, 'E2', 'M44', round);
  await doPost(page, `Export/ExportDoPost.aspx?cls=E403&id=${round.contractNo}`, 'send shipping advice', round);
  if (docs.M42) await checkDoc(page, round.contractNo, 'E2', 'M42', round);
  const docTypes = ['M19', 'M21', 'M24A', 'M03B'];
  if (docs.M26) docTypes.push('M26');
  if (docs.M01) docTypes.push('M01');
  if (docs.M42) docTypes.push('M42');
  if (round.payment === 'L/C') {
    await submitNoteList(page, round.contractNo, 'E1001', docTypes, 'negotiation', round);
  } else {
    await submitNoteList(page, round.contractNo, 'E1002', docTypes, round.payment === 'T/T' ? 'send documents to importer' : 'collection', round);
  }
  return docs;
}

async function chooseShipment(page, round, label) {
  await page.goto(base + `Common/ShipMentList.aspx?id=${round.contractNo}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const mark = document.querySelector('input[name=mark]');
    if (mark) mark.checked = true;
    const flag = document.querySelector('input[name=flag]');
    if (flag && mark) flag.value = mark.value;
    const flag1 = document.querySelector('input[name=flag1]');
    if (flag1 && mark) flag1.value = mark.value;
  });
  if (await page.locator('#btnOk').count()) {
    await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click('#btnOk')]);
    await page.waitForTimeout(750);
  }
  log(label, await bodyText(page), { round: round.idx, contract: round.contractNo });
}

async function bookSpace(page, round) {
  await page.goto(base + `Export/E4_BookingSpace.aspx?id=${round.contractNo}`, { waitUntil: 'domcontentloaded' });
  if (await page.locator('#txtContype').count()) {
    await page.selectOption('#txtContype', { label: "20'" }).catch(() => page.selectOption('#txtContype', '20').catch(() => {}));
  }
  if (await page.locator('#txtSdate').count()) await page.fill('#txtSdate', round.shipDate);
  if (await page.locator('#btnOk').count()) {
    await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click('#btnOk')]);
    await page.waitForTimeout(900);
  } else {
    await doPost(page, `Export/ExportDoPost.aspx?cls=E401&id=${round.contractNo}`, 'book space fallback', round);
    return;
  }
  log('book space', await bodyText(page), { round: round.idx, contract: round.contractNo });
}

async function processBankDocuments(page, round) {
  if (round.payment === 'T/T') return;
  await login(page, round.exporter, 4);
  await processBill(page, round, 'export bank send documents', 'ExBank/BillOperate.aspx?no=1', ['btn2', 'btnFF', 'btnOk']);
  await login(page, round.importer, 5);
  await processBill(page, round, 'import bank notify importer', 'ImBank/BillOperate.aspx?no=1', ['btnFF', 'btn2', 'btnOk']);
}

async function processBill(page, round, label, route, buttons) {
  await page.goto(base + route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(450);
  const found = await page.evaluate((contractNo) => {
    const marks = Array.from(document.querySelectorAll('input[name=mark]'));
    const target = marks.find((m) => (m.value || '').includes(contractNo) || m.closest('tr')?.innerText.includes(contractNo));
    if (!target) return null;
    target.checked = true;
    const flag = document.querySelector('input[name=flag]');
    if (flag) flag.value = target.value || contractNo;
    return { value: target.value, text: target.closest('tr')?.innerText.replace(/\s+/g, ' ').trim() };
  }, round.contractNo);
  log(`${label} row`, JSON.stringify(found || {}), { round: round.idx, contract: round.contractNo });
  if (!found) return;
  for (const id of buttons) {
    if (await page.locator(`#${id}`).count()) {
      await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click(`#${id}`)]);
      await page.waitForTimeout(850);
      log(label, await bodyText(page), { round: round.idx, contract: round.contractNo });
      return;
    }
  }
  await page.locator('form').evaluate((f) => f.submit()).catch(() => {});
  await page.waitForTimeout(850);
  log(label, await bodyText(page), { round: round.idx, contract: round.contractNo });
}

async function importerPerformance(page, round, docs, P) {
  const im = P[round.importer][2];
  const ex = P[round.exporter][1];
  await login(page, round.importer, 2);
  if (round.payment !== 'L/C') {
    await doPost(page, `Import/importDoPost.aspx?cls=I606&id=${round.contractNo}`, 'import claim verification form', round);
    await fillImportPaymentVerification(page, round, P, docs);
  }
  if (round.payment === 'D/P' || round.payment === 'T/T' || round.payment === 'L/C') {
    await doPost(page, `Import/importDoPost.aspx?cls=I601&id=${round.contractNo}`, 'importer payment', round);
  } else if (round.payment === 'D/A') {
    await doPost(page, `Import/importDoPost.aspx?cls=I602&id=${round.contractNo}`, 'importer acceptance', round);
  }
  await doPost(page, `Import/importDoPost.aspx?cls=I603&id=${round.contractNo}`, 'importer redeem documents', round);
  if (round.term !== 'CIF') {
    let notesForInsurance = await listNotes(page, round.contractNo, 'I2');
    for (const row of notesForInsurance) docs[row.type] = docs[row.type] || row.docNo;
    docs.M25I = await ensureDoc(page, round.contractNo, 'M25', 'M25', 'I2');
    await saveDoc(page, 'M25', docs.M25I, uid(round.importer, 2), {
      M2507: im.cn,
      M2508: '2026-04-25',
      M2509: docs.M19 || '',
      M2510: `${im.en}\n${im.addrEn}`,
      M2511: `${ex.en}\n${ex.addrEn}`,
      M2512: 'USD',
      M2513: (round.amount * 1.1).toFixed(2),
      M2514: round.portFrom,
      M2515: round.port,
      M2517: round.shipDate,
      M2518: 'Veendam / DY105-08',
      M2519: round.port,
      M2520: 'USD',
      M2521: '3',
      M2522: 'COVERING ALL RISKS AND WAR RISK AS PER CIC',
      M2523: '1',
      M2526: '1',
      M2528: '1',
      M2546: '2026-04-25',
    });
    await checkDoc(page, round.contractNo, 'I2', 'M25', round);
    await submitNoteList(page, round.contractNo, 'I8', ['M25'], 'import insurance', round);
    notesForInsurance = await listNotes(page, round.contractNo, 'I2');
    docs.M26I = notesForInsurance.find((r) => r.type === 'M26')?.docNo || docs.M26I;
  }
  await doPost(page, `Import/importDoPost.aspx?cls=I301&id=${round.contractNo}`, 'exchange delivery order', round);
  let notes = await listNotes(page, round.contractNo, 'I2');
  for (const row of notes) docs[row.type] = docs[row.type] || row.docNo;
  docs.M17B = await ensureDoc(page, round.contractNo, 'M17B', 'M17', 'I2');
  docs.M05B = await ensureDoc(page, round.contractNo, 'M05B', 'M05', 'I2');
  docs.M43 = await ensureDoc(page, round.contractNo, 'M43', 'M43', 'I2');
  if (!docs.M40) {
    notes = await listNotes(page, round.contractNo, 'I2');
    docs.M40 = notes.find((r) => r.type === 'M40')?.docNo || '';
  }
  await saveDoc(page, 'M17', docs.M17B, uid(round.importer, 2), {
    M1707: im.cn,
    M1708: im.code,
    M1709: im.legalCn,
    M1710: im.tel,
    M1711: '2026',
    M1712: '04',
    M1713: '25',
    M1714: im.cn,
    M1715: `${im.en}\n${im.addrEn}`,
    M1716: ex.cn,
    M1717: `${ex.en}\n${ex.addrEn}`,
    M1718: 'Veendam / DY105-08',
    M1719: '一般贸易',
    M1721: round.contractNo,
    M1724: '2026-06-05',
    M1725: 'CHINA',
    M1727: 'CHINA',
    M1728: round.port,
    M1730: "20' X 1",
    M1731: '进口报检，货到后按合同和发票验收。',
    M1732: 'N/M',
    M1733: '1',
    M1734: '1',
    M1735: '1',
    M1783: im.legalCn,
    M1784: '2026-04-25',
    M1785: im.legalCn,
    M1789: docs.M01 || '',
    M1790: '2026-06-05',
    M1791: round.portFrom,
    M1792: round.port,
    M1793: '2026-06-30',
    M1795: `${round.port} BONDED WAREHOUSE`,
    M1796: '销售',
  }, [
    '<M18>',
    `<M1801>${docs.M17B}</M1801>`,
    `<M1803>${product.no}</M1803>`,
    `<M1804>${product.en}</M1804>`,
    `<M1805>${product.hs}</M1805>`,
    '<M1806>CHINA</M1806>',
    `<M1807>${round.qty}</M1807>`,
    `<M1808>${product.unit}</M1808>`,
    '<M1809>USD</M1809>',
    `<M1810>${round.amount.toFixed(2)}</M1810>`,
    `<M1811>${round.qty}</M1811>`,
    `<M1812>${product.unit}</M1812>`,
    '</M18>',
  ].join(''), ['M18']);
  await checkDoc(page, round.contractNo, 'I2', 'M17B', round);
  await submitNoteList(page, round.contractNo, 'I4', ['M07', 'M19', 'M21', 'M41', 'M17B'], 'import inspection', round);
  notes = await listNotes(page, round.contractNo, 'I2');
  for (const row of notes) docs[row.type] = docs[row.type] || row.docNo;
  await saveDoc(page, 'M05', docs.M05B, uid(round.importer, 2), {
    M0507: docs.M05B,
    M0509: round.port,
    M0511: '2026-06-05',
    M0512: '2026-04-25',
    M0513: im.cn,
    M0514: '海运',
    M0515: 'Veendam / DY105-08',
    M0516: docs.M01 || docs.M41 || '',
    M0517: im.cn,
    M0518: '一般贸易',
    M0519: '一般征税',
    M0520: '照章征税',
    M0522: 'CHINA',
    M0523: round.portFrom,
    M0524: round.port,
    M0526: round.term,
    M0527: 'USD',
    M0528: '500.00',
    M0529: 'USD',
    M0530: round.term === 'CIF' ? '20.00' : '0.00',
    M0533: round.contractNo,
    M0534: round.qty,
    M0535: product.unit,
    M0536: round.gross.toFixed(0),
    M0537: round.net.toFixed(0),
    M0538: "20' X 1",
    M0539: '商业发票、装箱单、提货单、入境货物通关单',
    M0540: '销售',
    M0541: 'N/M',
    M0547: im.cn,
    M0548: im.cn,
    M0549: im.legalCn,
    M0550: im.addrCn,
    M0551: im.zip,
    M0552: im.tel,
    M0554: '2026-04-25',
  }, [
    '<M06>',
    `<M0601>${docs.M05B}</M0601>`,
    '<M0602>1</M0602>',
    `<M0603>${product.no}</M0603>`,
    `<M0613>${product.hs}</M0613>`,
    `<M0604>${product.en}</M0604>`,
    '<M0605>425Gx24TINS/CTN</M0605>',
    `<M0606>${round.qty}</M0606>`,
    `<M0607>${product.unit}</M0607>`,
    '<M0608>CHINA</M0608>',
    `<M0609>${round.price.toFixed(2)}</M0609>`,
    `<M0610>${round.amount.toFixed(2)}</M0610>`,
    '<M0611>USD</M0611>',
    '<M0612>照章征税</M0612>',
    '</M06>',
  ].join(''), ['M06']);
  await checkDoc(page, round.contractNo, 'I2', 'M05B', round);
  const customsTypes = ['M07', 'M19', 'M21', 'M41', 'M24B', 'M23B', 'M05B'].filter((t) => notes.some((r) => r.type === t) || t === 'M05B');
  await submitNoteList(page, round.contractNo, 'I5', customsTypes, 'import customs declaration', round);
  await doPost(page, `Import/importDoPost.aspx?cls=I501&id=${round.contractNo}`, 'import tax payment', round);
  await doPost(page, `Import/importDoPost.aspx?cls=I502&id=${round.contractNo}`, 'import pickup', round);
  if (round.payment === 'D/A') await doPost(page, `Import/importDoPost.aspx?cls=I601&id=${round.contractNo}`, 'importer due payment', round);
  notes = await listNotes(page, round.contractNo, 'I2');
  for (const row of notes) docs[row.type] = docs[row.type] || row.docNo;
  await saveDoc(page, 'M43', docs.M43, uid(round.importer, 2), {
    M4301: docs.M43,
    M4307: '2026',
    M4308: '04',
    M4309: im.en,
    M4310: im.code,
    M4312: '1',
    M4313: 'USD',
    M4314: round.amount.toFixed(2),
    M4315: '1',
    M4316: 'USD',
    M4317: round.amount.toFixed(2),
    M4318: 'USD',
    M4320: 'USD',
    M4321: round.amount.toFixed(2),
    M4322: '1',
    M4323: 'USD',
    M4324: round.amount.toFixed(2),
    M4325: '1',
    M4326: 'USD',
    M4327: round.amount.toFixed(2),
    M4330: 'USD',
    M4331: round.amount.toFixed(2),
    M4332: im.legalCn,
    M4333: im.legalCn,
    M4334: '2026',
    M4335: '04',
    M4336: '25',
    M4337: '1',
    M4338: docs.M40 || '',
    M4340: 'USD',
    M4341: round.amount.toFixed(2),
    M4342: '2026-04-25',
    M4343: round.payment,
    M4344: P[round.importer][5].en,
    M4345: '2026-06-15',
    M4346: docs.M05B,
    M4347: im.en,
    M4348: 'USD',
    M4349: round.amount.toFixed(2),
    M4350: '2026-04-25',
    M4353: im.en,
  });
  await checkDoc(page, round.contractNo, 'I2', 'M43', round);
  const verifyTypes = ['M40', 'M05B', 'M43'].filter((t) => notes.some((r) => r.type === t) || t === 'M43');
  await submitNoteList(page, round.contractNo, 'I9', verifyTypes, 'import verification', round);
  await sellImportedGoods(page, round);
}

async function sellImportedGoods(page, round) {
  await page.goto(base + `Import/I7_SaleProduct.aspx?id=&no=${product.no}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(400);
  if (!(await page.locator('#txtINumber').count())) {
    log('import sell skip', await bodyText(page), { round: round.idx, contract: round.contractNo });
    return;
  }
  const available = await page.locator('#txtNumber').inputValue().catch(() => '');
  const qty = Math.min(round.qty, Number(String(available).replace(/[^\d.]/g, '')) || round.qty);
  await page.fill('#txtINumber', String(Math.max(1, Math.floor(qty))));
  await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), page.click('#btnOk')]);
  await page.waitForTimeout(850);
  log('import sell goods', `available=${available}; ${await bodyText(page)}`, { round: round.idx, contract: round.contractNo });
}

async function exporterClose(page, round) {
  await login(page, round.exporter, 1);
  await doPost(page, `Export/ExportDoPost.aspx?cls=E1001&id=${round.contractNo}`, 'exporter settlement', round);
  await submitNoteList(page, round.contractNo, 'E8', ['M28A', 'M05A', 'M36'], 'export verification', round).catch((e) => log('export verification warning', e.message, { round: round.idx, contract: round.contractNo }));
  await submitNoteList(page, round.contractNo, 'E11', ['M19', 'M05A', 'M28A'], 'export tax refund', round).catch((e) => log('export tax refund warning', e.message, { round: round.idx, contract: round.contractNo }));
}

async function runRound(page, raw, profiles) {
  const round = enrichRound(raw);
  log('round start', `${round.contractNo} ${round.payment}+${round.term} exporter=${round.exporter} importer=${round.importer} factory=${round.factory}`, { round: round.idx, contract: round.contractNo });
  const before = await ratingSnapshot(page, 'ratings before round', round.idx);
  const minRating = Math.min(...before.map((r) => r.rating));
  if (minRating <= 0) throw new Error(`rating dropped to zero before round ${round.idx}`);

  await login(page, round.importer, 2);
  await postInfoOrAd(page, 'info', round, '进口商');
  await login(page, round.exporter, 1);
  await postInfoOrAd(page, 'info', round, '出口商');
  await postInfoOrAd(page, 'ad', round, '出口商');
  await postInfoOrAd(page, 'ad', round, '出口商', '公司');
  await login(page, round.factory, 3);
  await postInfoOrAd(page, 'info', round, '工厂');
  await postInfoOrAd(page, 'ad', round, '工厂');
  await postInfoOrAd(page, 'ad', round, '工厂', '公司');

  await createSaleContract(page, round, profiles);
  await saveBudgets(page, round);
  await createDomesticAndProduce(page, round, profiles);
  const docs = await exportPerformance(page, round, profiles);
  await processBankDocuments(page, round);
  await importerPerformance(page, round, docs, profiles);
  await exporterClose(page, round);
  const after = await ratingSnapshot(page, 'ratings after round', round.idx);
  log('round completed', `${round.contractNo} ${round.payment}+${round.term}`, { round: round.idx, contract: round.contractNo, afterRatings: after });
  return { round, docs, before, after, ok: true };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const launchOptions = browserLaunchOptions();
  console.log(`simtrade base: ${base}`);
  console.log(`browser: ${launchOptions.executablePath || 'bundled Chromium'} (${launchOptions.headless ? 'headless' : 'headed'})`);
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();
  page.on('dialog', async (dialog) => {
    log('dialog', dialog.message());
    await dialog.accept();
  });
  const profiles = await loadProfiles(page);
  fs.writeFileSync(path.join(outDir, 'multi_full_profiles.json'), JSON.stringify(profiles, null, 2), 'utf8');
  const completed = [];
  const failed = [];
  try {
    for (const raw of rounds) {
      if (completed.length >= 10) break;
      try {
        const result = await runRound(page, raw, profiles);
        completed.push(result);
      } catch (err) {
        log('round failed', err.stack || err.message, { round: raw.idx });
        failed.push({ round: raw, error: err.stack || err.message });
      }
    }
    const finalRatings = await ratingSnapshot(page, 'final ratings');
    const payload = { completed, failed, finalRatings, results };
    fs.writeFileSync(path.join(outDir, 'multi_full_closure_results.json'), JSON.stringify(payload, null, 2), 'utf8');
    console.log('\nRESULTS_JSON ' + JSON.stringify({ completed: completed.length, failed: failed.length, finalRatings }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  fs.writeFileSync(path.join(outDir, 'multi_full_closure_crash.json'), JSON.stringify({ error: err.stack || err.message, results }, null, 2), 'utf8');
  process.exitCode = 1;
});
