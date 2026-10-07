const fs = require('fs');
const data = JSON.parse(fs.readFileSync('D:/桌面/comparison-experiment-main/data/hotpotqa/per-question.json', 'utf8'));

const f1 = 'D:/桌面/comparison-experiment-main/output/fulltext-baseline-noCoT-100-2026-10-07T11-27-29/details.json';
const f2 = 'D:/桌面/comparison-experiment-main/output/fulltext-baseline-noCoT-200-2026-10-07T11-44-23/details.json';

const all = [...JSON.parse(fs.readFileSync(f1,'utf8')), ...JSON.parse(fs.readFileSync(f2,'utf8'))];

// 排序字典序
all.sort((a,b) => a.qid < b.qid ? -1 : a.qid > b.qid ? 1 : 0);

console.log('总题数:', all.length);
console.log('EM:', all.filter(x=>x.em).length);
console.log('非EM:', all.filter(x=>!x.em).length);
console.log();

// 输出 Q + 答案 给前端用
const out = all.map(x => ({
  qid: x.qid,
  index: x.index,
  question: x.question,
  pred: x.predictedAnswer,
  gold: x.expectedAnswer,
  score: x.score,
  em: x.em
}));
fs.writeFileSync('D:/桌面/comparison-experiment-main/output/_all-300-detail.json', JSON.stringify(out, null, 2), 'utf8');

// 列出每个 qid 对应的 question + pred + gold，按 4 批打印
const batchSize = 75;
const batches = [];
for (let i = 0; i < out.length; i += batchSize) {
  batches.push(out.slice(i, i + batchSize));
}

// 把数据写到4个分批文件中
batches.forEach((b, idx) => {
  fs.writeFileSync(`D:/桌面/comparison-experiment-main/output/_batch-${idx+1}-detail.json`,
    JSON.stringify(b, null, 2), 'utf8');
});
console.log('已生成 4 个 batch 文件');