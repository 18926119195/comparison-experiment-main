const fs = require('fs');
const path = require('path');

const mainDir = 'output/test-70samples-2026-10-07';
const audit = JSON.parse(fs.readFileSync(path.join(mainDir, 'recall-coverage-audit.json'), 'utf8'));
const partialQids = new Set(audit.filter(r => !r.fullMatch && r.tokenCoverage > 0).map(r => r.qid));

const out = [];
for (const qid of partialQids) {
  const traceFile = path.join(mainDir, `recall-${qid}`, 'pipeline-trace.json');
  if (!fs.existsSync(traceFile)) continue;
  const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));

  const symbolTable = trace.step1_buildContext.displaySymbolTable;
  const idxToWord = new Map();
  for (const [word, idx] of Object.entries(symbolTable)) idxToWord.set(idx, word);

  const segments = trace.step3_handoff.truncatedSegmentsOrChain || [];
  const selectedWords = [];
  for (const seg of segments) {
    for (const node of seg) {
      if (node.type === 'noun' && node.symbolIdx != null) {
        const w = idxToWord.get(node.symbolIdx);
        if (w) selectedWords.push(w);
      }
    }
  }

  out.push({
    qid,
    question: trace.question.text,
    expectedAnswer: trace.question.expectedAnswer,
    selectedNouns: selectedWords,
  });
}

out.sort((a, b) => a.qid.localeCompare(b.qid, undefined, { numeric: true }));
fs.writeFileSync(path.join(mainDir, 'partial-cases-for-review.json'), JSON.stringify(out, null, 2));
console.log('Wrote', out.length, 'cases to partial-cases-for-review.json');
