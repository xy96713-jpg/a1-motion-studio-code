import fs from 'node:fs';
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/check-composite.mjs <layout.json>'); process.exit(2); }
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const [x0, y0, x1, y1] = j.safe;
const inter = (a, b) => !(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1]);
const errors = [];
for (const [k, v] of Object.entries(j.layout)) {
  for (const [name, b] of [['title', v.box], ['sub', v.subBox]]) {
    if (b[0] < x0 || b[1] < y0 || b[0] + b[2] > x1 || b[1] + b[3] > y1) errors.push(k + ' ' + name + ' out of safe');
  }
  if (inter(v.box, v.subBox)) errors.push(k + ' title/sub overlap');
  if (j.subjects[k] && inter(v.box, j.subjects[k])) errors.push(k + ' title/subject overlap');
  if (j.subjects[k] && inter(v.subBox, j.subjects[k])) errors.push(k + ' sub/subject overlap');
}
j.errors = errors;
fs.writeFileSync(file, JSON.stringify(j, null, 1) + String.fromCharCode(10));
if (errors.length) { console.error('COMPOSITE FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('COMPOSITE PASS ' + Object.keys(j.layout).length + ' blocks');
