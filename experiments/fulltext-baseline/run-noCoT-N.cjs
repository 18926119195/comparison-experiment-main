/**
 * 全量原文基线 × N — 关闭 CoT
 *
 * 配置通过命令行参数:
 *   node run-noCoT-N.cjs [N=200]
 *
 * 自动跳过任何已经跑过的 qid（按 details.json 中已有的 qid 去重）。
 * 默认目标是批到 N=200（处理剩余的 200 题）。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = 'sk-cc0c5773a9bc4abaa16a55215833cc5f';
const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-flash';

const ROOT = path.resolve(__dirname, '..', '..');
const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = path.join(ROOT, 'output', `fulltext-baseline-noCoT-200-${RUN_TS}`);
const DATA_PATH = path.join(ROOT, 'data', 'hotpotqa', 'per-question.json');
const PREV_DIR = path.join(ROOT, 'output', 'fulltext-baseline-noCoT-100-2026-10-07T11-27-29');

const TARGET_N = parseInt(process.argv[2] || '200', 10);

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function callLLM({ system, user }) {
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0,
    max_tokens: 384000,
    thinking: { type: 'disabled' }
  });
  return new Promise((resolve, reject) => {
    const req = https.request(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (parsed.error) return reject(new Error('API error: ' + JSON.stringify(parsed.error)));
          resolve(parsed);
        } catch (e) { reject(new Error('JSON parse failed: ' + buf.slice(0, 500))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function evaluateAnswer(predicted, expected) {
  const norm = (s) => s.toLowerCase().trim().replace(/[.。!！?？]+$/, '');
  const np = norm(predicted), ne = norm(expected);
  if (np === ne) return 1;
  if (ne.includes(np) || np.includes(ne)) return 0.8;
  const pw = new Set(np.split(/\s+/)), ew = new Set(ne.split(/\s+/));
  let m = 0; for (const w of ew) if (pw.has(w) || np.includes(w)) m++;
  return m / ew.size;
}

function buildContext(entry) {
  const byTitle = new Map();
  entry.chunks.forEach((c) => {
    if (!byTitle.has(c.title)) byTitle.set(c.title, []);
    byTitle.get(c.title).push(c.text);
  });
  const lines = [];
  for (const [title, texts] of byTitle) {
    lines.push(`[${title}]`);
    texts.forEach((t, j) => lines.push(`${j}. ${t}`));
    lines.push('');
  }
  return { contextText: lines.join('\n').trim(), byTitle };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  ensureDir(OUT_DIR);
  console.log(`输出目录: ${OUT_DIR}`);

  // 读数据
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const allIds = Object.keys(data.questions).sort();

  // 跳过已跑的 qid（从之前的 details.json 里读）
  const prevDetails = JSON.parse(fs.readFileSync(path.join(PREV_DIR, 'details.json'), 'utf8'));
  const doneIds = new Set(prevDetails.map(x => x.qid));
  console.log(`已跑过的 qid 数: ${doneIds.size}`);

  const remainingIds = allIds.filter(id => !doneIds.has(id));
  const targetIds = remainingIds.slice(0, TARGET_N);
  console.log(`本题待跑: ${targetIds.length} (上限 ${TARGET_N})`);

  const system = 'You are a precise question-answering assistant. Answer with only the short entity name (no explanation).';
  const details = [];
  const failures = [];
  const tStart = Date.now();

  for (let i = 0; i < targetIds.length; i++) {
    const qid = targetIds[i];
    const entry = data.questions[qid];
    const tag = String(i + 1).padStart(3, '0');

    try {
      const { contextText, byTitle } = buildContext(entry);
      const user = `Context:\n${contextText}\n\nQuestion: ${entry.question}\n\nAnswer:`;
      fs.writeFileSync(path.join(OUT_DIR, `prompt-q${tag}.txt`),
        `=== QID ===\n${qid}\n\n=== SYSTEM ===\n${system}\n\n=== USER ===\n${user}\n`, 'utf8');

      const t0 = Date.now();
      const resp = await callLLM({ system, user });
      const elapsedMs = Date.now() - t0;

      const msg = resp.choices?.[0]?.message || {};
      const predictedAnswer = (msg.content || '').trim();
      const usage = resp.usage || {};
      const score = evaluateAnswer(predictedAnswer, entry.answer);
      const em = (score === 1) ? 1 : 0;

      fs.writeFileSync(path.join(OUT_DIR, `answer-q${tag}.txt`), predictedAnswer, 'utf8');

      details.push({
        qid, index: i + 1, question: entry.question,
        expectedAnswer: entry.answer,
        predictedAnswer, score, em,
        contextChars: contextText.length,
        chunkCount: entry.chunks.length,
        titleCount: byTitle.size,
        reasoning_tokens: (usage.completion_tokens_details || {}).reasoning_tokens || 0,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
        elapsedMs
      });

      if ((i + 1) % 25 === 0 || i === targetIds.length - 1) {
        const emSoFar = details.reduce((a, d) => a + d.em, 0);
        const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
        console.log(`[${tag}/${targetIds.length}] cumulative EM=${emSoFar}/${i+1} (${(100*emSoFar/(i+1)).toFixed(1)}%) elapsed=${elapsed}s`);
      } else {
        console.log(`[${tag}/${targetIds.length}] ${qid}  pred="${predictedAnswer.slice(0,32)}"  score=${score} em=${em}  ${elapsedMs}ms`);
      }

      await sleep(120);
    } catch (e) {
      console.error(`[${tag}] ${qid} 失败: ${e.message}`);
      failures.push({ qid, index: i + 1, error: e.message });
    }
  }

  const n = details.length;
  const em = details.reduce((a, d) => a + d.em, 0);
  const totalScore = details.reduce((a, d) => a + d.score, 0);
  const summary = {
    config: { model: MODEL, apiKey: API_KEY.slice(0, 8) + '…', thinking: 'disabled', temperature: 0, targetN: TARGET_N },
    n, nFailed: failures.length,
    em, emPct: n ? +(100 * em / n).toFixed(2) : 0,
    avgScore: n ? +(totalScore / n).toFixed(4) : 0,
    avgPromptTokens: n ? Math.round(details.reduce((a, d) => a + (d.prompt_tokens || 0), 0) / n) : 0,
    avgCompletionTokens: n ? Math.round(details.reduce((a, d) => a + (d.completion_tokens || 0), 0) / n) : 0,
    totalReasoningTokens: details.reduce((a, d) => a + (d.reasoning_tokens || 0), 0),
    avgElapsedMs: n ? Math.round(details.reduce((a, d) => a + d.elapsedMs, 0) / n) : 0,
    totalElapsedMs: details.reduce((a, d) => a + d.elapsedMs, 0),
    skipDoneQids: Array.from(doneIds),
    runTs: RUN_TS,
    failures
  };

  fs.writeFileSync(path.join(OUT_DIR, 'details.json'), JSON.stringify(details, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'failures.json'), JSON.stringify(failures, null, 2), 'utf8');

  console.log('\n========== SUMMARY ==========');
  console.log(`成功: ${n} 题   失败: ${failures.length} 题`);
  console.log(`EM:      ${em}/${n}  (${summary.emPct}%)`);
  console.log(`avgScore: ${summary.avgScore}`);
  console.log(`avg prompt_tokens: ${summary.avgPromptTokens},  avg completion_tokens: ${summary.avgCompletionTokens}`);
  console.log(`total reasoning_tokens: ${summary.totalReasoningTokens}`);
  console.log(`总耗时: ${(summary.totalElapsedMs/1000).toFixed(1)}s`);
  console.log(`\n所有输出已保存到: ${OUT_DIR}`);
}

main().catch((e) => { console.error('运行失败:', e); process.exit(1); });