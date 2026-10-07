/**
 * 全量原文基线实验 — 隔离版
 *
 * 目的：剥去 topology chain / 符号化 / Recall→Reasoning 流水线，
 *       直接把 hotpot_1911 的"题目 + 34 个 chunk 的原文"打包发给同一个 LLM (deepseek-flash)，
 *       看它能不能答对。
 *
 * 设计原则：
 * - 完全自包含：不 import ablation.js / 不依赖任何项目内部函数
 * - API 配置与 Recall LLM 完全一致：deepseek-flash + thinking=true
 * - Prompt 只含题目 + 原文，没有任何 topology / 符号化 / chunk selection 提示词
 * - 分数计算沿用 ablation.js evaluateAnswer 的口径（substring=0.8 / exact=1.0 / 词覆盖）
 *
 * 使用：
 *   node experiments/fulltext-baseline/run.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ====== 实验配置 ======
const API_KEY = 'sk-d6ceb121d4cc49509546f62544cefe53';
const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-flash';
const ENABLE_THINKING = true;            // 与 Recall LLM 配置完全一致
const QUESTION_ID = 'hotpot_1911';

// 输出目录（与已有实验目录 100% 隔离）
const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = path.join(__dirname, '..', '..', 'output', `fulltext-baseline-${RUN_TS}`);

// 数据源
const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'hotpotqa', 'per-question.json');

// ====== 工具函数 ======

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function callLLM({ system, user }) {
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0,
    max_tokens: 384000,
    // DeepSeek-R1 / flash 风格：用 thinking=true 让模型返回 reasoning_content
    thinking: { type: 'enabled' }
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
  // 与 ablation.js evaluateAnswer 完全一致
  const normPred = predicted.toLowerCase().trim().replace(/[.。!！?？]+$/, '');
  const normExp = expected.toLowerCase().trim().replace(/[.。!！?？]+$/, '');
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

// ====== 主流程 ======

async function main() {
  ensureDir(OUT_DIR);
  console.log(`输出目录: ${OUT_DIR}`);

  // 读取题目 + chunks
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const entry = data.questions[QUESTION_ID];
  if (!entry) throw new Error(`题目 ${QUESTION_ID} 在 per-question.json 中未找到`);
  const question = entry.question;
  const expectedAnswer = entry.answer;
  const chunks = entry.chunks;

  console.log(`\n题目: ${question}`);
  console.log(`期望答案: ${expectedAnswer}`);
  console.log(`chunk 总数: ${chunks.length}`);
  console.log(`涉及实体: ${[...new Set(chunks.map(c => c.title))].length} 个`);

  // 构造原文 prompt（按 title 分组、按 sentence 顺序）
  const byTitle = new Map();
  chunks.forEach((c) => {
    if (!byTitle.has(c.title)) byTitle.set(c.title, []);
    byTitle.get(c.title).push(c.text);
  });

  const contextLines = [];
  for (const [title, texts] of byTitle) {
    contextLines.push(`[${title}]`);
    texts.forEach((t, i) => contextLines.push(`${i}. ${t}`));
    contextLines.push('');
  }
  const contextText = contextLines.join('\n').trim();

  const system = 'You are a precise question-answering assistant. Answer with only the short entity name (no explanation).';
  const user = `Context:\n${contextText}\n\nQuestion: ${question}\n\nAnswer:`;

  // 保存完整 prompt
  fs.writeFileSync(path.join(OUT_DIR, 'prompt.txt'),
    `=== SYSTEM ===\n${system}\n\n=== USER ===\n${user}\n\n` +
    `=== STATS ===\ncontext_chars=${contextText.length}, chunks=${chunks.length}, titles=${byTitle.size}\n`
  );
  console.log(`\nprompt 已保存 (context ${contextText.length} chars, ${chunks.length} chunks, ${byTitle.size} titles)`);

  // 调用 LLM
  console.log(`\n[fulltext-baseline] 发送请求 (model=${MODEL}, thinking=${ENABLE_THINKING})...`);
  const t0 = Date.now();
  const resp = await callLLM({ system, user });
  const elapsed = Date.now() - t0;

  const msg = resp.choices?.[0]?.message || {};
  const predictedAnswer = (msg.content || '').trim();
  const reasoning = msg.reasoning_content || '';
  const usage = resp.usage || {};

  console.log(`\nLLM 耗时: ${elapsed} ms`);
  console.log(`usage: prompt=${usage.prompt_tokens}, completion=${usage.completion_tokens}, reasoning=${usage.completion_tokens_details?.reasoning_tokens || 0}`);
  console.log(`\npredictedAnswer: ${predictedAnswer.slice(0, 300)}`);
  console.log(`expectedAnswer:  ${expectedAnswer}`);

  // 评分
  const score = evaluateAnswer(predictedAnswer, expectedAnswer);
  const em = (score === 1) ? 1 : 0;
  console.log(`\n>>> SCORE: ${score} (${em ? 'EM' : 'no-EM'})`);

  // 保存结果
  const details = [{
    qid: QUESTION_ID,
    question,
    expectedAnswer,
    predictedAnswer,
    reasoning: reasoning.slice(0, 5000), // 截断保存，避免无限大
    score,
    em,
    contextChars: contextText.length,
    chunkCount: chunks.length,
    titleCount: byTitle.size,
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens || 0,
      cache_hit: usage.prompt_tokens_details?.cached_tokens || 0
    },
    elapsedMs: elapsed,
    apiConfig: { model: MODEL, thinking: ENABLE_THINKING, temperature: 0, max_tokens: 384000 }
  }];

  fs.writeFileSync(path.join(OUT_DIR, 'fulltext-baseline-details.json'), JSON.stringify(details, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'raw-response.json'), JSON.stringify(resp, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'reasoning.txt'), reasoning);
  fs.writeFileSync(path.join(OUT_DIR, 'answer.txt'), predictedAnswer);

  console.log(`\n所有输出已保存到: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('运行失败:', e);
  process.exit(1);
});