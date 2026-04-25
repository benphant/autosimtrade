function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function normalizeSelectedAccounts(accounts) {
  return [...new Set((accounts || []).map(raw => String(raw).trim()).filter(Boolean))];
}

function ensureAccountRecords(state, accounts) {
  state.accounts ||= {};
  for (const account of accounts) {
    state.accounts[account] ||= defaultAccountRecord(account);
    state.accounts[account].ratings ||= defaultAccountRecord(account).ratings;
    state.accounts[account].completed ||= defaultAccountRecord(account).completed;
    state.accounts[account].completed.exporter ||= defaultAccountRecord(account).completed.exporter;
    state.accounts[account].completed.importer ||= defaultAccountRecord(account).completed.importer;
    state.accounts[account].roleRuns ||= {};
    state.accounts[account].roleRuns.exporter ??= countCompletedPayments(state.accounts[account], 'exporter');
    state.accounts[account].roleRuns.importer ??= countCompletedPayments(state.accounts[account], 'importer');
    state.accounts[account].roleRuns.factory ??= Number(state.accounts[account].completed.factoryDeals || 0);
  }
}

function countCompletedPayments(record, role) {
  return Object.values(record.completed?.[role] || {}).filter(Boolean).length;
}

function paymentMissingScore(record, role, payment) {
  const done = record.completed?.[role]?.[payment];
  return done ? 0 : 10;
}

function roleRating(record, role) {
  return Number(record.ratings?.[role] ?? 1);
}

function roleRuns(record, role) {
  return Number(record.roleRuns?.[role] ?? 0);
}

function pickBalancedAccount(candidates, state, role, payment, exclude = new Set(), offset = 0) {
  const usable = candidates.filter(account => !exclude.has(account));
  const pool = usable.length ? usable : candidates;
  return pool
    .map((account, index) => {
      const record = state.accounts[account];
      const completedScore = role === 'factory' ? 0 : paymentMissingScore(record, role, payment);
      return {
        account,
        runs: roleRuns(record, role),
        completedScore,
        rating: roleRating(record, role),
        order: (index - offset + pool.length) % pool.length
      };
    })
    .sort((a, b) =>
      a.runs - b.runs ||
      b.completedScore - a.completedScore ||
      a.rating - b.rating ||
      a.order - b.order
    )[0]?.account;
}

function nextPayment(guide, state, candidates, roundIndex, preferredPayments) {
  const payments = preferredPayments?.length ? preferredPayments : guide.roleRequirements.exporter.requiredPayments;
  const scored = payments.map(payment => {
    let score = 0;
    for (const account of candidates) {
      const record = state.accounts[account];
      score += paymentMissingScore(record, 'exporter', payment);
      score += paymentMissingScore(record, 'importer', payment);
    }
    return { payment, score };
  });
  scored.sort((a, b) => b.score - a.score);
  if (scored[0]?.score > 0) return scored[0].payment;
  return payments[(roundIndex - 1) % payments.length];
}

function nextTerm(guide, state, candidates, roundIndex, preferredTerms) {
  const terms = preferredTerms?.length ? preferredTerms : guide.roleRequirements.exporter.requiredTerms;
  return terms[(roundIndex - 1) % terms.length] || 'CIF';
}

function mutateProjectedState(state, round) {
  const exporter = state.accounts[round.exporter];
  const importer = state.accounts[round.importer];
  const factory = state.accounts[round.factory];
  if (exporter?.completed?.exporter) exporter.completed.exporter[round.payment] = true;
  if (importer?.completed?.importer) importer.completed.importer[round.payment] = true;
  if (factory?.completed) factory.completed.factoryDeals = Number(factory.completed.factoryDeals || 0) + 1;
  if (exporter?.roleRuns) exporter.roleRuns.exporter = Number(exporter.roleRuns.exporter || 0) + 1;
  if (importer?.roleRuns) importer.roleRuns.importer = Number(importer.roleRuns.importer || 0) + 1;
  if (factory?.roleRuns) factory.roleRuns.factory = Number(factory.roleRuns.factory || 0) + 1;
}

