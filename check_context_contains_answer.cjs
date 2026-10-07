// Check whether the expected answer actually appears in the FULL raw context (docuverse.json)
// for the questions where Recall's selected nouns did NOT contain the answer.
// This tells us: was the info available but discarded by Recall, or genuinely absent/non-literal?

const fs = require('fs');

const docuverse = JSON.parse(fs.readFileSync('data/hotpotqa/docuverse.json', 'utf8'));

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set(['the','a','an','of','in','on','at','to','and','or','is','was','were','for','by','as','with']);
function tokens(s) {
  return normalize(s).split(' ').filter(t => t.length > 1 && !STOPWORDS.has(t));
}

const targets = [
  { qid: 'hotpot_872', expectedAnswer: 'Warrington' },
  { qid: 'hotpot_1490', expectedAnswer: 'Dragon TV' },
  { qid: 'hotpot_2577', expectedAnswer: '4145 ft' },
  { qid: 'hotpot_2879', expectedAnswer: 'Captain Hans Geering' },
  { qid: 'hotpot_3740', expectedAnswer: 'potato masher' },
  { qid: 'hotpot_4241', expectedAnswer: 'Them' },
  { qid: 'hotpot_4980', expectedAnswer: 'Las Vegas Strip' },
  { qid: 'hotpot_6995', expectedAnswer: 'Joshua Rowley' },
];

for (const t of targets) {
  const chunks = docuverse.filter(d => d.questionId === t.qid);
  const fullText = chunks.map(c => c.text).join(' \n ');
  const fullNorm = normalize(fullText);
  const expNorm = normalize(t.expectedAnswer);

  const fullStringFound = fullNorm.includes(expNorm);
  const expTokens = tokens(t.expectedAnswer);
  const matchedTokens = expTokens.filter(tok => fullNorm.includes(tok));

  console.log(`\n[${t.qid}] expected="${t.expectedAnswer}"`);
  console.log(`  chunks for this question: ${chunks.length}`);
  console.log(`  full answer string found in raw context: ${fullStringFound}`);
  console.log(`  token coverage in raw context: ${matchedTokens.length}/${expTokens.length} (${matchedTokens.join(', ')})`);

  if (fullStringFound) {
    // show the sentence containing it
    for (const c of chunks) {
      if (normalize(c.text).includes(expNorm)) {
        console.log(`  FOUND in chunk [${c.chunkKey}] title="${c.title}":`);
        console.log(`    "${c.text.slice(0, 200)}"`);
        break;
      }
    }
  }
}
