/**
 * 隔离实验：拓扑链"末尾chunk移到前面"消融测试
 *
 * 目的：
 * - 只针对 300 题中 em=1（原始 pipeline 回答完全正确）的题目
 * - 复用已保存的 pipeline-trace.json 里的 baseTopologyChain / displaySymbolTable / nonNounPlaceholders
 *   （不重新跑 Stage 0 NER，不触碰 ablation.js 或任何已有输出目录）
 * - 把拓扑链按 chunk 为单位，从中点切成前后两半，后半部分整体移到前半部分前面
 *   （每个 chunk 内部节点顺序不变，两半各自内部的 chunk 相对顺序也不变）
 * - 用这个重排后的拓扑链重新构造 Recall LLM 的 system/user prompt（逻辑照抄 ablation.js
 *   的 buildRecallSystem / buildRecallUser / renderChain，为保证隔离，本文件自带一份独立实现）
 * - 调用同一个 DeepSeek recall 模型，拿到新的截断片段输出
 * - 把"原始pred" vs "重排后pred" vs "gold" 一起落盘，供人工审查
 *
 * 隔离原则：
 * - 不 import ablation.js，不修改任何已有文件
 * - 只读取 output/test-70samples-2026-10-07/recall-<qid>/pipeline-trace.json（只读）
 * - 只读取 data/hotpotqa/docuverse.json（只读，用于取 chunk title）
 * - 所有输出写到本实验自己的 output/ 子目录
 */

const fs = require('fs');
const path = require('path');

// ===== 配置 =====
const ROOT = path.join(__dirname, '..', '..');
const MAIN_OUTPUT_DIR = path.join(ROOT, 'output', 'test-70samples-2026-10-07');
const DETAIL_PATH = path.join(ROOT, 'output', '_all-300-detail.json');
const DOCUVERSE_PATH = path.join(ROOT, 'data', 'hotpotqa', 'docuverse.json');
const OUT_DIR = path.join(__dirname, 'output');

const API_KEY = process.env.API_KEY || 'sk-6c192794390d4a33b9528b110d58dceb';
const API_URL = process.env.API_URL || 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.MODEL || 'deepseek-flash';
const TEMPERATURE = 0;
const MAX_TOKENS = 384000;
const ENABLE_THINKING_RECALL = false; // 与原 pipeline 的 recall 阶段保持一致

// 命令行参数：--limit N --offset M，用于先小批量验证
const args = process.argv.slice(2);
const cliArgs = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { cliArgs[key] = next; i++; }
    else cliArgs[key] = true;
  }
}
const LIMIT = Number(cliArgs.limit || process.env.LIMIT || 10);
const OFFSET = Number(cliArgs.offset || process.env.OFFSET || 0);
const CONCURRENCY = Number(cliArgs.concurrency || process.env.CONCURRENCY || 3);

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

// ===== 加载 docuverse，构建 chunkKey -> {title} 映射（只读） =====
function loadChunkByKey(docuversePath) {
  const data = JSON.parse(fs.readFileSync(docuversePath, 'utf8'));
  const chunkByKey = new Map();
  if (Array.isArray(data) && data.length > 0 && !data[0].chunks) {
    for (const chunk of data) {
      chunkByKey.set(chunk.chunkKey, { text: chunk.text, title: chunk.title });
    }
  } else {
    for (const doc of data) {
      for (const chunk of doc.chunks) {
        chunkByKey.set(chunk.chunkKey, { text: chunk.text, title: doc.title });
      }
    }
  }
  return chunkByKey;
}

/**
 * 把 pipeline-trace.json 的 step1_buildContext 还原成 ablation.js 里
 * buildQuestionContext 返回的形态：{ symbolTable, baseTopologyChain, nonNounPlaceholders }
 * 全部只读复用已跑过 NER 的结果，不重新调用 spaCy。
 */
function loadQuestionContextFromTrace(trace) {
  const step1 = trace.step1_buildContext;

  // displaySymbolTable: { "noun text": idx } -> Map(noun, idx)，保持原插入顺序（按 idx 升序更稳妥）
  const symbolEntries = Object.entries(step1.displaySymbolTable).sort((a, b) => a[1] - b[1]);
  const symbolTable = new Map(symbolEntries);

  // baseTopologyChain: 数组，字段已经和 buildTopologyChain() 输出的节点字段一致
  const baseTopologyChain = step1.baseTopologyChain;

  // nonNounPlaceholders: { relId: {placeholder, chunkKey, start, end} } -> Map
  const nonNounPlaceholders = new Map(Object.entries(step1.nonNounPlaceholders));

  return { symbolTable, baseTopologyChain, nonNounPlaceholders };
}

