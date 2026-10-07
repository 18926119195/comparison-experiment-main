const fs = require('fs');
const d = JSON.parse(fs.readFileSync('D:/桌面/comparison-experiment-main/output/fulltext-baseline-noCoT-200-2026-10-07T11-44-23/details.json', 'utf8'));
const wrong = d.filter(x => !x.em).map(x => ({ qid: x.qid, pred: x.predictedAnswer, exp: x.expectedAnswer, score: x.score }));
fs.writeFileSync('D:/桌面/comparison-experiment-main/output/fulltext-baseline-noCoT-200-2026-10-07T11-44-23/non-em-list.json', JSON.stringify(wrong, null, 2), 'utf8');
console.log('non-em count:', wrong.length);
console.log('qids only:');
console.log(wrong.map(x => x.qid).join('\n'));