// ===== 配置 =====
import path from 'path';
import fs from 'fs';

// ===== 命令行参数解析 =====
const args = process.argv.slice(2);
const cliArgs = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      cliArgs[key] = next;
      i++;
    } else {
      cliArgs[key] = true;
    }
  }
}

const CONFIG = {
  // 模式：baseline, recall, random
  MODE: cliArgs.mode || process.env.MODE || 'recall',
  // 各自独立的 API key
  API_KEY: cliArgs['api-key'] || process.env.API_KEY || 'sk-6c192794390d4a33b9528b110d58dceb',
  API_URL: cliArgs['api-url'] || process.env.API_URL || 'https://api.deepseek.com/chat/completions',
  // 各自独立的输出目录
  // 默认带上时间戳后缀（YYYY-MM-DDTHH-mm-ss），避免不同运行互相覆盖
  // 用户可通过 --output 或 OUTPUT 环境变量显式指定路径来关闭时间戳
  _runTimestamp: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
  OUTPUT_DIR: cliArgs['output'] || process.env.OUTPUT
      || `./output/${cliArgs.mode || process.env.MODE || 'recall'}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`,
  LIMIT: Number(cliArgs.limit || process.env.LIMIT || 10),
  // 题目起始偏移（0-indexed）。例如 OFFSET=296 LIMIT=4 会跑第 297~300 题
  OFFSET: Number(cliArgs.offset || process.env.OFFSET || 0),
  CONCURRENCY: Number(cliArgs.concurrency || process.env.CONCURRENCY || 5),
  MODEL: cliArgs.model || process.env.MODEL || 'deepseek-flash',
  // API temperature：默认 0，关闭随机性，保证同 prompt 多次跑输出可复现
  TEMPERATURE: Number(cliArgs.temperature ?? process.env.TEMPERATURE ?? 0),
  ENABLE_THINKING: cliArgs['enable-thinking'] !== undefined ? cliArgs['enable-thinking'] === 'true' : false,
  // 拆分：Recall 和 Reasoning 各自独立控制 thinking
  // 默认 Recall 不需要 thinking（剪切截断任务简单），Reasoning 需要 thinking（跨片段推理）
  ENABLE_THINKING_RECALL: cliArgs['enable-thinking-recall'] !== undefined
    ? cliArgs['enable-thinking-recall'] === 'true'
    : (cliArgs['enable-thinking'] !== undefined ? cliArgs['enable-thinking'] === 'true' : false),
  ENABLE_THINKING_REASONING: cliArgs['enable-thinking-reasoning'] !== undefined
    ? cliArgs['enable-thinking-reasoning'] === 'true'
    : (cliArgs['enable-thinking'] !== undefined ? cliArgs['enable-thinking'] === 'true' : true),
  // 跳过 Reasoning LLM 调用：Recall 选段后直接用选段原文做 predictedAnswer
  // 用于隔离 Recall 单独的有效性（不依赖 Reasoning 的跨片段推理）
  SKIP_REASONING: cliArgs['skip-reasoning'] !== undefined ? cliArgs['skip-reasoning'] === 'true' : false,
  MAX_TOKENS: Number(cliArgs['max-tokens'] || process.env.MAX_TOKENS || 384000),
  QUESTION_ID: cliArgs['question-id'] || process.env.QUESTION_ID || null,
};

// ===== Prompt 模板 =====

// 系统提示词（关于拓扑链的解释）
const TOPOLOGY_SYSTEM_HINT = `注意：你看到的拓扑链不是原文，而是符号化后的序列：
- ⟦N⟧ 代表实体名词
- ⟨1⟩、⟨2⟩ 等代表非实体关系（动词、连接词、修饰语等），仅表示"这里存在某种关系"`;

/**
 * 纯渲染工具：把拓扑链节点渲染为符号化字符串。
 * 兼容两种输入形态：
 * - 1D 完整链（如 baseline/random 模式）
 * - 2D segments（如 recall 模式的截断结果）
 *
 * 按 chunkKey 分行（chunkKey 之间换行），同一 chunk 内按 | 切分片段。
 * 名词渲染为 ⟦N⟧ 符号，占位符渲染为 ⟨N⟩（数字序号）。
 *
 * 注意：这是 render 层纯函数，不感知 recall/reasoning 概念。
 */
function renderChain(chainOrSegments, chunkByKey) {
  const segments = Array.isArray(chainOrSegments[0])
    ? chainOrSegments
    : [chainOrSegments];

  const cellByKey = new Map();      // `${chunkKey}__${segIdx}` -> string[]
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
    // 每个 chunk 行前标 title（如果有）
    const title = chunkByKey?.get(chunkKey)?.title;
    const prefix = title ? `[${title}] ` : '';
    chunkLines.push(prefix + cellSegs.join(' | '));
  }
  return chunkLines.join('\n');
}

/**
 * Recall LLM System 内容：HINT + 符号表 + 拓扑链。
 * 独立构建，不与 Reasoning 共享任何上下文概念。
 * Recall 任务指令已搬到 user 消息（buildRecallUser），并把问题放在最前面。
 */
