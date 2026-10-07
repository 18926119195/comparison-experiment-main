const fs = require('fs');
const path = require('path');

const mainDir = 'output/test-70samples-2026-10-07';
const audit = JSON.parse(fs.readFileSync(path.join(mainDir, 'recall-coverage-audit.json'), 'utf8'));

// Build chunkKey -> text index from docuverse (covers both datasets just in case)
const chunkText = new Map();
for (const f of ['data/hotpotqa/docuverse.json', 'data/2wikimultihop/docuverse.json']) {
  if (!fs.existsSync(f)) continue;
  const dv = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const item of dv) {
    chunkText.set(item.chunkKey, item.text);
  }
}

function sliceSafe(text, start, end) {
  if (text == null) return '[CHUNK_TEXT_MISSING]';
  const s = Math.min(start, end);
  const e = Math.max(start, end);
  const piece = text.slice(s, e);
  return piece;
}

const out = [];
for (const row of audit) {
  const qid = row.qid;
  const traceFile = path.join(mainDir, `recall-${qid}`, 'pipeline-trace.json');
  if (!fs.existsSync(traceFile)) {
    out.push({ qid, question: row.question, expectedAnswer: row.expectedAnswer, reconstructed: null, error: 'trace file missing' });
    continue;
  }
  const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));

  const symbolTable = trace.step1_buildContext.displaySymbolTable;
  const idxToWord = new Map();
  for (const [word, idx] of Object.entries(symbolTable)) idxToWord.set(idx, word);

  const segments = trace.step3_handoff.truncatedSegmentsOrChain || [];
  const segmentTexts = [];
  for (const seg of segments) {
    const parts = [];
    for (const node of seg) {
      if (node.type === 'noun' && node.symbolIdx != null) {
        const w = idxToWord.get(node.symbolIdx);
        parts.push(w ? `[${w}]` : '[?]');
      } else if (node.type === 'relation') {
        const text = chunkText.get(node.chunkKey);
        const rel = sliceSafe(text, node.start, node.end);
        parts.push(rel);
      }
    }
    segmentTexts.push(parts.join(''));
  }

  out.push({
    qid,
    question: trace.question.text,
    expectedAnswer: trace.question.expectedAnswer,
    reconstructedSegments: segmentTexts,
  });
}

out.sort((a, b) => a.qid.localeCompare(b.qid, undefined, { numeric: true }));
fs.writeFileSync(path.join(mainDir, 'all-cases-reconstructed-text.json'), JSON.stringify(out, null, 2));
console.log('Wrote', out.length, 'cases to all-cases-reconstructed-text.json');
console.log('missing chunk text count (approx):', out.filter(o => (o.reconstructedSegments||[]).some(s => s.includes('[CHUNK_TEXT_MISSING]'))).length);
