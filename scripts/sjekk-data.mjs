// Stopper commit hvis private data er på vei inn i Git.
// Kjøres automatisk før hver commit (.githooks/pre-commit), eller manuelt: npm run sjekk-data
import { execSync } from 'node:child_process';

const filer = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' })
  .split('\n').map((f) => f.trim()).filter(Boolean);

const forbudt = [
  [/^data\//i, 'Data-mappen skal aldri i Git'],
  [/\.(xlsx|xlsm|xls|csv)$/i, 'regneark skal aldri i Git'],
  [/(^|\/)import-.*\.json$/i, 'importfiler inneholder ekte tall'],
  [/(^|\/)\.env(\.|$)(?!example)/i, 'hemmeligheter (.env)'],
];

const treff = [];
for (const f of filer) for (const [r, grunn] of forbudt) if (r.test(f)) treff.push(`  ${f}  – ${grunn}`);

// Innholdssjekk: fulle kontonumre (11 sifre, med eller uten mellomrom/punktum)
for (const f of filer.filter((f) => /\.(ts|tsx|js|mjs|json|md|sql|html|css)$/.test(f) && !f.endsWith('package-lock.json'))) {
  let innhold = '';
  try { innhold = execSync(`git show ":${f}"`, { encoding: 'utf8' }); } catch { continue; }
  if (/\b\d{4}[ .]?\d{2}[ .]?\d{5}\b/.test(innhold)) treff.push(`  ${f}  – ser ut til å inneholde et fullt kontonummer`);
}

if (treff.length) {
  console.error('\n✗ Commit stoppet – mulige private data:\n' + treff.join('\n') + '\n');
  process.exit(1);
}
console.log(`✓ Ingen private data blant ${filer.length} filer`);
