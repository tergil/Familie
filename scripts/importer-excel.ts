// Leser Excel-arket i Data/ og lager en importfil (JSON) i Data/.
// Kjøres LOKALT: npm run importer -- --terje=din@gmail.com --ingrid=hennes@gmail.com ["Data/annen-fil.xlsx"]
// E-postene kobler personene til Google-innloggingen (kan også endres i appen under Personer).
// Fila lastes så inn i appen under Import/eksport. Ingenting her havner i Git (Data/ er ignorert).
//
// Skriptet er skrevet for oppsettet i «Familiebudsjett_08.2025.xlsx» (fanene Budsjett og Privat).
// Fanene Strøm og Bompenger er bare hjelpeberegninger og importeres ikke.
import ExcelJS from 'exceljs';
import { writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FellesDok, Kategori, Konto, Post, PrivatDok } from '../src/data/modell';

const DATA = 'Data';
const args = process.argv.slice(2);
const flagg = (navn: string) => args.find((a) => a.startsWith(`--${navn}=`))?.split('=')[1]?.trim().toLowerCase();
const argFil = args.find((a) => !a.startsWith('--'));
const fil = argFil ?? join(DATA, readdirSync(DATA).filter((f: string) => f.endsWith('.xlsx') && !f.startsWith('~$')).sort().pop() ?? '');
console.log(`Leser ${fil}`);

let teller = 0;
const id = (prefiks: string) => `${prefiks}-${++teller}`;