function buildRecallSystem(question, symbolTable, topologyChain, chunkByKey) {
  const lines = [];
  lines.push(TOPOLOGY_SYSTEM_HINT);
  lines.push('');
  lines.push('符号表：');
  for (const [noun, idx] of symbolTable) {
    lines.push(`⟦${idx}⟧ = ${noun}`);
  }
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

/**
 * Recall LLM Prompt: 从拓扑链中剪切一段截断
 * 本函数仅用于日志合成（保存为单串）。实际 API 调用由 callRecallLLM
 * 直接用 buildRecallSystem / buildRecallUser 双消息发送。
 */
function buildRecallPrompt(question, symbolTable, topologyChain, nonNounPlaceholders, chunkByKey) {
  return buildRecallSystem(question, symbolTable, topologyChain, chunkByKey)
    + '\n\n[user]\n\n'
    + buildRecallUser(question);
}

/**
 * Reasoning LLM Prompt: 多路径推理
 *
 * Prompt 结构：
 * 符号表：
 * ⟦1⟧ = [名词1]
 * ⟦2⟧ = [名词2]
 * ...
 *
 * 拓扑链（符号化表示，占位符 ⟨1⟩、⟨2⟩ 等代表非名词内容，原文不可见）：
 * [拓扑链片段]
 *
 * 问题：
 * [问题]
 *
 * 占位符映射：
 * ⟨A⟩ = [原文]
 * ⟨B⟩ = [原文]
 * ...
 *
 * 要求：
 */
/**
 * Reasoning LLM System 内容：拓扑链 + 符号表 + Reasoning 任务（含占位符映射）。
 * 独立构建，不与 Recall 共享任何上下文概念。
 */
function buildReasoningSystem(question, symbolTable, topologyChainOrSegments, nonNounPlaceholders, chunkByKey) {
  const lines = [];
  lines.push('拓扑链（符号化表示，占位符 ⟨1⟩、⟨2⟩ 等代表非名词内容，原文不可见）：');
  lines.push(renderChain(topologyChainOrSegments, chunkByKey));
  lines.push('');
  lines.push('符号表：');
  for (const [noun, idx] of symbolTable) {
    lines.push(`⟦${idx}⟧ = ${noun}`);
  }
  lines.push('');
  lines.push(buildReasoningTask(nonNounPlaceholders, chunkByKey));
  return lines.join('\n');
}

function buildReasoningUser(question) {
  return `问题：\n${question}`;
}

/**
 * Reasoning LLM Prompt: 多路径推理
 * 本函数仅用于日志合成（保存为单串）。实际 API 调用由 callReasoningLLM
 * 直接用 buildReasoningSystem / buildReasoningUser 双消息发送。
 * 调用方应先用 filterSymbolTableByChain 过滤 symbolTable，确保 system 与 user 用的符号表一致。
 */
function buildReasoningPrompt(question, symbolTable, topologyChainOrSegments, nonNounPlaceholders, chunkByKey) {
  return buildReasoningSystem(question, symbolTable, topologyChainOrSegments, nonNounPlaceholders, chunkByKey)
    + '\n\n[user]\n\n'
    + buildReasoningUser(question);
}

/**
 * Reasoning 任务部分（user role 内容）。
 *
 * truncatedSegmentsOrChain 是"Reasoning LLM 实际拿到的符号化序列"：
 * - recall 模式：2D 数组 truncatedSegments，truncatedSegments[i] 是第 i 个 | 分隔片段
 * - baseline/random 模式：1D 完整链（[truncatedSegmentsOrChain] 视为单个片段）
 *
 * 渲染时按 chunkKey 分行（chunkKey 之间换行），同一 chunk 内按 | 切分片段。
 *
 * @param {Array} truncatedSegmentsOrChain - 2D segments（recall）或 1D 链（baseline/random）
 * @param {Map} nonNounPlaceholders - 占位符映射（已经按 usedRelIds 过滤过）
 * @param {Map} chunkByKey - chunk key -> {text} 映射，用于查占位符原文
 */
function buildReasoningTask(nonNounPlaceholders, chunkByKey) {
  const lines = [];

  // 1. 占位符映射：将 ⟨1⟩、⟨2⟩ 等映射回原文
  lines.push('占位符映射：');
  if (nonNounPlaceholders && nonNounPlaceholders.size > 0) {
    for (const [relId, mapping] of nonNounPlaceholders) {
      const entry = chunkByKey.get(mapping.chunkKey);
      const text = entry ? entry.text.slice(mapping.start, mapping.end) : '';
      lines.push(`${mapping.placeholder} = ${text}`);
    }
  } else {
    lines.push('（无占位符）');
  }

  // 2. 推理要求
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('要求：输出2-4条独立推理路径，每条路径包含多个步骤，每步可引用一个或多个材料⟦N⟧。');
  lines.push('');
  lines.push('格式：');
  lines.push('');
  lines.push('# 路径一：[标题]');
  lines.push('');
  lines.push('步骤1：使用⟦X⟧，提取...');
  lines.push('步骤2：综合⟦Y⟧⟦Z⟧，对比...');
  lines.push('');
  lines.push('结论：[此路径结论]');
  lines.push('');
  lines.push('（继续路径二、三...）');
  lines.push('');
  lines.push('**引用规范**：');
  lines.push('- 单个材料：使用⟦N⟧，提取...，判断...');
  lines.push('- 多个材料：综合⟦N⟧⟦M⟧，对比/交叉验证/综合提取...');
  lines.push('');
  lines.push('**推理策略**：');
  lines.push('- 对比论证：对比不同材料中的矛盾或差异');
  lines.push('- 交叉验证：从多个材料中找到互相支撑的证据');
  lines.push('- 综合支撑：从多处提取一致的特征或模式');

  return lines.join('\n');
}

// ===== 辅助函数 =====

/**
 * 构建名词符号映射（去重）
 */
function buildNounSymbolMap(nouns) {
  const nounSet = new Set();
  const uniqueNouns = [];
  
  for (const noun of nouns) {
    if (!nounSet.has(noun.surface)) {
      nounSet.add(noun.surface);
      uniqueNouns.push(noun);
    }
  }
  
  const symbolMap = new Map();
  uniqueNouns.forEach((noun, idx) => {
    symbolMap.set(noun.surface, idx + 1);
  });
  
  return symbolMap;
}

/**
 * 构建拓扑链
 * @param {Array} nounPositions - 名词位置信息 [{surface, start, end, chunkKey}]
 * @param {Map} symbolMap - 符号映射
 * @param {Map} nonNounPlaceholders - 非名词内容占位符映射（外部传入）
 * @returns {Array} 拓扑链节点
 */
function buildTopologyChain(nounPositions, symbolMap, nonNounPlaceholders, chunkByKey) {
  const nodes = [];
  let relCounter = 0;
  
  // 排序
  const sorted = [...nounPositions].sort((a, b) => {
    if (a.chunkKey !== b.chunkKey) return a.chunkKey.localeCompare(b.chunkKey);
    return a.start - b.start;
  });
  
  // 遍历每个 chunk
  const chunks = {};
  for (const pos of sorted) {
    if (!chunks[pos.chunkKey]) chunks[pos.chunkKey] = [];
    chunks[pos.chunkKey].push(pos);
  }
  
  // 处理每个 chunk
  for (const [chunkKey, positions] of Object.entries(chunks)) {
    positions.sort((a, b) => a.start - b.start);
    
    // 获取 chunk 原文长度
    const chunkEntry = chunkByKey.get(chunkKey);
    const chunkTextLen = chunkEntry ? chunkEntry.text.length : 0;
    
    // 1. 头部非名词内容（chunk 开头 → 第一个名词之前）
    if (positions.length > 0 && positions[0].start > 0) {
      const headId = `rel_${relCounter++}`;
      const headPlaceholder = `⟨${relCounter}⟩`;
      nonNounPlaceholders.set(headId, {
        placeholder: headPlaceholder,
        chunkKey,
        start: 0,
        end: positions[0].start,
      });
      nodes.push({
        type: 'relation',
        relId: headId,
        placeholder: headPlaceholder,
        start: 0,
        end: positions[0].start,
        chunkKey,
        isHead: true,  // 标记为头部
      });
    }
    
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      
      // 添加实体节点
      nodes.push({
        type: 'noun',
        surface: pos.surface,
        symbol: `⟦${symbolMap.get(pos.surface)}⟧`,
        symbolIdx: symbolMap.get(pos.surface),
        start: pos.start,
        end: pos.end,
        chunkKey: pos.chunkKey,
      });
      
      // 如果不是最后一个，添加中间非名词内容占位符
      // 占位符格式：⟨N⟩（数字序号，与名词的 ⟦N⟧ 区分），顺序由 relCounter 决定
      if (i < positions.length - 1) {
        const relId = `rel_${relCounter++}`;
        const placeholder = `⟨${relCounter}⟩`;
        nonNounPlaceholders.set(relId, {
          placeholder,
          chunkKey,
          start: pos.end,
          end: positions[i + 1].start,
        });
        
        nodes.push({
          type: 'relation',
          relId,
          placeholder,
          start: pos.end,
          end: positions[i + 1].start,
          chunkKey,
        });
      }
    }
    
    // 2. 尾部非名词内容（最后一个名词之后 → chunk 结尾）
    if (positions.length > 0 && positions[positions.length - 1].end < chunkTextLen) {
      const tailId = `rel_${relCounter++}`;
      const tailPlaceholder = `⟨${relCounter}⟩`;
      nonNounPlaceholders.set(tailId, {
        placeholder: tailPlaceholder,
        chunkKey,
        start: positions[positions.length - 1].end,
        end: chunkTextLen,
      });
      nodes.push({
        type: 'relation',
        relId: tailId,
        placeholder: tailPlaceholder,
        start: positions[positions.length - 1].end,
        end: chunkTextLen,
        chunkKey,
        isTail: true,  // 标记为尾部
      });
    }
  }
  
  return nodes;
}

