const fs = require('fs');
const dirs = [
  '01-实验脚本',
  '02-测试输出',
  '03-合并与人工审查脚本',
  '04-人工审查结果',
  '05-源数据',
  '06-完整聊天记录',
  '07-实验流程说明'
];
const root = 'D:/桌面/comparison-experiment-main/300个无拓扑测试样本';
for (const d of dirs) {
  fs.mkdirSync(`${root}/${d}`, { recursive: true });
}
console.log('已创建', dirs.length, '个子目录');