function verdi(c: ExcelJS.Cell): unknown {
  const v = c.value as unknown;
  if (v && typeof v === 'object' && 'result' in (v as object)) return (v as { result: unknown }).result;
  if (v && typeof v === 'object' && 'richText' in (v as object)) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join('');
  return v;
}
const tekst = (ark: ExcelJS.Worksheet, ref: string) => String(verdi(ark.getCell(ref)) ?? '').trim();
const tall = (ark: ExcelJS.Worksheet, ref: string) => {
  const v = verdi(ark.getCell(ref));
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------- Kategorier (etter nøkkelord)

const kategorier: Kategori[] = [
  { id: 'bolig', navn: 'Bolig', farge: 0 },
  { id: 'forsikring', navn: 'Forsikring', farge: 1 },
  { id: 'mat', navn: 'Mat og husholdning', farge: 2 },
  { id: 'barn', navn: 'Barn', farge: 3 },
  { id: 'abonnement', navn: 'Abonnementer', farge: 4 },
  { id: 'sparing', navn: 'Sparing', farge: 5 },
  { id: 'transport', navn: 'Transport', farge: 6 },
  { id: 'personlig', navn: 'Personlig', farge: 7 },
];
const REGLER: [RegExp, string][] = [
  [/forsikring/i, 'forsikring'],
  [/barnehage|barn|vemund|sfo/i, 'barn'],
  [/boliglån|kommunal|strøm|hus/i, 'bolig'],
  [/mat/i, 'mat'],
  [/bil|bensin|bom|månedskort/i, 'transport'],
  [/netflix|spotify|tidal|internett|avis|aftenposten|onedrive|microsoft|alt\+/i, 'abonnement'],
  [/spar|ferie|buffer|nordnet|fond/i, 'sparing'],
];
const kategoriFor = (navn: string) => REGLER.find(([r]) => r.test(navn))?.[1] ?? 'personlig';

// ---------------------------------------------------------------- Les arket

const bok = new ExcelJS.Workbook();
await bok.xlsx.readFile(fil);
const budsjett = bok.getWorksheet('Budsjett');
const privatArk = bok.worksheets.find((w) => w.name.trim() === 'Privat');
if (!budsjett) throw new Error('Fant ikke fanen «Budsjett»');

const tittel = tekst(budsjett, 'B1') || 'Budsjett';
console.log(`Revisjon: ${tittel}`);

// Personer – e-post til Ingrid må fylles inn i appen (Personer)
const terje = { id: 'terje', navn: 'Terje', epost: flagg('terje') ?? 'terje@endre-meg.no' };
const ingrid = { id: 'ingrid', navn: 'Ingrid', epost: flagg('ingrid') ?? 'ingrid@endre-meg.no' };
if (!flagg('terje') || !flagg('ingrid')) console.warn('NB: --terje=… og/eller --ingrid=… mangler. Plassholder brukes – endre under Personer i appen.');

// Banker og kontoer fra «Kontoer» (rad 28–32) og «Sparing/buffer» (rad 37–41)
const banker = new Map<string, string>();
const bankId = (navn: string) => {
  const n = navn.trim() || 'Ukjent bank';
  if (!banker.has(n)) banker.set(n, `bank-${n.toLowerCase().replace(/\W+/g, '-')}`);
  return banker.get(n)!;
};

const kontoer: Konto[] = [
  { id: 'k-terje', navn: 'Lønnskonto Terje', bankId: null, kontonr: '', rolle: 'avsender', eierId: terje.id },
  { id: 'k-ingrid', navn: 'Lønnskonto Ingrid', bankId: null, kontonr: '', rolle: 'avsender', eierId: ingrid.id },
];
const fraKontonr = new Map<string, Konto>();
for (let r = 28; r <= 32; r++) {
  const navn = tekst(budsjett, `B${r}`);
  if (!navn) continue;
  const k: Konto = {
    id: id('k'), navn: navn.replace(/^Fells /, 'Felles '), bankId: bankId(tekst(budsjett, `A${r}`)),
    kontonr: tekst(budsjett, `C${r}`), rolle: /spar|buffer/i.test(navn) ? 'sparing' : 'felles', eierId: null,
  };
  kontoer.push(k);
  fraKontonr.set(k.kontonr, k);
}
for (let r = 37; r <= 41; r++) {
  const navn = tekst(budsjett, `B${r}`);
  if (!navn) continue;
  const kontonr = tekst(budsjett, `C${r}`);
  const sparemaal = { maal: tall(budsjett, `F${r}`), saldo: tall(budsjett, `E${r}`), saldoDato: '2025-07-01', rente: tall(budsjett, `D${r}`) };
  const finnes = fraKontonr.get(kontonr);
  if (finnes) finnes.sparemaal = sparemaal;
  else kontoer.push({ id: id('k'), navn, bankId: bankId(tekst(budsjett, `A${r}`)), kontonr, rolle: 'sparing', eierId: null, sparemaal });
}

// «Trekk fra konto» i budsjettet → konto
function kontoFor(tekstVerdi: string): Konto | undefined {
  const t = tekstVerdi.toLowerCase();
  const felles = kontoer.filter((k) => k.rolle !== 'avsender');
  if (t.includes('lån')) return felles.find((k) => /lån/i.test(k.navn));
  if (t.includes('regning')) return felles.find((k) => /regning/i.test(k.navn));
  if (t.includes('bruk')) return felles.find((k) => /bruk/i.test(k.navn));
  if (t.includes('hus')) return felles.find((k) => /hus/i.test(k.navn));
  if (t.includes('spare')) return felles.find((k) => /sparekonto/i.test(k.navn));
  return undefined;
}

// Poster (rad 3–20). Terjes egne poster hoppes over – de ligger i fanen Privat.
const poster: Post[] = [];
const hoppetOver: string[] = [];
for (let r = 3; r <= 20; r++) {
  const navn = tekst(budsjett, `B${r}`);
  const belop = tall(budsjett, `C${r}`);
  const fra = tekst(budsjett, `D${r}`);
  if (!navn) continue;
  if (/terje/i.test(fra)) { hoppetOver.push(`${navn} (flyttes til privat)`); continue; }
  if (!belop) { hoppetOver.push(`${navn} (uten beløp)`); continue; }
  const konto = kontoFor(fra);
  if (!konto) { hoppetOver.push(`${navn} (ukjent konto «${fra}»)`); continue; }
  poster.push({
    id: id('p'), navn, belop, frekvens: 'mnd',
    type: /sparing/i.test(tekst(budsjett, `E${r}`)) ? 'sparing' : 'utgift',
    kategoriId: kategoriFor(navn), kontoId: konto.id,
  });
}

// Barnetrygd går rett til Vemund barnetrygd (avklart med Terje)
const barnetrygd = tall(budsjett, 'H20');
const vemundBt = kontoer.find((k) => /vemund barnetrygd/i.test(k.navn));
if (barnetrygd && vemundBt) {
  poster.push({ id: id('p'), navn: 'Barnetrygd spares', belop: barnetrygd, frekvens: 'mnd', type: 'sparing', kategoriId: 'barn', kontoId: vemundBt.id });
}

// Overføringer i dag (Innbetaling Ingrid/Terje, rad 28–32)
const overforinger = [];
for (let r = 28; r <= 32; r++) {
  const konto = fraKontonr.get(tekst(budsjett, `C${r}`));
  if (!konto) continue;
  const i = tall(budsjett, `E${r}`);
  const t = tall(budsjett, `F${r}`);
  if (i) overforinger.push({ id: id('o'), fraKontoId: 'k-ingrid', tilKontoId: konto.id, belop: i });
  if (t) overforinger.push({ id: id('o'), fraKontoId: 'k-terje', tilKontoId: konto.id, belop: t });
}

// Inntekter: Ingrid fra H18, Terje fra Privat F13 (nyeste verdi), barnetrygd H20
const inntektTerje = privatArk ? tall(privatArk, 'F13') : tall(budsjett, 'H19');
const inntekter = [
  { id: id('i'), navn: 'Lønn Ingrid', personId: ingrid.id, belop: tall(budsjett, 'H18'), frekvens: 'mnd' as const, tilKontoId: 'k-ingrid' },
  { id: id('i'), navn: 'Lønn Terje', personId: terje.id, belop: inntektTerje, frekvens: 'mnd' as const, tilKontoId: 'k-terje' },
  ...(barnetrygd && vemundBt ? [{ id: id('i'), navn: 'Barnetrygd', personId: null, belop: barnetrygd, frekvens: 'mnd' as const, tilKontoId: vemundBt.id }] : []),
];

const andelIngrid = Math.round(tall(budsjett, 'J12') * 100) || 35;
const gjelderFra = (() => {
  const m = tittel.match(/(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\s+(\d{4})/i);
  const mnd = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  return m ? `${m[2]}-${String(mnd.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}-01` : new Date().toISOString().slice(0, 10);
})();

const felles: FellesDok = {
  skjema: 1,
  personer: [terje, ingrid],
  banker: [...banker].map(([navn, bid]) => ({ id: bid, navn })),
  kontoer,
  kategorier,
  revisjoner: [{
    id: 'rev-import', navn: tittel.replace(/^Budsjett rev\.?\s*/i, 'Budsjett '), gjelderFra, notat: `Importert fra ${fil.split(/[\\/]/).pop()}`,
    andeler: { [ingrid.id]: andelIngrid, [terje.id]: 100 - andelIngrid }, avrundingSteg: 500,
    inntekter, poster, overforinger,
  }],
};

// ---------------------------------------------------------------- Privat (Terje)

let privat: PrivatDok | undefined;
if (privatArk) {
  const pk: Konto[] = [];
  const pposter: Post[] = [];
  // Rad 4–21: utgifter. Overføringer til felles (Mat, Felles regninger, Felles lån) hoppes over – de kommer fra fellesbudsjettet.
  for (let r = 4; r <= 21; r++) {
    const navn = tekst(privatArk, `A${r}`);
    const belop = tall(privatArk, `B${r}`);
    const sparedel = tall(privatArk, `C${r}`);
    if (!navn || !belop) continue;
    if (/^(mat|felles)/i.test(navn)) continue;
    if (sparedel > 0 && sparedel < belop) {
      // F.eks. studielån: avdragsdelen er sparing, resten renter
      pposter.push({ id: id('pp'), navn: `${navn} avdrag`, belop: sparedel, frekvens: 'mnd', type: 'sparing', kategoriId: kategoriFor(navn), kontoId: 'k-terje' });
      pposter.push({ id: id('pp'), navn: `${navn} renter`, belop: belop - sparedel, frekvens: 'mnd', type: 'utgift', kategoriId: kategoriFor(navn), kontoId: 'k-terje' });
    } else {
      pposter.push({ id: id('pp'), navn, belop, frekvens: 'mnd', type: sparedel >= belop || /avdrag/i.test(navn) ? 'sparing' : 'utgift', kategoriId: kategoriFor(navn), kontoId: 'k-terje' });
    }
  }
  // Rad 25–31: egen sparing. «Sparing felles …» ligger allerede i fellesbudsjettet.
  for (let r = 25; r <= 31; r++) {
    const navn = tekst(privatArk, `A${r}`);
    const belop = tall(privatArk, `B${r}`);
    if (!navn || !belop || /felles/i.test(navn)) continue;
    const konto: Konto = { id: id('pk'), navn: navn.replace(/^Sparing\s+/i, ''), bankId: null, kontonr: '', rolle: 'sparing', eierId: terje.id };
    pk.push(konto);
    pposter.push({ id: id('pp'), navn, belop, frekvens: 'mnd', type: 'sparing', kategoriId: /vemund/i.test(navn) ? 'barn' : 'sparing', kontoId: konto.id });
  }
  // Status-boksen (F4–H7): bufferkontoer med saldo og rente. Samlet mål 100 000 (H8).
  for (let r = 4; r <= 7; r++) {
    const navn = tekst(privatArk, `F${r}`);
    if (!navn) continue;
    pk.push({
      id: id('pk'), navn, bankId: null, kontonr: '', rolle: 'sparing', eierId: terje.id,
      sparemaal: { maal: r === 4 ? 100000 : 0, saldo: tall(privatArk, `G${r}`), saldoDato: '2025-08-01', rente: Math.round(tall(privatArk, `H${r}`) * 1000) / 10 },
    });
  }
  privat = {
    skjema: 1, eierId: terje.id, kontoer: pk.filter((k) => !k.sparemaal || k.sparemaal.maal > 0 || k.sparemaal.saldo > 0),
    revisjoner: [{ id: 'prev-import', navn: `Privat ${felles.revisjoner[0].navn.replace(/^Budsjett /, '')}`, gjelderFra, notat: 'Importert fra fanen Privat', poster: pposter }],
  };
}

// ---------------------------------------------------------------- Skriv

const ut = join(DATA, 'import-familiebudsjett.json');
writeFileSync(ut, JSON.stringify({ felles, privat }, null, 2));

const sum = (l: Post[]) => l.reduce((s, p) => s + p.belop, 0);
console.log(`\nFelles: ${poster.length} poster (${sum(poster).toLocaleString('nb-NO')} kr/mnd), ${kontoer.length} kontoer, ${overforinger.length} overføringer, fordeling ${andelIngrid}/${100 - andelIngrid}`);
if (privat) console.log(`Privat (Terje): ${privat.revisjoner[0].poster.length} poster (${sum(privat.revisjoner[0].poster).toLocaleString('nb-NO')} kr/mnd), ${privat.kontoer.length} egne kontoer`);
if (hoppetOver.length) console.log(`Hoppet over: ${hoppetOver.join(', ')}`);
console.log(`\nSkrevet til ${ut}\nLast den inn i appen: Import/eksport → Velg fil.`);