/**
 * 解析 Recall LLM 的输出，得到 2D segments（每个 | 分隔的片段是一组节点）。
 *
 * Recall LLM 输出的字面结果直接作为 truncatedSegments：
 * - 逐 segment 解析 ⟦N⟧ 和 ⟨X⟩
 * - 每个符号在完整链里查对应节点
 * - 段内按 (chunkKey, start) 升序排（chunkKey 是阅读序）
 *
 * 返回：
 * - segments: 2D 数组，每元素是一个 segment 的节点数组；null 表示解析失败
 * - usedRelIds: 所有出现过的 ⟨X⟩ 对应的 relId 列表（用于过滤占位符映射）
 * - valid: 解析是否成功（至少解析出一个占位符）
 */
function parseTopologyTruncation(output, topologyChain, nonNounPlaceholders) {
  // 支持多种分隔符：| 、、；；
  const segments = output.split(/[|、、；；]/).map(s => s.trim()).filter(s => s.length > 0);

  if (segments.length === 0) {
    return { segments: null, usedRelIds: [], valid: false };
  }

  // 完整链里的"快查表"
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

  // 逐 segment parse：每个段是一组节点
  const truncatedSegments = [];
  const usedRelIdsSet = new Set();
  const pattern = /⟦(\d+)⟧|⟨([^⟩]+)⟩/g;

  for (const seg of segments) {
    pattern.lastIndex = 0;
    let match;
    const segNodes = [];
    while ((match = pattern.exec(seg)) !== null) {
      if (match[1] !== undefined) {
        // ⟦N⟧
        const symbolIdx = parseInt(match[1], 10);
        const node = nounBySymbolIdx.get(symbolIdx);
        if (node) segNodes.push(node);
      } else if (match[2] !== undefined) {
        // ⟨X⟩
        const relId = placeholderToRelId.get(`⟨${match[2]}⟩`);
        const node = relId ? relationByRelId.get(relId) : null;
        if (node) {
          segNodes.push(node);
          usedRelIdsSet.add(relId);
        }
      }
    }
    // 段内按 (chunkKey, start) 升序（这就是节点在原文中的阅读序）
    segNodes.sort((a, b) => {
      if (a.chunkKey !== b.chunkKey) return a.chunkKey < b.chunkKey ? -1 : 1;
      return a.start - b.start;
    });
    if (segNodes.length > 0) truncatedSegments.push(segNodes);
  }

  const usedRelIds = [...usedRelIdsSet];
  // 有效 = 至少解析出一个占位符（保留原 valid 语义）
  const valid = usedRelIds.length > 0;

  return { segments: truncatedSegments, usedRelIds, valid };
}

/**
 * 按截断链过滤符号表：只保留截断链中出现的 ⟦N⟧ 对应的名词。
 *
 * 兼容两种形态：
 * - 2D 数组（recall 模式：truncatedSegments）
 * - 1D 数组（baseline/random 模式：完整链，所有 ⟦N⟧ 都在 → 过滤后不变）
 *
 * @param {Map} displaySymbolTable - firstOriginal-keyed 符号表（buildQuestionContext 返回）
 * @param {Array} chainOrSegments - 1D 链 或 2D segments
 * @returns {Map} filtered symbolTable（firstOriginal-keyed，只含截断中出现过的 ⟦N⟧）
 */
function filterSymbolTableByChain(displaySymbolTable, chainOrSegments) {
  const allNodes = (chainOrSegments && Array.isArray(chainOrSegments[0]))
    ? chainOrSegments.flat()                  // 2D：recall 模式
    : (chainOrSegments || []);                 // 1D：baseline/random 模式
  const usedSymbolIdxs = new Set();
  for (const node of allNodes) {
    if (node.type === 'noun' && node.symbolIdx !== undefined) {
      usedSymbolIdxs.add(node.symbolIdx);
    }
  }
  const filtered = new Map();
  for (const [noun, idx] of displaySymbolTable) {
    if (usedSymbolIdxs.has(idx)) {
      filtered.set(noun, idx);
    }
  }
  return filtered;
}

/**
 * 构建带关系映射的拓扑链字符串
 * 格式：先列所有链，再统一映射（提高缓存命中率）
 *
 * 示例：
 * 拓扑链1：⟦1⟧⟨1⟩⟦5⟧⟨2⟩⟦12⟧⟦3⟧
 * 拓扑链2：⟦2⟧⟨3⟩⟦7⟧⟨4⟩⟦10⟧⟦5⟧
 * 拓扑链3：⟦3⟧⟨5⟩⟦8⟧⟨6⟩⟦11⟧⟦4⟧
 *
 * 关系映射：
 * ⟨1⟩ = 是红色的
 * ⟨2⟩ = 在树上
 * ⟨3⟩ = 是蓝色的
 * ...
 */
function buildTopologyWithRelations(topologyChains, relationMappings) {
  const lines = [];
  
  // 1. 先列出所有拓扑链
  if (Array.isArray(topologyChains)) {
    topologyChains.forEach((chain, idx) => {
      const parts = [];
      for (const node of chain) {
        if (node.type === 'noun') {
          parts.push(node.symbol);
        } else if (node.type === 'relation') {
          parts.push(node.placeholder);
        }
      }
      lines.push(`拓扑链${idx + 1}：${parts.join('')}`);
    });
  } else {
    // 单个链的兼容处理
    const parts = [];
    for (const node of topologyChains) {
      if (node.type === 'noun') {
        parts.push(node.symbol);
      } else if (node.type === 'relation') {
        parts.push(node.placeholder);
      }
    }
    lines.push(`拓扑链：${parts.join('')}`);
  }
  
  // 2. 空行分隔
  lines.push('');
  
  // 3. 统一关系映射
  lines.push('关系映射：');
  for (const [relId, mapping] of relationMappings) {
    lines.push(`${mapping.placeholder} = [原文]`);
  }
  
  return lines.join('\n');
}

/**
 * 回填拓扑链：按 chunk 聚簇，符号连排后接上整块原文
 * 拓扑链：⟦1⟧⟦2⟧⟦3⟧⟦4⟧
 * 回填后：⟦1⟧⟦2⟧⟦3⟧是红色的在树上⟦4⟧
 *
 * 注意：原文按 chunk 整块追加，所以仅调整符号顺序不会改变最终文本。
 * 这个函数用于 baseline / random 模式。
 */
