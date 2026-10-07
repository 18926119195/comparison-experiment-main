const fs = require('fs');
const runs = [
  ['D:/桌面/comparison-experiment-main/output/recall-no-thinking/recall-raw.log', 'run1-newPrompt (recall thinking OFF, reasoning thinking ON, default temp)'],
  ['D:/桌面/comparison-experiment-main/output/recall-no-thinking-2/recall-raw.log', 'run2-bothThinkingOFF (no temp)'],
  ['D:/桌面/comparison-experiment-main/output/recall-temp0/recall-raw.log', 'run3-temp0 (temp=0, both thinking OFF)'],
  ['D:/桌面/comparison-experiment-main/output/recall-temp0-rep/recall-raw.log', 'run4-temp0-rep (重复 run3 验证可复现)'],
];
for (const [path, label] of runs) {
  const txt = fs.readFileSync(path,'utf8');
  // 抽出 rawResponse 字段的值
  const m = txt.match(/"rawResponse":\s*"((?:[^"\\]|\\.)*)"/);
  const u = txt.match(/"usage":\s*\{[\s\S]*?\}/);
  console.log('===== ' + label + ' =====');
  console.log('usage:', u ? u[0] : '(not found)');
  console.log('rawResponse:');
  console.log(m ? m[1] : '(not found)');
  console.log();
}