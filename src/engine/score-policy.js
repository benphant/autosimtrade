import documentMap from '../guide/document-map.json' with { type: 'json' };

export function evaluateDocumentCheck(docType, checkText) {
  const doc = documentMap.documents[docType] || { targetScore: 85, strict: false, blockingErrors: [] };
  const score = parseScore(checkText);
  const blocking = (doc.blockingErrors || []).find(error => checkText.includes(error));
  return {
    docType,
    score,
    targetScore: doc.targetScore,
    strict: Boolean(doc.strict),
    blocking,
    ok: !blocking && score >= doc.targetScore,
    canProceedTemporarily: !blocking && !doc.strict && score >= 70
  };
}

export function parseScore(text) {
  const match = String(text || '').match(/正确率\s*([0-9]+)%/);
  if (match) return Number(match[1]);
  if (/检查未发现错误|未发现错误|已通过/.test(String(text || ''))) return 100;
  return 0;
}