function buildFilledContext(topologyChain, chunkByKey) {
  const parts = [];

  for (let i = 0; i < topologyChain.length; i++) {
    const node = topologyChain[i];
    const entry = chunkByKey.get(node.chunkKey);
    if (!entry) continue;

    const chunkText = entry.text;

    // 添加符号
    parts.push(node.symbol);

    // 添加符号后面的原文（直到下一个符号或 chunk 边界）
    let nextEnd = null;

    // 找同一 chunk 中的下一个节点
    for (let j = i + 1; j < topologyChain.length; j++) {
      if (topologyChain[j].chunkKey === node.chunkKey) {
        nextEnd = topologyChain[j].end;
        break;
      }
    }

    if (nextEnd !== null && nextEnd > node.end) {
      // 同一 chunk 中有下一个节点，提取之间的文本
      const between = chunkText.slice(node.end, nextEnd);
      parts.push(between);
    } else if (nextEnd === null && node.end < chunkText.length) {
      // 这是 chunk 中最后一个节点，提取到末尾
      const suffix = chunkText.slice(node.end);
      parts.push(suffix);
    }
  }

  return parts.join('');
}

/**
 * 打乱拓扑链顺序（消融实验）
 */
function shuffleTopologyChain(chain) {
  const shuffled = [...chain];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 加载 Docuverse 数据
 */
function loadDocuverse(docuversePath) {
  const data = JSON.parse(fs.readFileSync(docuversePath, 'utf-8'));
  const chunkByKey = new Map();
  
  // 处理扁平格式（每个元素是 chunk）
  if (Array.isArray(data) && data.length > 0 && !data[0].chunks) {
    for (const chunk of data) {
      chunkByKey.set(chunk.chunkKey, {
        text: chunk.text,
        docId: chunk.questionId,
        title: chunk.title,
      });
    }
    return { data, chunkByKey };
  }
  
  // 处理 doc.chunks 格式
  for (const doc of data) {
    for (const chunk of doc.chunks) {
      chunkByKey.set(chunk.chunkKey, {
        text: chunk.text,
        docId: doc.docId,
        chunkIndex: chunk.chunkIndex,
      });
    }
  }
  
  return { data, chunkByKey };
}

/**
 * 评估答案
 */
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

// ===== LLM 调用 =====

async function callRecallLLM(question, symbolTable, topologyChain, nonNounPlaceholders, chunkByKey) {
  // Recall 独立路径：直接调用 buildRecallSystem + buildRecallUser，不与 Reasoning 共享代码
  const systemContent = buildRecallSystem(question, symbolTable, topologyChain, chunkByKey);
  const userContent = buildRecallUser(question);
  const prompt = systemContent + '\n\n[user]\n\n' + userContent;
  const enableThinking = CONFIG.ENABLE_THINKING_RECALL;
  let thisRecallLog = null; // 用于后续统一写入完整日志

  console.log(`[Recall] 发送请求到 LLM (thinking=${enableThinking})...`);

  try {
    const { content: response, usage } = await callDeepSeekAPI([
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent }
    ], CONFIG.MODEL, enableThinking);
    // 解析拓扑链截断（2D segments）
    const { segments: truncatedSegments, usedRelIds, valid } = parseTopologyTruncation(response || '', topologyChain, nonNounPlaceholders);

    if (!valid || !truncatedSegments) {
      console.log('[Recall] 输出无法解析，回退到原始顺序:', (response || '').slice(0, 120));
    }

    // 每题完整日志（不截断）
    const questionId = null; // 暂时用 null，后续在 runAblation 中传入
    // 旧的 append 方式仍然保留，方便汇总查看
    const trace = {
      question,
      enableThinking,
      usage,
      promptLength: prompt.length,
      promptHead: prompt.slice(0, 1200),
      promptTail: prompt.length > 1200 ? prompt.slice(-600) : '',
      rawResponse: (response || '').slice(0, 1000),
      truncatedSegments: truncatedSegments ? truncatedSegments.map(seg => seg.map(n => ({
        type: n.type,
        symbol: n.symbol,
        placeholder: n.placeholder,
        symbolIdx: n.symbolIdx,
      }))) : null,
      usedRelIds,
      valid,
    };
    fs.appendFileSync(path.join(CONFIG.OUTPUT_DIR, 'recall-raw.log'),
      `\n===== ${question} =====\n${JSON.stringify(trace, null, 2)}\n`);
    // 完整 prompt 单独存一份，便于逐字核对
    fs.writeFileSync(path.join(CONFIG.OUTPUT_DIR, `recall-prompt-${question.replace(/[^\w]/g, '_').slice(0, 40)}.txt`), prompt, 'utf-8');

    // 新的完整日志（在 runAblation 中调用）
    // 保存到 thisRecallLog 以便 runAblation 统一写入
    thisRecallLog = {
      prompt,
      rawResponse: response || '',
      parsed: {
        truncatedSegments: truncatedSegments ? truncatedSegments.map(seg => seg.map(n => ({
          type: n.type,
          symbol: n.symbol,
          placeholder: n.placeholder,
          symbolIdx: n.symbolIdx,
        }))) : null,
        usedRelIds,
        valid,
      },
      symbolTable,
      enableThinking,
      usage,
    };

    return {
      segments: truncatedSegments,
      usedRelIds,
      valid,
      recallLog: thisRecallLog,
    };
  } catch (err) {
    console.error('[Recall] API 调用失败:', err.message);
    thisRecallLog = { prompt, rawResponse: 'ERROR: ' + err.message, parsed: null, symbolTable, enableThinking, usage: null };
    return {
      segments: null,
      usedRelIds: [],
      valid: false,
      recallLog: thisRecallLog,
    };
  }
}


/**
 * 调用 DeepSeek 官方 API
 * @param {Array} messages - 消息列表
 * @param {string} model - 模型名
 * @param {boolean} enableThinking - 是否启用 thinking（由调用方决定，Recall 默认 false，Reasoning 默认 true）
 * @returns {{content: string, usage: object|null}} content 为 LLM 输出文本，usage 为 token 用量统计
 */
async function callDeepSeekAPI(messages, model = CONFIG.MODEL, enableThinking = false) {
  const requestBody = {
    model,
    messages,
    max_tokens: CONFIG.MAX_TOKENS,
    temperature: CONFIG.TEMPERATURE,
    // DeepSeek 官方：思维链默认开启，用 thinking.type=disabled 关闭
    thinking: { type: enableThinking ? 'enabled' : 'disabled' },
  };

  if (enableThinking) {
    requestBody.reasoning_effort = 'high';
  }

  const response = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} ${response.statusText} - ${text}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || '';
  if (!content) {
    throw new Error('API 返回空 content: ' + JSON.stringify(data).slice(0, 300));
  }

  // 兜底：若仍返回思维链标签，剔除
  if (content.includes('<thinking>')) {
    content = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
  }

  // 提取 token 用量（DeepSeek 返回的字段：prompt_tokens / completion_tokens / total_tokens / prompt_cache_hit_tokens / prompt_cache_miss_tokens）
  const usage = data.usage || null;

  return { content, usage };
}

