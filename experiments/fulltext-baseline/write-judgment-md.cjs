const fs = require('fs');

const sem = {
  // batch 1
  hotpot_1004: '同人名(Chris Tarbell = Christopher "Chris" Tarbell)',
  hotpot_125: 'pred 给出完整河名 Richmond River，gold 是简略名',
  hotpot_1297: 'pred 缺 County 后缀',
  hotpot_1356: '单复数差(saint/saints)',
  hotpot_1464: '艺名 vs 全名(Eric Bana = Eric Banadinović)',
  hotpot_163: '艺名 vs 全名(Kelly Osbourne = Kelly Lee Osbourne)',
  hotpot_1879: 'pred 含 gold 关键短语"master builder"',
  hotpot_190: '同队(gold 加 sport 后缀)',
  hotpot_191: '缩写 vs 全称(NBC = National Broadcasting Company)',
  hotpot_1937: 'pred 更具体(FBS 是 Division I 子集)',
  hotpot_1939: '冠词差(The Magic Band ≈ Magic Band)',
  hotpot_1999: '同公司(gold 省略 Inc.)',
  hotpot_2008: 'pred 含 gold 关键短语"controversial public figure"',
  hotpot_201: '同队(gold 加 Football Club 后缀)',
  hotpot_2020: '冠词差(The Colomac Mine ≈ Colomac Mine)',
  hotpot_2073: '同人(全名)',
  hotpot_215: '同城(全名加 Alabama)',
  hotpot_2174: '同人(全名)',
  hotpot_2189: '同人(中间名首字母)',
  hotpot_2211: 'pred 是 gold 中一个正确实体(People!)',
  hotpot_2218: 'pred 更具体(Malayalam cinema ≈ Malayalam)',
  hotpot_2231: '数字 10 vs ten',
  hotpot_2347: '介词差(in an automobile accident)',
  // batch 2
  hotpot_241: '艺名 vs 本名(Paige O\'Hara = Donna Paige Helmintoller)',
  hotpot_2475: '国名 vs 形容词(Northern Ireland ≈ Northern Irish)',
  hotpot_291: '纯数字 vs 数字+限定语',
  hotpot_3015: '同人/同组(pred 列4人，gold 改用 "the team of" 改写)',
  hotpot_3104: '同短句(pred 缺 "as possible")',
  hotpot_32: '同人(Charles Nungesser = Charles Eugène Nungesser)',
  hotpot_3357: '同人译名差(Grigory Margulis = Gregori Aleksandrovich Margulis)',
  hotpot_3476: '同人拼写差',
  hotpot_3536: '同人(全名)',
  hotpot_3592: '单复数差(brother/brothers)',
  hotpot_3639: '昵称 vs 本名(Duff Goldman = Jeffrey Adam "Duff" Goldman)',
  hotpot_3898: '冠词差(The bald eagle ≈ Bald eagle)',
  hotpot_391: '同人(全名)',
  hotpot_3910: '同人(艺名 vs Sir Thomas Daniel Courtenay)',
  // batch 3
  hotpot_4106: '同人(中间首字母)',
  hotpot_4317: '数字 9 vs nine vertical feet',
  hotpot_4334: '同人(全名 Christopher Haden-Guest)',
  hotpot_4596: '数字 5 vs five books',
  hotpot_4804: '同场地(Wembley Stadium ≈ Wembley)',
  hotpot_4841: '同类型(American comedy film ≈ American comedy)',
  hotpot_4950: '同地点(Gold Coast in Queensland ≈ Gold Coast)',
  hotpot_5055: '同人(Johnny Galecki = John Mark Galecki)',
  hotpot_5118: '都答出 Suining，gold 是整句',
  hotpot_5406: '同人(Edmund Barton = Sir Edmund Barton)',
  hotpot_5503: '同概念(postmodern ≈ postmodern schools of thought)',
  hotpot_5519: '同人短名 vs 全名',
  hotpot_5521: '冠词差(the Council of Forty-four ≈ Council of Forty-four)',
  // batch 4
  hotpot_5769: '引号差',
  hotpot_5987: '冠词差',
  hotpot_6021: 'pred 含 gold 答案 model',
  hotpot_6115: '冠词差',
  hotpot_6248: '同县(全名加州名)',
  hotpot_6330: '同人(Pierre Boulez = Pierre Louis Joseph Boulez)',
  hotpot_6468: '单复数(Chimpanzee/Chimpanzees)',
  hotpot_6568: 'pred 是 gold 关键实体',
  hotpot_6646: '单复数',
  hotpot_6654: 'pred 是 gold 关键实体(Kramer 是 Kramer Guitars)',
  hotpot_6693: '国名 vs 形容词(Japan ≈ Japanese)',
  hotpot_6789: '同队(Oklahoma Sooners 是 Oklahoma Sooners men\'s basketball)',
  hotpot_6883: 'Maquis 是 rural 的具体化形式',
  hotpot_7174: '同人(Steve Coogan = Stephen John Coogan)',
  hotpot_720: '冠词差',
  hotpot_7232: '同人(Hector Berlioz = Louis-Hector Berlioz)',
  hotpot_7251: '同数字(1,840 = 1,840 students)',
  hotpot_7325: 'Division II = NCAA Division II',
  hotpot_7358: 'pred 更具体',
  hotpot_7359: '同城(Watertown = Watertown, New York)',
  hotpot_737: '引号差'
};

