/**
 * 一次性复现脚本：
 * - 沿用 experiments/fulltext-baseline/run.cjs 的全部逻辑与数据
 * - 仅替换 API_KEY 为 sk-cc0c5773a9bc4abaa16a55215833cc5f
 * - 关闭思维链 (thinking=false)
 * - 温度保持 0
 * - 输出到 output/ 下一个新的时间戳目录
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ====== 实验配置（仅此处与原 run.cjs 不同） ======
const API_KEY = 'sk-cc0c5773a9bc4abaa16a55215833cc5f';
const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-flash';
const ENABLE_THINKING = false;           // 本次关闭思维链
const QUESTION_ID = 'hotpot_1911';

const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = path.join(__dirname, '..', '..', 'output', `fulltext-baseline-noCoT-${RUN_TS}`);

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'hotpotqa', 'per-question.json');

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
    // DeepSeek: 显式传 disabled 才能真正关掉 CoT
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

async function main() {
  ensureDir(OUT_DIR);
  console.log(`输出目录: ${OUT_DIR}`);

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

  fs.writeFileSync(path.join(OUT_DIR, 'prompt.txt'),
    `=== SYSTEM ===\n${system}\n\n=== USER ===\n${user}\n\n` +
    `=== STATS ===\ncontext_chars=${contextText.length}, chunks=${chunks.length}, titles=${byTitle.size}\n`
  );
  console.log(`\nprompt 已保存 (context ${contextText.length} chars, ${chunks.length} chunks, ${byTitle.size} titles)`);

  console.log(`\n[fulltext-baseline-noCoT] 发送请求 (model=${MODEL}, thinking=${ENABLE_THINKING}, temp=0)...`);
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

  const score = evaluateAnswer(predictedAnswer, expectedAnswer);
  const em = (score === 1) ? 1 : 0;
  console.log(`\n>>> SCORE: ${score} (${em ? 'EM' : 'no-EM'})`);

  const details = [{
    qid: QUESTION_ID,
    question,
    expectedAnswer,
    predictedAnswer,
    reasoning: reasoning.slice(0, 5000),
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