// ===== 每题完整日志系统 =====
// 每个问题一个目录，存储完整的输入输出，不截断任何内容
function getQuestionDir(questionId, mode) {
  const baseDir = path.join(CONFIG.OUTPUT_DIR, `${mode}-${questionId}`);
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
}

function saveRecallLog(questionId, mode, metadata) {
  const dir = getQuestionDir(questionId, mode);
  // 完整 recall 输入（prompt）
  fs.writeFileSync(path.join(dir, 'recall-input.txt'), metadata.prompt, 'utf-8');
  // 完整 recall 输出（原始响应）
  fs.writeFileSync(path.join(dir, 'recall-output.txt'), metadata.rawResponse || '', 'utf-8');
  // 解析后的截断节点（完整）
  fs.writeFileSync(path.join(dir, 'recall-parsed.json'), JSON.stringify(metadata.parsed, null, 2), 'utf-8');
  // 符号表
  fs.writeFileSync(path.join(dir, 'symbol-table.json'), JSON.stringify(metadata.symbolTable, null, 2), 'utf-8');
}

function saveReasoningLog(questionId, mode, metadata) {
  const dir = getQuestionDir(questionId, mode);
  // 完整 reasoning 输入（prompt）
  fs.writeFileSync(path.join(dir, 'reasoning-input.txt'), metadata.prompt, 'utf-8');
  // 完整 reasoning 输出（答案）
  fs.writeFileSync(path.join(dir, 'reasoning-output.txt'), metadata.answer || '', 'utf-8');
}

function saveQuestionSummary(questionId, mode, summaryData) {
  const dir = getQuestionDir(questionId, mode);
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summaryData, null, 2), 'utf-8');
}

/**
 * 全量中间状态追踪：把每一步的输入/产物落盘，便于审查数据流。
 *  - step1: buildQuestionContext 产出的 symbolTable / auditSymbolTable / baseTopologyChain / nonNounPlaceholders
 *  - step2: Recall LLM 的 prompt / rawResponse / 解析后的 2D segments / usedRelIds
 *  - step3: Recall→Reasoning handoff：过滤后的 truncatedSegmentsOrChain / reasoningNonNounPlaceholders / usedRelIds
 *  - step4: Reasoning LLM 实际拿到的 filteredSymbolTable / answer / usage
 */
function savePipelineTrace(questionId, mode, trace) {
  const dir = getQuestionDir(questionId, mode);
  fs.writeFileSync(path.join(dir, 'pipeline-trace.json'), JSON.stringify(trace, null, 2), 'utf-8');
}

async function callReasoningLLM(question, symbolTable, truncatedSegmentsOrChain, nonNounPlaceholders, chunkByKey, mode = 'unknown') {
  // 1. 过滤符号表：只保留 truncatedSegmentsOrChain 中出现的 ⟦N⟧ 对应的名词。
  // baseline/random 模式下 truncatedSegmentsOrChain 是 1D 完整链 → 过滤后不变（所有 ⟦N⟧ 都保留）。
  const filteredSymbolTable = filterSymbolTableByChain(symbolTable, truncatedSegmentsOrChain);

  // 2. Reasoning 独立路径：直接调用 buildReasoningSystem + buildReasoningUser，不与 Recall 共享代码
  const systemContent = buildReasoningSystem(question, filteredSymbolTable, truncatedSegmentsOrChain, nonNounPlaceholders, chunkByKey);
  const userContent = buildReasoningUser(question);
  const prompt = systemContent + '\n\n[user]\n\n' + userContent;
  const enableThinking = CONFIG.ENABLE_THINKING_REASONING;
  let thisReasoningLog = null;

  console.log(`[Reasoning] 发送请求到 LLM (thinking=${enableThinking})...`);

  // 3. 单轮 [system, user]
  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];

  try {
    const { content: answer, usage } = await callDeepSeekAPI(messages, CONFIG.MODEL, enableThinking);
    console.log('[Reasoning] 收到回答，长度:', answer?.length || 0);

    // 记录 prompt 和回答，便于核对送进推理 LLM 的到底是什么
    const trace = {
      question,
      mode,
      enableThinking,
      usage,
      promptLength: prompt.length,
      promptHead: prompt.slice(0, 1500),
      promptTail: prompt.length > 1500 ? prompt.slice(-800) : '',
      answer: (answer || '').slice(0, 1500),
    };
    fs.appendFileSync(path.join(CONFIG.OUTPUT_DIR, 'reasoning-raw.log'),
      `\n===== [${mode}] ${question} =====\n${JSON.stringify(trace, null, 2)}\n`);
    // 完整 prompt 单独存一份，便于逐字核对
    const safeQ = question.replace(/[^\w]/g, '_').slice(0, 40);
    fs.writeFileSync(path.join(CONFIG.OUTPUT_DIR, `reasoning-prompt-${mode}-${safeQ}.txt`), prompt, 'utf-8');

    // 保存到 thisReasoningLog 以便 runAblation 统一写入
    thisReasoningLog = { prompt, answer: answer || 'NO_RESPONSE', enableThinking, usage, filteredSymbolTable };

    return { answer: answer || 'NO_RESPONSE', reasoningLog: thisReasoningLog };
  } catch (err) {
    console.error('[Reasoning] API 调用失败:', err.message);
    thisReasoningLog = { prompt, answer: 'ERROR: ' + err.message, enableThinking, usage: null };
    return { answer: 'ERROR: ' + err.message, reasoningLog: thisReasoningLog };
  }
}

// ===== 实验模式 =====

/**
 * 消融实验：对比不同召回模式
 * - baseline: 原始拓扑链
 * - recall: LLM 预测拓扑排序
 * - random: 随机打乱拓扑链
 */
/**
 * 为单个问题构建符号表与基础拓扑链（每题用自己的名词索引）
 * @param {Map} chunkByKey - chunk key -> {text} 映射，用于从原文反查名词位置
 */
