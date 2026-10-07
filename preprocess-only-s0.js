/**
 * 预处理脚本 - 仅 spaCy 抽取（跳过 s1）
 * 
 * 流程：
 *   1. 读取 docuverse.json 和 questions.json
 *   2. spaCy 并发抽取名词
 *   3. 生成 final-noun-index.json（适配 ablation.js，保留精确位置）
 * 
 * 用法：
 *   node preprocess-only-s0.js <docuverse.json路径> [questions.json路径]
 */

import fs from 'fs';
import path from 'path';

const SPACY_URL = 'http://localhost:5001/extract_nouns';

// ============ 纯文表构建 ============
function buildPureTextTable(bookIndex) {
  const entries = [];
  for (const book of bookIndex.books || []) {
    for (const chunk of book.chunks || []) {
      entries.push({
        chunkKey: chunk.key,
        page: chunk.page || 0,
        text: chunk.text,
        questionId: book.questionId || book.id || null,
      });
    }
  }
  return { entries };
}

// ============ 法语虚词过滤 ============
const FRENCH_FUNCTION_WORDS = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'au', 'aux',
  'de', 'à', 'a', 'en', 'sur', 'sous', 'dans', 'par', 'pour', 'avec', 'sans',
  'et', 'ou', 'ni', 'mais', 'donc', 'car', 'que', 'qu', 'si', 's',
  'qui', 'quoi', 'dont', 'où', 'ce', 'cet', 'cette', 'ces', 'celui', 'celle',
  'il', 'elle', 'ils', 'elles', 'on', 'nous', 'vous', 'je', 'tu', 'te', 't', 'me', 'm',
  'lui', 'leur', 'leurs', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos',
  'y', 'en', 'se', 'soi', 'd', 'n', 'j', 'c',
  'est', 'sont', 'être', 'a', 'ont', 'avoir', 'fut', 'était', 'étaient',
  'ne', 'pas', 'plus', 'moins', 'très', 'bien', 'aussi', 'ainsi', 'alors',
  'là', 'ici', 'déjà', 'encore', 'toujours', 'jamais', 'peu', 'trop',
]);

function tokenize(text) {
  return text.toLowerCase().split(/[^a-zàâäéèêëïîôöùûüçœæ]+/i).filter(t => t.length > 0);
}

function isAllFunctionWords(text) {
  const tokens = tokenize(text);
  return tokens.length === 0 || tokens.every(t => FRENCH_FUNCTION_WORDS.has(t));
}

// ============ 核心处理 ============
async function main() {
  const filePath = process.argv[2];
  const questionsPath = process.argv[3] || 'data/hotpotqa/questions.json';

  if (!filePath) {
    console.error('用法: node preprocess-only-s0.js <docuverse.json路径> [questions.json路径]');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('预处理 - 仅 spaCy 抽取（跳过 s1）');
  console.log('='.repeat(60));
  console.log(`源文件: ${filePath}`);
  console.log(`问题文件: ${questionsPath}\n`);

  // 1. 读取数据
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  if (data.kind !== 'docuverse-corpus' || !data.bookIndex?.chunks) {
    console.error('不是有效的 docuverse-corpus 文件');
    process.exit(1);
  }

  // 加载问题
  let questions = [];
  if (fs.existsSync(questionsPath)) {
    const qRaw = fs.readFileSync(questionsPath, 'utf-8');
    questions = JSON.parse(qRaw);
    console.log(`[1/4] 读取问题: ${questions.length} 题`);
  } else {
    console.log('[1/4] 跳过问题加载（文件不存在）');
  }

  const pureTextTable = buildPureTextTable(data.bookIndex);
  const entries = pureTextTable.entries;
  console.log(`[2/4] 读取完成: ${entries.length} 个 chunks`);

  // 建立 chunkKey -> questionId 的映射
  const chunkToQuestion = new Map();
  for (const entry of entries) {
    chunkToQuestion.set(entry.chunkKey, entry.questionId);
  }

  // 2. spaCy 并发抽取
  console.log(`[3/4] spaCy 抽取名词...`);
  
  const allNouns = [];
  const CONCURRENCY = 10;
  let processed = 0;

  const processChunk = async (entry) => {
    try {
      const res = await fetch(SPACY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: entry.text,
          include_proper_nouns: true,
          include_nouns: true,
          min_length: 2,
        }),
      });
      const result = await res.json();
      
      const chunkNouns = [
        ...result.nouns.map(n => ({
          surface: n.surface,
          chunkKey: entry.chunkKey,
          questionId: entry.questionId,
          start: n.start,
          end: n.end,
          page: entry.page,
        })),
        ...result.noun_phrases.map(p => ({
          surface: p.surface,
          chunkKey: entry.chunkKey,
          questionId: entry.questionId,
          start: p.start,
          end: p.end,
          page: entry.page,
        })),
      ];
      
      processed++;
      if (processed % 100 === 0) process.stdout.write(`\r   进度: ${processed}/${entries.length}`);
      return chunkNouns;
    } catch (err) {
      processed++;
      return [];
    }
  };

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(processChunk));
    allNouns.push(...results.flat());
  }
  console.log(`\n   抽取完成: ${allNouns.length} 个名词/短语`);

  // 3. 按问题分组构建 question_indexes（保留精确位置）
  console.log(`[4/4] 生成 final-noun-index.json...`);

  // 按 questionId 分组，保存完整位置信息
  const byQuestion = new Map();
  for (const n of allNouns) {
    if (!n.questionId) continue;
    if (!byQuestion.has(n.questionId)) {
      byQuestion.set(n.questionId, new Map()); // surface -> {surface, positions[]}
    }
    const nounMap = byQuestion.get(n.questionId);
    const id = n.surface.toLowerCase().trim();
    if (!nounMap.has(id)) {
      nounMap.set(id, { surface: n.surface, positions: [] });
    }
    // 保存精确位置
    nounMap.get(id).positions.push({
      chunkKey: n.chunkKey,
      start: n.start,
      end: n.end,
      page: n.page || 0,
    });
  }

  // 转换为最终格式
  const question_indexes = {};
  let totalNouns = 0;
  let totalPositions = 0;
  for (const [qid, nounMap] of byQuestion.entries()) {
    const nouns = [...nounMap.values()].map(n => ({
      surface: n.surface,
      positions: n.positions.sort((a, b) => a.chunkKey.localeCompare(b.chunkKey) || a.start - b.start),
    }));
    nouns.sort((a, b) => a.surface.localeCompare(b.surface));
    question_indexes[qid] = { nouns };
    totalNouns += nouns.length;
    totalPositions += nouns.reduce((sum, n) => sum + n.positions.length, 0);
  }

  // 写入 final-noun-index.json
  const finalNounIndex = {
    meta: {
      source: 's0-only',
      chunkCount: entries.length,
      questionCount: Object.keys(question_indexes).length,
      totalNouns,
      totalPositions,
      timestamp: new Date().toISOString(),
    },
    question_indexes,
  };

  const outPath = path.join(process.cwd(), 'final-noun-index.json');
  fs.writeFileSync(outPath, JSON.stringify(finalNounIndex, null, 2), 'utf-8');

  console.log('\n' + '='.repeat(60));
  console.log('✅ 预处理完成');
  console.log('='.repeat(60));
  console.log(`输出: ${outPath}`);
  console.log(`问题数: ${Object.keys(question_indexes).length}`);
  console.log(`名词数: ${totalNouns}`);
  console.log(`位置数: ${totalPositions}`);
  console.log(`\n下一步: node ablation.js`);
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});