/**
 * 核心重排逻辑："把末尾的放到前面"，以 chunk 为单位整体移动。
 *
 * 1. 把 baseTopologyChain（1D 节点数组）按 chunkKey 分组，chunk 单位内部节点顺序不变，
 *    chunk 之间保持它们在原链中第一次出现的相对顺序（即原文阅读序）。
 * 2. 把这些 chunk 单位从中点切成前后两半（chunk 数为奇数时，后半多一个 chunk）。
 * 3. 后半部分整体移到前半部分前面：新链 = 后半 chunk 们（原顺序） + 前半 chunk 们（原顺序）。
 *
 * 不改变每个 chunk 内部节点顺序，不改变每半区内部 chunk 的相对顺序，只整体交换前后两半。
 */
function rotateChainTailToFront(baseTopologyChain) {
  // 按 chunkKey 分组，同时记录 chunk 首次出现的顺序
  const chunkOrder = [];
  const chunkGroups = new Map();
  for (const node of baseTopologyChain) {
    if (!chunkGroups.has(node.chunkKey)) {
      chunkGroups.set(node.chunkKey, []);
      chunkOrder.push(node.chunkKey);
    }
    chunkGroups.get(node.chunkKey).push(node);
  }

  const n = chunkOrder.length;
  const splitPoint = Math.floor(n / 2); // 前半 [0, splitPoint)，后半 [splitPoint, n)
  const frontKeys = chunkOrder.slice(0, splitPoint);
  const backKeys = chunkOrder.slice(splitPoint);

  const newChunkOrder = [...backKeys, ...frontKeys];
  const rotatedChain = [];
  for (const key of newChunkOrder) {
    rotatedChain.push(...chunkGroups.get(key));
  }

  return { rotatedChain, chunkOrder, newChunkOrder, splitPoint };
}

// ===== Prompt 构建（照抄 ablation.js 的 renderChain / buildRecallSystem / buildRecallUser，独立实现以保持隔离） =====

const TOPOLOGY_SYSTEM_HINT = `注意：你看到的拓扑链不是原文，而是符号化后的序列：
- ⟦N⟧ 代表实体名词
- ⟨1⟩、⟨2⟩ 等代表非实体关系（动词、连接词、修饰语等），仅表示"这里存在某种关系"`;

function renderChain(chainOrSegments, chunkByKey) {
  const segments = Array.isArray(chainOrSegments[0]) ? chainOrSegments : [chainOrSegments];
  const cellByKey = new Map();
  const chunkKeySet = new Set();
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx];
    if (!seg) continue;
    for (const node of seg) {
      const k = `${node.chunkKey}__${segIdx}`;
      if (!cellByKey.has(k)) cellByKey.set(k, []);
      cellByKey.get(k).push(node.type === 'noun' ? node.symbol : node.placeholder);
      chunkKeySet.add(node.chunkKey);
    }
  }
  const sortedChunkKeys = [...chunkKeySet].sort();
  const chunkLines = [];
  for (const chunkKey of sortedChunkKeys) {
    const cellSegs = [];
    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const cell = cellByKey.get(`${chunkKey}__${segIdx}`);
      if (cell && cell.length > 0) cellSegs.push(cell.join(''));
    }
    const title = chunkByKey?.get(chunkKey)?.title;
    const prefix = title ? `[${title}] ` : '';
    chunkLines.push(prefix + cellSegs.join(' | '));
  }
  return chunkLines.join('\n');
}

function buildRecallSystem(symbolTable, topologyChain, chunkByKey) {
  const lines = [];
  lines.push(TOPOLOGY_SYSTEM_HINT);
  lines.push('');
  lines.push('符号表：');
  for (const [noun, idx] of symbolTable) lines.push(`⟦${idx}⟧ = ${noun}`);
  lines.push('');
  lines.push('拓扑链（符号化表示，占位符 ⟨1⟩、⟨2⟩ 等代表非名词内容，原文不可见）：');
  lines.push(renderChain(topologyChain, chunkByKey));
  return lines.join('\n');
}

function buildRecallUser(question) {
  const lines = [];
  lines.push('问题：');
  lines.push(question);
  lines.push('');
  lines.push('任务：从拓扑链中选取多个你认为回答问题所需的截断片段。');
  lines.push('');
  lines.push('工作流程（请严格按顺序执行，不要跳步）：');
  lines.push('第一步：完整浏览。必须先把"符号表"和"拓扑链"从头到尾完整读一遍，建立全局认知。');
  lines.push('第二步：基于全局认知定位相关片段。从拓扑链中选取你认为回答问题所必需的截断片段');
  lines.push('');
  lines.push('约束：');
  lines.push('- 每个截断必须是拓扑链中连续的符号序列');
  lines.push('- 不能编造不存在的符号');
  lines.push('- 不能重排符号顺序');
  lines.push('');
  lines.push('输出格式：');
  lines.push('输出多个拓扑链截断片段，用 | 分隔。');
  lines.push('短段示例：⟦1⟧⟨1⟩⟦2⟧ | ⟦3⟧⟨2⟩⟦5⟧');
  lines.push('长段示例：⟦2⟧⟨3⟩⟦3⟩⟨4⟩⟦4⟧⟨5⟩⟦5⟧⟨6⟩⟦6⟧ | ⟦8⟧⟨7⟩⟦10⟧');
  lines.push('');
  lines.push('现在只输出符号序列（多个片段用 | 分隔）：');
  return lines.join('\n');
}