function buildQuestionContext(q, nounIndexRaw, chunkByKey) {
  const byQuestion = nounIndexRaw.question_indexes;
  const entry = byQuestion ? byQuestion[q.id] : null;

  let nounIndex;
  if (entry) {
    // 使用预处理保存的精确位置，不再重新正则匹配
    nounIndex = entry.nouns
      .filter(n => n.surface && Array.isArray(n.positions) && n.positions.length > 0)
      .flatMap(n => {
        // 同一个名词可能在多个位置出现，每个位置都作为一个独立条目
        return n.positions.map(pos => ({
          surface: n.surface,
          start: pos.start,
          end: pos.end,
          chunkKey: pos.chunkKey,
          page: pos.page || 0,
        }));
      });
  } else {
    nounIndex = [];
  }

  // 名词标准化：用于符号表去重
  const normalizeNoun = (s) => s ? s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : s;

  // 构建符号表（使用标准化名词去重）
  // 标准化后相同的名词被视为同一实体，只分配一个符号
  const symbolTable = new Map();
  const normalizedToAllOriginals = new Map();  // 标准化名 -> 所有原始 surface 变体
  const normalizedToFirstOriginal = new Map(); // 标准化名 -> 第一个原始 surface（用于展示）
  let idx = 1;
  for (const noun of nounIndex) {
    const normalized = normalizeNoun(noun.surface);
    if (!symbolTable.has(normalized)) {
      symbolTable.set(normalized, idx++);
      normalizedToFirstOriginal.set(normalized, noun.surface);
      normalizedToAllOriginals.set(normalized, [noun.surface]);
    } else {
      // 收集所有变体，方便用户审查
      const variants = normalizedToAllOriginals.get(normalized);
      if (!variants.includes(noun.surface)) {
        variants.push(noun.surface);
      }
    }
  }

  // 构建基础拓扑链（使用标准化名词）
  const nounPositions = nounIndex.map(n => ({
    surface: normalizeNoun(n.surface),
    start: n.start,
    end: n.end,
    chunkKey: n.chunkKey,
    originalSurface: n.surface,  // 保留原始 surface 用于精确定位
  }));

  const nonNounPlaceholders = new Map();
  const baseTopologyChain = buildTopologyChain(nounPositions, symbolTable, nonNounPlaceholders, chunkByKey);

  // 构建展示用的符号表（用原始名词展示给 LLM）
  const displaySymbolTable = new Map();
  for (const [normalized, idx] of symbolTable) {
    displaySymbolTable.set(normalizedToFirstOriginal.get(normalized), idx);
  }

  // 构建审查用的符号表（包含所有原始变体）
  const auditSymbolTable = new Map();
  for (const [normalized, idx] of symbolTable) {
    auditSymbolTable.set(idx, {
      normalized,
      firstOriginal: normalizedToFirstOriginal.get(normalized),
      allVariants: normalizedToAllOriginals.get(normalized),
    });
  }

  return { 
    symbolTable: displaySymbolTable, 
    auditSymbolTable,  // 供审查用，包含所有变体
    baseTopologyChain, 
    nonNounPlaceholders, 
    nounCount: nounIndex.length 
  };
}

/**
 * 带并发限制的 map
 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

/**
 * 消融实验：对比不同召回模式
 * - baseline: 原始拓扑链
 * - recall: LLM 预测拓扑排序
 * - random: 随机打乱拓扑链
 */
async function runAblation(mode, questions, nounIndexRaw, chunkByKey) {
  // 确保输出目录存在（API 调用过程中也需要写日志）
  fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });

  console.log(`\n========== ${mode.toUpperCase()} 模式 (${questions.length} 题) ==========`);

  let done = 0;
  const results = await mapWithConcurrency(questions, CONFIG.CONCURRENCY, async (q) => {
    try {
      return await processQuestion(q, mode, nounIndexRaw, chunkByKey);
    } catch (err) {
      console.error(`[${mode}] ${q.id} 失败:`, err.message);
      return { qid: q.id, question: q.question.slice(0, 100), expectedAnswer: q.answer,
               predictedAnswer: 'ERROR: ' + err.message, recallMode: mode, intervalsCount: 0, score: 0 };
    } finally {
      done++;
      console.log(`[${mode}] 进度 ${done}/${questions.length}`);
    }
  });

  const total = results.length;
  const exactMatches = results.filter(r => r.score === 1).length;
  const scoreSum = results.reduce((s, r) => s + r.score, 0);
  const avgScore = scoreSum / total;

  // 聚合 Recall / Reasoning 的 token 与缓存命中
  const aggregateUsage = (key) => {
    let promptTokens = 0, completionTokens = 0, totalTokens = 0;
    let cacheHitTokens = 0, cacheMissTokens = 0;
    let callsWithUsage = 0;
    for (const r of results) {
      const u = r[key];
      if (u) {
        callsWithUsage++;
        promptTokens += u.prompt_tokens || 0;
        completionTokens += u.completion_tokens || 0;
        totalTokens += u.total_tokens || 0;
        cacheHitTokens += u.prompt_cache_hit_tokens || 0;
        cacheMissTokens += u.prompt_cache_miss_tokens || 0;
      }
    }
    return {
      callsWithUsage,
      promptTokens,
      completionTokens,
      totalTokens,
      cacheHitTokens,
      cacheMissTokens,
      cacheHitRate: promptTokens > 0 ? +(cacheHitTokens / promptTokens).toFixed(4) : 0,
    };
  };

  const summary = {
    mode,
    total,
    exactMatches,
    averageScore: avgScore,
    recallUsage: aggregateUsage('recallUsage'),
    reasoningUsage: aggregateUsage('reasoningUsage'),
    config: {
      MODEL: CONFIG.MODEL,
      recallThinking: CONFIG.ENABLE_THINKING_RECALL,
      reasoningThinking: CONFIG.ENABLE_THINKING_REASONING,
    },
  };

  fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(CONFIG.OUTPUT_DIR, `${mode}-summary.json`), JSON.stringify(summary, null, 2), 'utf-8');
  fs.writeFileSync(path.join(CONFIG.OUTPUT_DIR, `${mode}-details.json`), JSON.stringify(results, null, 2), 'utf-8');

  console.log(`\n结果: EM=${(avgScore*100).toFixed(1)}% (${exactMatches}/${total})`);
  console.log(`Recall tokens: total=${summary.recallUsage.totalTokens}, cache_hit=${summary.recallUsage.cacheHitTokens} (${(summary.recallUsage.cacheHitRate*100).toFixed(1)}%)`);
  console.log(`Reasoning tokens: total=${summary.reasoningUsage.totalTokens}, cache_hit=${summary.reasoningUsage.cacheHitTokens} (${(summary.reasoningUsage.cacheHitRate*100).toFixed(1)}%)`);

  return summary;
}