const wrong = {
  hotpot_100: '问地点，pred 答了族群名 Mascogos',
  hotpot_1207: '问方位区域，pred 答了具体地名 Marathon',
  hotpot_1304: 'yes/no 题，pred 答了 Disney Interactive (格式错误)',
  hotpot_1408: '问地点，pred 给了 Dayton Memorial Hall，gold 是 First Street',
  hotpot_1477: '问城市，pred 给了基地名 Creech AFB，gold 是 Clark County',
  hotpot_1520: '问挪威郡，pred Aust-Agder vs gold Buskerud',
  hotpot_1569: '问时间，pred 给了皇帝名 Hadrian',
  hotpot_1700: 'pred 给了 Don\'t Kill It，gold 是 Sleepy Hollow (不同电影)',
  hotpot_1717: 'Black Friday ≠ the fourth Thursday',
  hotpot_1796: 'Venstre Reform Party ≠ Liberal Venstre party',
  hotpot_1813: 'Online video game ≠ role-playing game',
  hotpot_1847: 'Yu-Hsia Chen ≠ Marjorie McGinnis',
  hotpot_2378: '问"如何表示函数"，pred 给了名字 Taylor 1',
  hotpot_2462: '问城镇的地理特征，pred Bunker Hill ≠ gold Charlestown',
  hotpot_2845: 'Terri Nunn ≠ Sonya Scarlet (谁更年轻)',
  hotpot_2956: 'yes/no 题，pred 答了 Robert Wise',
  hotpot_3117: '问身高，pred 答了人名 Brent Barry',
  hotpot_3307: 'Time Warner ≠ Southern Progress Corporation',
  hotpot_3344: 'Magic Kingdom ≠ Anaheim',
  hotpot_3514: 'Charles Wesley ≠ George Whitefield',
  hotpot_3701: '1252 and 1259 ≠ 1241 until his death in 1250',
  hotpot_379: '问 criteria，pred 给了 title "Eighth Wonder"',
  hotpot_4173: 'ESPN College Football Friday Primetime ≠ College Football Scoreboard',
  hotpot_4312: '问飞机，pred 答了人 Donald Trump',
  hotpot_4330: '问头衔，pred 答了人名 Colonel Gaddafi',
  hotpot_4369: 'Greek ≠ Greek-American',
  hotpot_4428: 'Rum ≠ cocktail',
  hotpot_4980: 'Sausalito ≠ Las Vegas Strip',
  hotpot_5017: 'HotpotQA 期望实体名 Zaza Pachulia，pred 答了 No',
  hotpot_6213: 'Steve Tisch ≠ Mitchell Block and Michael Sarnoski',
  hotpot_6773: 'Genera (分类学名) ≠ flowering plants',
  hotpot_6981: 'Queensland ≠ Victoria'
};