// ===== 解析 Recall LLM 输出（照抄 ablation.js 的 parseTopologyTruncation） =====
function parseTopologyTruncation(output, topologyChain, nonNounPlaceholders) {
  const segments = output.split(/[|、、；；]/).map(s => s.trim()).filter(s => s.length > 0);
  if (segments.length === 0) return { segments: null, usedRelIds: [], valid: false };

  const nounBySymbolIdx = new Map();
  const relationByRelId = new Map();
  const placeholderToRelId = new Map();
  for (const node of topologyChain) {
    if (node.type === 'noun' && node.symbolIdx !== undefined) {
      nounBySymbolIdx.set(node.symbolIdx, node);
    } else if (node.type === 'relation' && node.relId) {
      relationByRelId.set(node.relId, node);
      placeholderToRelId.set(node.placeholder, node.relId);
    }
  }

  const truncatedSegments = [];
  const usedRelIdsSet = new Set();
  const pattern = /⟦(\d+)⟧|⟨([^⟩]+)⟩/g;

  for (const seg of segments) {
    pattern.lastIndex = 0;
    let match;
    const segNodes = [];
    while ((match = pattern.exec(seg)) !== null) {
      if (match[1] !== undefined) {
        const symbolIdx = parseInt(match[1], 10);
        const node = nounBySymbolIdx.get(symbolIdx);
        if (node) segNodes.push(node);
      } else if (match[2] !== undefined) {
        const relId = placeholderToRelId.get(`⟨${match[2]}⟩`);
        const node = relId ? relationByRelId.get(relId) : null;
        if (node) { segNodes.push(node); usedRelIdsSet.add(relId); }
      }
    }
    segNodes.sort((a, b) => {
      if (a.chunkKey !== b.chunkKey) return a.chunkKey < b.chunkKey ? -1 : 1;
      return a.start - b.start;
    });
    if (segNodes.length > 0) truncatedSegments.push(segNodes);
  }

  const usedRelIds = [...usedRelIdsSet];
  const valid = usedRelIds.length > 0;
  return { segments: truncatedSegments, usedRelIds, valid };
}

// ===== 评分（照抄 ablation.js 的 evaluateAnswer） =====
function evaluateAnswer(predicted, expected) {
  const normPred = predicted.toLowerCase().trim().replace(/[.。!！?？]+$/, '');
  const normExp = expected.toLowerCase().trim().replace(/[.。!！?？]+$/, '');
  if (normPred === normExp) return 1;
  if (normExp.includes(normPred) || normPred.includes(normExp)) return 0.8;
  const predWords = new Set(normPred.split(/\s+/));
  const expWords = new Set(normExp.split(/\s+/));
  let matchCount = 0;
  for (const w of expWords) { if (predWords.has(w) || normPred.includes(w)) matchCount++; }
  return matchCount / expWords.size;
}

// ===== DeepSeek API 调用 =====
async function callDeepSeekAPI(messages) {
  const requestBody = {
    model: MODEL,
    messages,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    thinking: { type: ENABLE_THINKING_RECALL ? 'enabled' : 'disabled' },
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} ${response.statusText} - ${text}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('API 返回空 content: ' + JSON.stringify(data).slice(0, 300));
  if (content.includes('<thinking>')) {
    content = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
  }
  const usage = data.usage || null;
  return { content, usage };
}

// ===== 带并发限制的 map（照抄 ablation.js） =====
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function runner() {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await worker(items[cur], cur);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, runner);
  await Promise.all(runners);
  return results;
}