async function processQuestion(q, mode, nounIndexRaw, chunkByKey) {
  const { symbolTable, auditSymbolTable, baseTopologyChain, nonNounPlaceholders, nounCount } = buildQuestionContext(q, nounIndexRaw, chunkByKey);

  // 用本函数的局部变量持有每题的 recall / reasoning 日志。
  // 不要使用模块级变量——并发跑多题时，模块级变量会被其他题覆盖，导致 trace 串题。
  let currentRecallLog = null;
  let currentReasoningLog = null;

  // ===== Step 1: 题目上下文（符号表 / 基础拓扑链 / 占位符映射）落盘 =====
  // 把 Map 转成 plain object，方便 JSON 序列化
  const step1 = {
    nounCount,
    displaySymbolTable: Object.fromEntries(symbolTable),
    auditSymbolTable: Object.fromEntries(auditSymbolTable),  // 含所有 normalized 变体
    baseTopologyChain: baseTopologyChain.map(n => ({
      type: n.type,
      symbol: n.symbol,
      placeholder: n.placeholder,
      symbolIdx: n.symbolIdx,
      relId: n.relId,
      chunkKey: n.chunkKey,
      start: n.start,
      end: n.end,
      isHead: !!n.isHead,
      isTail: !!n.isTail,
    })),
    nonNounPlaceholders: Object.fromEntries(
      [...nonNounPlaceholders].map(([relId, m]) => [relId, {
        placeholder: m.placeholder,
        chunkKey: m.chunkKey,
        start: m.start,
        end: m.end,
      }])
    ),
  };

  // truncatedSegmentsOrChain: Reasoning LLM 实际拿到的"符号化序列"。
  // - recall 模式：2D segments（来自 parseTopologyTruncation，多片段）
  // - baseline/random 模式：1D 完整链（所有 ⟦N⟧ 都存在）
  let truncatedSegmentsOrChain = baseTopologyChain;
  let usedRelIds = [];
  let recallMode = false;
  let recallValid = false;

  if (mode === 'random') {
    // random 模式下拓扑链保持原始顺序，但占位符顺序打乱
    const allRelIds = baseTopologyChain
      .filter(n => n.type === 'relation')
      .map(n => n.relId);
    // Fisher-Yates 打乱
    for (let i = allRelIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allRelIds[i], allRelIds[j]] = [allRelIds[j], allRelIds[i]];
    }
    usedRelIds = allRelIds;
  } else if (mode === 'recall' && symbolTable.size > 0) {
    // 让 LLM 从拓扑链中剪切一段截断
    recallMode = true;
    const recall = await callRecallLLM(q.question, symbolTable, baseTopologyChain, nonNounPlaceholders, chunkByKey);
    recallValid = recall.valid;
    currentRecallLog = recall.recallLog; // 捕获完整日志（局部变量，并发安全）
    // Recall LLM 必须产出至少一个可解析的占位符；否则直接整题失败，跳过 Reasoning
    if (!recall.valid) {
      throw new Error('Recall LLM 未能产出可解析的占位符');
    }
    truncatedSegmentsOrChain = recall.segments;
    usedRelIds = recall.usedRelIds || [];
  }

  // 构建占位符映射：只包含拓扑链中使用的占位符。
  // 若 usedRelIds 为空（即 Recall LLM 输出未命中任何占位符），则 reasoningNonNounPlaceholders
  // 保持空 Map —— Reasoning LLM 会看到原样 ⟨X⟩ 符号加一行 "（无占位符）"。
  const reasoningNonNounPlaceholders = new Map();
  for (const [relId, mapping] of nonNounPlaceholders) {
    if (usedRelIds.includes(relId)) {
      reasoningNonNounPlaceholders.set(relId, mapping);
    }
  }

  // Reasoning: 生成答案
  // SKIP_REASONING 模式下跳过 Reasoning LLM：直接用 Recall 选段的原始名词拼成 predictedAnswer
  // 用来测试"纯 Recall 单独能召回到什么"——如果选段含答案名词，score 应当 ≥ 0.5（hotpotQA 子串匹配）
  let predictedAnswer, reasoningLog;
  if (CONFIG.SKIP_REASONING) {
    // 直接抽取选段中所有名词的原文（按 chunk + segment 出现顺序）
    const seen = new Set();
    const parts = [];
    for (const seg of truncatedSegmentsOrChain) {
      for (const node of seg) {
        if (node.type !== 'noun') continue;
        if (seen.has(node.symbolIdx)) continue;
        seen.add(node.symbolIdx);
        const word = symbolTable.getNounByIndex?.(node.symbolIdx)
          || symbolTable.get?.(node.symbolIdx)
          || (() => {
              // symbolTable 是 Map<word, idx>，反向查
              for (const [w, i] of symbolTable) if (i === node.symbolIdx) return w;
              return null;
            })();
        if (word) parts.push(word);
      }
    }
    predictedAnswer = parts.join(', ');
    reasoningLog = { skipped: true, predictedAnswer, source: 'recall-only' };
  } else {
    // Reasoning: 生成答案（单轮 [system, user]，符号表在 callReasoningLLM 内部按 truncatedSegmentsOrChain 过滤）
    const r = await callReasoningLLM(
      q.question, symbolTable, truncatedSegmentsOrChain, reasoningNonNounPlaceholders, chunkByKey, mode
    );
    predictedAnswer = r.answer;
    reasoningLog = r.reasoningLog;
  }
  currentReasoningLog = reasoningLog;

  // ===== 保存每题完整日志 =====
  // 用 callReasoningLLM 内部已构建的 prompt（用了 filteredSymbolTable），与实际送给 LLM 的完全一致
  const reasoningPrompt = currentReasoningLog?.prompt
    || buildReasoningPrompt(q.question, symbolTable, truncatedSegmentsOrChain, reasoningNonNounPlaceholders, chunkByKey);

  // 保存 recall 日志（如果存在）
  if (currentRecallLog) {
    saveRecallLog(q.id, mode, {
      ...currentRecallLog,
      question: q.question,
    });
  } else {
    // baseline/random 模式：保存完整的符号表和基础拓扑链
    saveRecallLog(q.id, mode, {
      prompt: buildRecallPrompt(q.question, symbolTable, baseTopologyChain, nonNounPlaceholders, chunkByKey),
      rawResponse: '[no-recall-mode]',
      parsed: {
        truncatedSegments: [baseTopologyChain.map(n => ({
          type: n.type,
          symbol: n.symbol,
          placeholder: n.placeholder,
          symbolIdx: n.symbolIdx,
        }))],
        usedRelIds: [],
        valid: true,
      },
      symbolTable,
      question: q.question,
      enableThinking: CONFIG.ENABLE_THINKING_RECALL,
      usage: null,
    });
  }

  // 保存 reasoning 完整日志
  saveReasoningLog(q.id, mode, {
    prompt: reasoningPrompt,
    answer: predictedAnswer,
  });

  // 评估
  const score = evaluateAnswer(predictedAnswer, q.answer);

  // 汇总本次调用的 token 用量
  const recallUsage = currentRecallLog?.usage || null;
  const reasoningUsage = currentReasoningLog?.usage || null;

  // ===== 保存全量中间状态（pipeline trace）=====
  // Step 2: Recall 阶段产物（Recall LLM 的 prompt / 响应 / 解析）
  const step2 = currentRecallLog ? {
    promptLength: currentRecallLog.prompt?.length || 0,
    rawResponse: currentRecallLog.rawResponse,
    parsed: currentRecallLog.parsed,
    enableThinking: currentRecallLog.enableThinking,
    usage: currentRecallLog.usage,
    recallValid,
    usedRelIds,
    segmentsCount: Array.isArray(currentRecallLog.parsed?.truncatedSegments)
      ? currentRecallLog.parsed.truncatedSegments.length
      : 0,
  } : { skipped: true, reason: `mode=${mode}（baseline/random 无 Recall LLM 调用）` };

  // Step 3: Recall→Reasoning handoff（送进 Reasoning 的真实数据）
  // truncatedSegmentsOrChain 在 recall 模式下是 2D segments，其他模式是 1D 链
  // 统一序列化成 2D 形式（recall）或 [[1D]]（其他）便于阅读
  const normalizedChain = (Array.isArray(truncatedSegmentsOrChain[0])
    ? truncatedSegmentsOrChain
    : [truncatedSegmentsOrChain]
  ).map(seg => seg.map(n => ({
    type: n.type,
    symbol: n.symbol,
    placeholder: n.placeholder,
    symbolIdx: n.symbolIdx,
    relId: n.relId,
    chunkKey: n.chunkKey,
    start: n.start,
    end: n.end,
  })));
  const step3 = {
    segmentsCount: normalizedChain.length,
    nodeCount: normalizedChain.reduce((s, seg) => s + seg.length, 0),
    truncatedSegmentsOrChain: normalizedChain,
    usedRelIds,
    reasoningNonNounPlaceholders: Object.fromEntries(
      [...reasoningNonNounPlaceholders].map(([relId, m]) => [relId, {
        placeholder: m.placeholder,
        chunkKey: m.chunkKey,
        start: m.start,
        end: m.end,
      }])
    ),
  };

  // Step 4: Reasoning 阶段产物（实际送进 Reasoning LLM 的符号表 + 答案 + usage）
  const step4 = currentReasoningLog ? {
    promptLength: currentReasoningLog.prompt?.length || 0,
    filteredSymbolTable: currentReasoningLog.filteredSymbolTable
      ? Object.fromEntries(currentReasoningLog.filteredSymbolTable)
      : null,
    filteredSymbolCount: currentReasoningLog.filteredSymbolTable?.size || 0,
    answer: currentReasoningLog.answer,
    enableThinking: currentReasoningLog.enableThinking,
    usage: currentReasoningLog.usage,
  } : null;

  const pipelineTrace = {
    question: { id: q.id, text: q.question, expectedAnswer: q.answer },
    mode,
    config: {
      MODEL: CONFIG.MODEL,
      recallThinking: CONFIG.ENABLE_THINKING_RECALL,
      reasoningThinking: CONFIG.ENABLE_THINKING_REASONING,
      CACHE_WAIT_MS: process.env.CACHE_WAIT_MS || null,
    },
    step1_buildContext: step1,
    step2_recall: step2,
    step3_handoff: step3,
    step4_reasoning: step4,
    finalScore: score,
  };
  savePipelineTrace(q.id, mode, pipelineTrace);

  // 保存问题摘要
  saveQuestionSummary(q.id, mode, {
    qid: q.id,
    question: q.question,
    expectedAnswer: q.answer,
    predictedAnswer,
    recallMode: mode,
    recallValid,
    recallTruncation: (Array.isArray(truncatedSegmentsOrChain[0])
      ? truncatedSegmentsOrChain.flat()
      : truncatedSegmentsOrChain).slice(0, 12).map(n => n.symbol || n.placeholder).join(''),
    nounCount,
    score,
    config: {
      MODEL: CONFIG.MODEL,
      recallThinking: CONFIG.ENABLE_THINKING_RECALL,
      reasoningThinking: CONFIG.ENABLE_THINKING_REASONING,
    },
    // ===== Token / 缓存命中统计 =====
    recallUsage,
    reasoningUsage,
  });

  return {
    qid: q.id,
    question: q.question.slice(0, 100),
    expectedAnswer: q.answer,
    predictedAnswer,
    recallMode: mode,
    recallValid,
    recallTruncation: (Array.isArray(truncatedSegmentsOrChain[0])
      ? truncatedSegmentsOrChain.flat()
      : (truncatedSegmentsOrChain || [])
    ).slice(0, 12).map(n => n.symbol || n.placeholder).join(''),
    nounCount,
    score,
    recallUsage,
    reasoningUsage,
  };
}

