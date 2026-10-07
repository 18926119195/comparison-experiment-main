/**
 * 全量原文基线 ×100 — 关闭 CoT
 *
 * 与 run-noCoT.cjs 完全相同的 API 调用方式（API key、temperature、thinking=disabled），
 * 只是把范围扩到 100 题（per-question.json 里跳过 hotpot_1911）。
 *
 * 输出：
 *   output/fulltext-baseline-noCoT-100-<TS>/
 *         ├── details.json                 # 100 题逐题结果
 *         ├── summary.json                # 汇总指标
 *         ├── prompt-q001.txt ...         # 每题 prompt（便于抽查）
 *         └── answer-q001.txt ...         # 每题答案
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = 'sk-cc0c5773a9bc4abaa16a55215833cc5f';
const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-flash';
const SKIP_QID = 'hotpot_1911';                  // 已在 run-noCoT.cjs 中跑过
const TARGET_N = 100;

const ROOT = path.resolve(__dirname, '..', '..');
const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = path.join(ROOT, 'output', `fulltext-baseline-noCoT-100-${RUN_TS}`);
const DATA_PATH = path.join(ROOT, 'data', 'hotpotqa', 'per-question.json');

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
    thinking: { type: 'disabled' }                // 真正关掉 CoT
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
      res.on('data', (chunk) => { buf += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (parsed.error) return reject(new Error('API error: ' + JSON.stringify(parsed.error)));
          resolve(parsed);
        } catch (e) {
          reject(new Error('JSON parse failed: ' + buf.slice(0, 500)));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function evaluateAnswer(predicted, expected) {
  const norm = (s) => s.toLowerCase().trim().replace(/[.。!！?？]+$/, '');
  const normPred = norm(predicted);
  const normExp = norm(expected);
  if (normPred === normExp) return 1;
  if (normExp.includes(normPred) || normPred.includes(normExp)) return 0.8;
  const predWords = new Set(normPred.split(/\s+/));
  const expWords = new Set(normExp.split(/\s+/));
  let matchCount = 0;
  for (const w of expWords) {
    if (predWords.has(w) || normPred.includes(w)) matchCount++;
  }
  return matchCount / expWords.size;
}

function buildPrompt(entry) {
  const byTitle = new Map();
  entry.chunks.forEach((c) => {
    if (!byTitle.has(c.title)) byTitle.set(c.title, []);
    byTitle.get(c.title).push(c.text);
  });
  const lines = [];
  for (const [title, texts] of byTitle) {
    lines.push(`[${title}]`);
    texts.forEach((t, i) => lines.push(`${i}. ${t}`));
    lines.push('');
  }
  return {
    contextText: lines.join('\n').trim(),
    byTitle
  }.byTitle, lines;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  ensureDir(OUT_DIR);
  console.log(`输出目录: ${OUT_DIR}`);

  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const allIds = Object.keys(data.questions).sort();
  const targetIds = allIds.filter(id => id !== SKIP_QID).slice(0, TARGET_N);
  console.log(`题目总数=${allIds.length}, 跳过=${SKIP_QID}, 本次跑=${targetIds.length}`);

  const system = 'You are a precise question-answering assistant. Answer with only the short entity name (no explanation).';
  const details = [];
  const failures = [];

  for (let i = 0; i < targetIds.length; i++) {
    const qid = targetIds[i];
    const entry = data.questions[qid];
    const tag = String(i + 1).padStart(3, '0');

    try {
      // 构造 prompt
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
      const contextText = lines.join('\n').trim();
      const user = `Context:\n${contextText}\n\nQuestion: ${entry.question}\n\nAnswer:`;

      // 保存 prompt
      fs.writeFileSync(path.join(OUT_DIR, `prompt-q${tag}.txt`),
        `=== QID ===\n${qid}\n\n=== SYSTEM ===\n${system}\n\n=== USER ===\n${user}\n`,
        'utf8'
      );

      // 调用 LLM
      const t0 = Date.now();
      const resp = await callLLM({ system, user });
      const elapsedMs = Date.now() - t0;

      const msg = resp.choices?.[0]?.message || {};
      const predictedAnswer = (msg.content || '').trim();
      const reasoning = msg.reasoning_content || '';
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
        elapsedMs,
        cache_hit: (usage.prompt_tokens_details || {}).cached_tokens || 0
      });

      console.log(`[${tag}/${targetIds.length}] ${qid}  pred="${predictedAnswer.slice(0,40)}"  exp="${entry.answer.slice(0,40)}"  score=${score} em=${em}  ${elapsedMs}ms`);

      await sleep(150); // 轻微节流
    } catch (e) {
      console.error(`[${tag}] ${qid} 失败: ${e.message}`);
      failures.push({ qid, index: i + 1, error: e.message });
    }
  }

  // 汇总
  const n = details.length;
  const em = details.reduce((a, d) => a + d.em, 0);
  const totalScore = details.reduce((a, d) => a + d.score, 0);
  const summary = {
    config: { model: MODEL, apiKey: API_KEY.slice(0, 8) + '…', thinking: 'disabled', temperature: 0 },
    n, nFailed: failures.length,
    em, emPct: n ? +(100 * em / n).toFixed(2) : 0,
    avgScore: n ? +(totalScore / n).toFixed(4) : 0,
    avgPromptTokens: n ? Math.round(details.reduce((a, d) => a + (d.prompt_tokens || 0), 0) / n) : 0,
    avgCompletionTokens: n ? Math.round(details.reduce((a, d) => a + (d.completion_tokens || 0), 0) / n) : 0,
    totalReasoningTokens: details.reduce((a, d) => a + (d.reasoning_tokens || 0), 0),
    avgElapsedMs: n ? Math.round(details.reduce((a, d) => a + d.elapsedMs, 0) / n) : 0,
    totalElapsedMs: details.reduce((a, d) => a + d.elapsedMs, 0),
    skipQid: SKIP_QID,
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
  console.log(`total reasoning_tokens: ${summary.totalReasoningTokens}  (确认 CoT 已关)`);
  console.log(`总耗时: ${(summary.totalElapsedMs/1000).toFixed(1)}s`);
  console.log(`\n所有输出已保存到: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('运行失败:', e);
  process.exit(1);
});