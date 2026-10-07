const fs = require('fs');
const data = JSON.parse(fs.readFileSync('D:/桌面/comparison-experiment-main/data/hotpotqa/per-question.json', 'utf8'));
const borderlines = ['hotpot_379', 'hotpot_4369', 'hotpot_6021', 'hotpot_5118', 'hotpot_4173', 'hotpot_6789', 'hotpot_4596', 'hotpot_5017', 'hotpot_6654', 'hotpot_379', 'hotpot_6654', 'hotpot_3701', 'hotpot_4317', 'hotpot_2956', 'hotpot_4428', 'hotpot_6773', 'hotpot_6883', 'hotpot_4330'];
for (const q of borderlines) {
  if (!data.questions[q]) continue;
  const e = data.questions[q];
  console.log('---', q, '---');
  console.log('Q:', e.question);
  console.log('A:', e.answer);
  console.log();
}