// 合并两批 details
const f1 = 'D:/桌面/comparison-experiment-main/output/fulltext-baseline-noCoT-100-2026-10-07T11-27-29/details.json';
const f2 = 'D:/桌面/comparison-experiment-main/output/fulltext-baseline-noCoT-200-2026-10-07T11-44-23/details.json';
const all = [...JSON.parse(fs.readFileSync(f1,'utf8')), ...JSON.parse(fs.readFileSync(f2,'utf8'))];
all.sort((a,b) => a.qid < b.qid ? -1 : a.qid > b.qid ? 1 : 0);

// 输出 markdown
const lines = [];
lines.push('# 300 题人工比对汇总（按字典序）');
lines.push('');
lines.push('每条以 `qid | LLM预测 | gold | 判定 | 理由` 给出。');
lines.push('- **EM ✓** = LLM 字符串与 gold 完全相等');
lines.push('- **SEM ✓** = 语义等价但颗粒度差（人名拼写、单复数、缩写、冠词、数字格式、单位等）');
lines.push('- **✗** = 答非所问 / 答错实体 / 答错方向');
lines.push('');

let totEm = 0, totSem = 0, totWrong = 0;
const semIds = Object.keys(sem);
const wrongIds = Object.keys(wrong);

for (let bi = 0; bi < 4; bi++) {
  const start = bi * 75;
  const end = Math.min(start + 75, all.length);
  lines.push(`## 第 ${bi+1} 批（第 ${start+1}-${end} 题）`);
  lines.push('');
  lines.push('| qid | LLM预测 | 标准答案 | 判定 | 备注 |');
  lines.push('|---|---|---|---|---|');
  for (let i = start; i < end; i++) {
    const x = all[i];
    let verdict = 'EM ✓';
    let note = '';
    if (semIds.includes(x.qid)) {
      verdict = 'SEM ✓';
      note = sem[x.qid];
      totSem++;
    } else if (wrongIds.includes(x.qid)) {
      verdict = '✗';
      note = wrong[x.qid];
      totWrong++;
    } else {
      totEm++;
    }
    const predEsc = x.predictedAnswer.replace(/\|/g,'\\|');
    const goldEsc = x.expectedAnswer.replace(/\|/g,'\\|');
    lines.push(`| ${x.qid} | ${predEsc} | ${goldEsc} | ${verdict} | ${note} |`);
  }
  lines.push('');
}

lines.push('---');
lines.push('');
lines.push('## 总计');
lines.push('');
lines.push(`| 判定 | 题数 | 占比 |`);
lines.push(`|---|---|---|`);
lines.push(`| EM ✓ (字符串相等) | ${totEm} | ${(100*totEm/300).toFixed(2)}% |`);
lines.push(`| SEM ✓ (语义相等) | ${totSem} | ${(100*totSem/300).toFixed(2)}% |`);
lines.push(`| ✗ (答错) | ${totWrong} | ${(100*totWrong/300).toFixed(2)}% |`);
lines.push(`| **语义正确 (EM+SEM)** | **${totEm+totSem}** | **${(100*(totEm+totSem)/300).toFixed(2)}%** |`);

fs.writeFileSync('D:/桌面/comparison-experiment-main/output/manual-judgment-300.md', lines.join('\n'), 'utf8');
console.log('已写入 manual-judgment-300.md');
console.log(`EM=${totEm} SEM=${totSem} Wrong=${totWrong} Semantic=${totEm+totSem}/300 (${(100*(totEm+totSem)/300).toFixed(2)}%)`);