// ===== 单题处理 =====
async function processOneQuestion(qid, detailRow, chunkByKey) {
  const tracePath = path.join(MAIN_OUTPUT_DIR, `recall-${qid}`, 'pipeline-trace.json');
  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
  const question = trace.question.text;
  const expectedAnswer = trace.question.expectedAnswer;
  const originalPred = detailRow.pred;

  const { symbolTable, baseTopologyChain, nonNounPlaceholders } = loadQuestionContextFromTrace(trace);

  if (symbolTable.size === 0 || baseTopologyChain.length === 0) {
    return { qid, question, expectedAnswer, originalPred, error: 'empty symbolTable/chain, skipped' };
  }

  const { rotatedChain, chunkOrder, newChunkOrder, splitPoint } = rotateChainTailToFront(baseTopologyChain);

  const systemContent = buildRecallSystem(symbolTable, rotatedChain, chunkByKey);
  const userContent = buildRecallUser(question);
  const prompt = systemContent + '\n\n[user]\n\n' + userContent;

  let rawResponse = '';
  let usage = null;
  let apiError = null;
  try {
    const resp = await callDeepSeekAPI([
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ]);
    rawResponse = resp.content;
    usage = resp.usage;
  } catch (err) {
    apiError = err.message;
  }

  let truncatedSegments = null, usedRelIds = [], recallValid = false;
  if (!apiError) {
    const parsed = parseTopologyTruncation(rawResponse, rotatedChain, nonNounPlaceholders);
    truncatedSegments = parsed.segments;
    usedRelIds = parsed.usedRelIds;
    recallValid = parsed.valid;
  }

  // 重建“截断片段的原文”，方便人工审查（recall 阶段本身不产出最终答案，
  // 这里只还原 recall 选中的拓扑链片段对应的原文，供人工判断新顺序下 recall 选段是否仍覆盖答案）
  const chunkTextCache = new Map();
  function sliceSafe(chunkKey, start, end) {
    const entry = chunkByKey.get(chunkKey);
    if (!entry || entry.text == null) return '[CHUNK_TEXT_MISSING]';
    return entry.text.slice(Math.min(start, end), Math.max(start, end));
  }
  function nodeToText(node) {
    if (node.type === 'noun') return node.surface || (symbolTable && [...symbolTable.entries()].find(([, i]) => i === node.symbolIdx)?.[0]) || `⟦${node.symbolIdx}⟧`;
    return sliceSafe(node.chunkKey, node.start, node.end);
  }
  let reconstructedSegmentsText = null;
  if (truncatedSegments) {
    reconstructedSegmentsText = truncatedSegments.map(seg => seg.map(nodeToText).join(''));
  }

  const score = evaluateAnswer(originalPred, expectedAnswer); // 仅供参考：原 pipeline 的分数（应恒为1，因为筛选的是 em=1）

  return {
    qid,
    question,
    expectedAnswer,
    originalPred,
    rotation: { totalChunks: chunkOrder.length, splitPoint, originalChunkOrder: chunkOrder, rotatedChunkOrder: newChunkOrder },
    promptLength: prompt.length,
    recallRawResponse: rawResponse,
    recallValid,
    reconstructedSegmentsText, // 重排后 recall 选中的片段的原文，供人工审查
    usage,
    apiError,
    originalScoreForReference: score,
  };
}

// ===== 主流程 =====
async function main() {
  ensureDir(OUT_DIR);

  const detail = JSON.parse(fs.readFileSync(DETAIL_PATH, 'utf8'));
  const em1Rows = detail.filter(d => d.em === 1).sort((a, b) => a.qid.localeCompare(b.qid, undefined, { numeric: true }));
  console.log(`em=1 题目总数: ${em1Rows.length}`);

  const targetRows = em1Rows.slice(OFFSET, OFFSET + LIMIT);
  console.log(`本次运行范围: offset=${OFFSET}, limit=${LIMIT}, 实际题数=${targetRows.length}`);
  console.log(`题目: ${targetRows.map(r => r.qid).join(', ')}`);

  const chunkByKey = loadChunkByKey(DOCUVERSE_PATH);
  console.log(`docuverse chunk 数: ${chunkByKey.size}`);

  const t0 = Date.now();
  const results = await mapWithConcurrency(targetRows, CONCURRENCY, async (row) => {
    try {
      const r = await processOneQuestion(row.qid, row, chunkByKey);
      console.log(`[${r.qid}] 完成. valid=${r.recallValid}, apiError=${r.apiError || 'none'}`);
      return r;
    } catch (err) {
      console.error(`[${row.qid}] 处理失败:`, err.message);
      return { qid: row.qid, question: row.question, expectedAnswer: row.gold, originalPred: row.pred, error: err.message };
    }
  });
  const elapsed = Date.now() - t0;

  const outPath = path.join(OUT_DIR, `reorder-results-offset${OFFSET}-limit${LIMIT}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n完成，用时 ${elapsed}ms. 结果写入: ${outPath}`);

  const okCount = results.filter(r => !r.error && !r.apiError).length;
  console.log(`成功: ${okCount}/${results.length}`);
}

main().catch((e) => {
  console.error('运行失败:', e);
  process.exit(1);
});