export function planRounds({ guide, state, accounts, rounds = 1, mode = 'balanced', preferredPayments, preferredTerms }) {
  const projected = clone(state);
  const primary = normalizeSelectedAccounts(accounts || []);
  if (!primary.length) {
    throw new Error('请至少填写一个账号');
  }
  ensureAccountRecords(projected, primary);
  const planned = [];

  for (let i = 1; i <= Math.max(1, rounds); i += 1) {
    const payment = nextPayment(guide, projected, primary, i, preferredPayments);
    const term = nextTerm(guide, projected, primary, i, preferredTerms);
    const rotation = i - 1;
    let exporter;
    let importer;
    let factory;
    if (primary.length === 1) {
      exporter = primary[0];
      importer = primary[0];
      factory = primary[0];
    } else {
      exporter = pickBalancedAccount(primary, projected, 'exporter', payment, new Set(), rotation);
      importer = pickBalancedAccount(primary, projected, 'importer', payment, new Set([exporter]), rotation + 1);
      factory = pickBalancedAccount(
        primary,
        projected,
        'factory',
        payment,
        primary.length >= 3 ? new Set([exporter, importer]) : new Set(),
        rotation + 2
      );
    }
    const contractNo = `AUTO${new Date().toISOString().slice(2, 10).replace(/-/g, '')}${String(i).padStart(3, '0')}`;
    const round = {
      index: i,
      contractNo,
      payment,
      term,
      exporter,
      importer,
      factory,
      mode,
      route: guide.paymentRoutes[payment],
      termRule: guide.termRules[term],
      expectedDocuments: expectedDocuments(payment, term),
      reason: explainRound(projected, exporter, importer, factory, payment)
    };
    planned.push(round);
    mutateProjectedState(projected, round);
  }

  return {
    createdAt: new Date().toISOString(),
    pdfFirst: true,
    accounts: primary,
    helperAccounts: [],
    rounds: planned,
    coverage: summarizeCoverage(projected, primary)
  };
}

function expectedDocuments(payment, term) {
  const docs = ['M07', 'M50A', 'M50B', 'M12', 'M14', 'M17A', 'M19', 'M21', 'M03B', 'M28A', 'M05A', 'M44'];
  if (payment === 'L/C') docs.push('M40', 'M30', 'M31');
  if (payment === 'D/P' || payment === 'D/A') docs.push('M42');
  if (term === 'CIF' || term === 'CFR' || term === 'FOB') docs.push('M25');
  docs.push('M17B', 'M05B', 'M43');
  return docs;
}

function explainRound(state, exporter, importer, factory, payment) {
  const exMissing = !state.accounts[exporter]?.completed?.exporter?.[payment];
  const imMissing = !state.accounts[importer]?.completed?.importer?.[payment];
  const factoryDeals = Number(state.accounts[factory]?.completed?.factoryDeals || 0);
  return [
    exMissing ? `${exporter}出口商缺${payment}` : `${exporter}出口商补充${payment}熟练度`,
    imMissing ? `${importer}进口商缺${payment}` : `${importer}进口商补充${payment}熟练度`,
    factoryDeals < 3 ? `${factory}工厂未满3笔` : `${factory}工厂作为配套备货`
  ].join('；');
}

function summarizeCoverage(state, accounts) {
  const result = {};
  for (const account of accounts) {
    const record = state.accounts[account];
    result[account] = {
      ratings: record.ratings,
      exporterMissing: Object.entries(record.completed.exporter).filter(([, done]) => !done).map(([p]) => p),
      importerMissing: Object.entries(record.completed.importer).filter(([, done]) => !done).map(([p]) => p),
      factoryDeals: record.completed.factoryDeals
    };
  }
  return result;
}