// ===== 主入口 =====

async function main() {
  console.log('开始消融实验...');
  console.log('配置:', JSON.stringify(CONFIG, null, 2));
  
  // 加载数据
  const DOCUVERSE_PATH = process.env.DOCUVERSE_PATH;
  const NOUN_INDEX_PATH = process.env.NOUN_INDEX_PATH || 'final-noun-index.json';
  const QUESTIONS_PATH = process.env.QUESTIONS_PATH || 'data/hotpotqa/questions.json';
  
  if (!DOCUVERSE_PATH) {
    console.error('请设置 DOCUVERSE_PATH 环境变量');
    process.exit(1);
  }
  
  // 加载名词索引
  const nounIndexRaw = JSON.parse(fs.readFileSync(NOUN_INDEX_PATH, 'utf-8'));

  // 加载问题
  const allQuestions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));

  // 只保留有名词索引的问题
  const available = nounIndexRaw.question_indexes
    ? new Set(Object.keys(nounIndexRaw.question_indexes))
    : null;

  const questions = (available
    ? allQuestions.filter(q => available.has(q.id))
    : allQuestions
  ).filter(q => CONFIG.QUESTION_ID ? q.id === CONFIG.QUESTION_ID : true)
   .slice(CONFIG.OFFSET, CONFIG.OFFSET + CONFIG.LIMIT);

  console.log(`[DEBUG] available.size=${available ? available.size : 'N/A'}, afterFilter=${(available ? allQuestions.filter(q => available.has(q.id)) : allQuestions).length}, OFFSET=${CONFIG.OFFSET}, LIMIT=${CONFIG.LIMIT}, sliceLen=${(available ? allQuestions.filter(q => available.has(q.id)) : allQuestions).slice(CONFIG.OFFSET, CONFIG.OFFSET + CONFIG.LIMIT).length}`);

  console.log(`共 ${allQuestions.length} 题，可用 ${available ? available.size : allQuestions.length} 题，本次跑 ${questions.length} 题 (offset=${CONFIG.OFFSET}, limit=${CONFIG.LIMIT})`);
  console.log(`题目: ${questions.map(q => q.id).join(', ')}`);

  // 构建 chunk 映射
  const { chunkByKey } = loadDocuverse(DOCUVERSE_PATH);

  // 打印本次运行配置
  console.log('\n========== 运行配置 ==========');
  console.log(`Mode: ${CONFIG.MODE}`);
  console.log(`API: ${CONFIG.API_URL}`);
  console.log(`Model: ${CONFIG.MODEL}`);
  console.log(`API_KEY: ${CONFIG.API_KEY.slice(0, 8)}...`);
  console.log(`Output: ${CONFIG.OUTPUT_DIR}`);
  console.log(`Run Timestamp: ${CONFIG._runTimestamp}`);
  console.log(`Limit: ${CONFIG.LIMIT}`);
  console.log(`Offset: ${CONFIG.OFFSET}`);
  console.log(`Concurrency: ${CONFIG.CONCURRENCY}`);
  console.log(`Thinking (Recall): ${CONFIG.ENABLE_THINKING_RECALL}`);
  console.log(`Thinking (Reasoning): ${CONFIG.ENABLE_THINKING_REASONING}`);
  console.log(`Skip Reasoning: ${CONFIG.SKIP_REASONING}`);
  console.log(`Question ID: ${CONFIG.QUESTION_ID || 'all'}`);
  console.log('==============================\n');

  // 运行实验
  const summaries = {};
  summaries[CONFIG.MODE] = await runAblation(CONFIG.MODE, questions, nounIndexRaw, chunkByKey);

  // 对比结果
  console.log('\n========== 实验对比 ==========');
  for (const [mode, summary] of Object.entries(summaries)) {
    console.log(`${mode}: EM=${(summary.averageScore*100).toFixed(1)}% (${summary.exactMatches}/${summary.total})`);
  }
}

// 运行
main().catch(console.error);
