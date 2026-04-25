export function classifyError(errorOrText) {
  const message = String(errorOrText?.message || errorOrText || '');

  if (/别处登录|重新登录|登录|login/i.test(message)) return 'LOGIN_EXPIRED';
  if (/timeout|Navigation|ECONN|network|连接/i.test(message)) return 'NETWORK';
  if (/填写错误|检查未通过|正确率|缺少以下单据/i.test(message)) return 'FORM_VALIDATION';
  if (/全部落海|未换取提货单|货损|索赔/i.test(message)) return 'RANDOM_BUSINESS_EVENT';
  if (/未接受信用证|未开证|信用证/i.test(message)) return 'LC_CHAIN_BREAK';
  if (/未办理结汇|未收到结汇通知|未办理出口核销|未办理出口退税/i.test(message)) return 'SETTLEMENT_CHAIN_BREAK';

  return 'UNKNOWN';
}

export function canRetry(errorType) {
  return ['LOGIN_EXPIRED', 'NETWORK', 'FORM_VALIDATION'].includes(errorType);
}

export function shouldSkipRound(errorType) {
  return ['RANDOM_BUSINESS_EVENT', 'LC_CHAIN_BREAK', 'SETTLEMENT_CHAIN_BREAK'].includes(errorType);
}
