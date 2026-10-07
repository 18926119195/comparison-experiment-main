// Audit: for each question, does the Recall LLM's selected segments (truncatedSegmentsOrChain)
// contain a noun symbol whose text overlaps with the expected answer?
// This checks RECALL coverage specifically, independent of whether Reasoning produced a correct final answer.

const fs = require('fs');
const path = require('path');

const mainDir = 'output/test-70samples-2026-10-07';

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\u4e00-\u9fff ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split expected answer into meaningful tokens (drop stopwords/short tokens)
const STOPWORDS = new Set(['the','a','an','of','in','on','at','to','and','or','is','was','were','for','by','as','with']);
function tokens(s) {
  return normalize(s).split(' ').filter(t => t.length > 1 && !STOPWORDS.has(t));
}

const qdirs = fs.readdirSync(mainDir).filter(d => d.startsWith('recall-hotpot_'));

const results = [];

for (const qd of qdirs) {
  const traceFile = path.join(mainDir, qd, 'pipeline-trace.json');
  if (!fs.existsSync(traceFile)) continue;
  const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));

  const qid = trace.question.id;
  const question = trace.question.text;
  const expectedAnswer = trace.question.expectedAnswer;
  const symbolTable = trace.step1_buildContext.displaySymbolTable; // word -> idx
  const idxToWord = new Map();
  for (const [word, idx] of Object.entries(symbolTable)) {
    idxToWord.set(idx, word);
  }

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
  const selectedText = normalize(selectedWords.join(' | '));

  const expTokens = tokens(expectedAnswer);
  const expNorm = normalize(expectedAnswer);

  // Full-string containment (normalized)
  const fullMatch = expNorm.length > 0 && selectedText.includes(expNorm);
  // Token-level: how many of the expected answer's tokens appear as substrings in selected words
  const matchedTokens = expTokens.filter(t => selectedText.includes(t));
  const tokenCoverage = expTokens.length > 0 ? matchedTokens.length / expTokens.length : 0;

  results.push({
    qid,
    question,
    expectedAnswer,
    recallValid: trace.step2_recall ? trace.step2_recall.recallValid !== false : null,
    selectedNounCount: selectedWords.length,
    fullMatch,
    tokenCoverage: +tokenCoverage.toFixed(2),
    matchedTokens,
    missingTokens: expTokens.filter(t => !selectedText.includes(t)),
  });
}

results.sort((a, b) => a.qid.localeCompare(b.qid, undefined, { numeric: true }));

const fullMatchCount = results.filter(r => r.fullMatch).length;
const partialCount = results.filter(r => !r.fullMatch && r.tokenCoverage > 0).length;
const zeroCount = results.filter(r => r.tokenCoverage === 0).length;

console.log(`Total questions audited: ${results.length}`);
console.log(`Recall contains FULL expected answer string: ${fullMatchCount} (${(fullMatchCount/results.length*100).toFixed(1)}%)`);
console.log(`Recall contains SOME tokens (partial):        ${partialCount} (${(partialCount/results.length*100).toFixed(1)}%)`);
console.log(`Recall contains NO tokens of expected answer: ${zeroCount} (${(zeroCount/results.length*100).toFixed(1)}%)`);
console.log('');
console.log('--- Questions where recall MISSED the answer entirely (tokenCoverage=0) ---');
for (const r of results.filter(r => r.tokenCoverage === 0)) {
  console.log(`[${r.qid}] Q: ${r.question.slice(0,80)}`);
  console.log(`    expected: "${r.expectedAnswer}"  selectedNouns=${r.selectedNounCount}`);
}

fs.writeFileSync(path.join(mainDir, 'recall-coverage-audit.json'), JSON.stringify(results, null, 2));
console.log('\nWrote full audit to recall-coverage-audit.json');
