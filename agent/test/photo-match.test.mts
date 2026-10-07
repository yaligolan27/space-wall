// The remote's photo import guesses whose photo each file is from its name (app/remote/photo-match.js): Google Forms
// saves an upload as "<file> - <uploader's Google name>", in Hebrew or in Latin letters. Made-up names.
//
//   npm test
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

await import('../../app/remote/photo-match.js');
const { skel, parts, suggest } = (globalThis as any).photoMatch;

// ---- the same name in Hebrew and in Latin letters has the same consonants
const pairs: [string, string][] = [['דנה', 'Dana'], ['כהן', 'Cohen'], ['אבישי', 'Avishai'], ['ברקוביץ', 'Berkovitz'], ['חן', 'Chen'],
  ['שירה', 'Shira'], ['יונתן', 'Yonatan'], ['אבוטבול', 'Abutbul'], ['ליבנה', 'Livne'], ['ויסוצקי', 'Vysotsky'], ['צור', 'Tzur']];
for (const [he, en] of pairs) check(`${he} ~ ${en}`, skel(he) === skel(en), skel(he) + ' / ' + skel(en));
check('a Google Forms file name', JSON.stringify(parts('IMG_2041 - Dana Cohen.jpeg')) === JSON.stringify({ who: 'Dana Cohen', own: 'IMG_2041' }));
check('a file name with " - " inside', parts('me - at the beach - Roy Ben Hamo.png').who === 'Roy Ben Hamo');
check('a name without an uploader', parts('folder/שירה טל.jpg').own === 'שירה טל' && parts('folder/שירה טל.jpg').who === '');

const people = [
  { id: 'dana', first: 'דנה', last: 'כהן', photoLink: 'x' },
  { id: 'dani', first: 'דני', last: 'כהן' },
  { id: 'avishai', first: 'אבישי', last: 'ברקוביץ', photoLink: 'x' },
  { id: 'chen', first: 'חן', last: 'לוי', photoLink: 'x' },
  { id: 'roy', first: 'רועי', last: 'בן חמו', photoLink: 'x' },
  { id: 'shira', first: 'שירה', last: 'טל' },
  { id: 'michal1', first: 'מיכל', last: 'ששון' },
  { id: 'michal2', first: 'מיכל', last: 'אורן' },
  { id: 'nikolai', first: 'ניקולאי', last: 'ויסוצקי', photoLink: 'x' },
];
const names = [
  'IMG_2041 - Dana Cohen.jpeg',            // Latin letters
  'IMG_7731 - אבישי ברקוביץ.jpg',           // Hebrew
  'photo - Levi Chen.png',                 // last name first
  'IMG_0001 - Roy Benhamo.heic',           // a last name of two words, written as one
  'שירה טל.jpg',                            // no uploader: the file's own name
  'IMG_1 - Michal.jpg',                    // a first name two people share
  'DSC_2210 - Nikolai V.jpg',              // a first name that is clear by itself
  'IMG_5 - Someone Else.jpg',              // no one on the list
];
const got = suggest(names, people);
const want = ['dana', 'avishai', 'chen', 'roy', 'shira', null, 'nikolai', null];
names.forEach((n, i) => check(`${n} → ${want[i] ?? 'no one'}`, got[i] === want[i], String(got[i])));

// one person's Google account sent everyone's photos: the uploader's name says nothing
const fromOne = suggest(['a - Dana Cohen.jpg', 'b - Dana Cohen.jpg', 'שירה טל - Dana Cohen.jpg'], people);
check('an uploader on several files is ignored', fromOne[0] === null && fromOne[1] === null && fromOne[2] === 'shira', JSON.stringify(fromOne));
// two files of the same person: only the surer one is suggested
const twice = suggest(['x - Dana Cohen.jpg', 'דנה כהן.jpg'], people);
check('no one is suggested twice', twice.filter(x => x === 'dana').length === 1, JSON.stringify(twice));

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall photo match tests passed');
