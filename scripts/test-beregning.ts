// Tester beregningslogikken uten nettleser. Kjør: npm test
import { avrundOpp, foreslaOverforinger, kopierRevisjon, oppsummerFelles, oppsummerPrivat, sammenlign, tilMnd, aktivRevisjon } from '../src/logikk/beregning';
import { fellesFlyt, privatFlyt } from '../src/logikk/flyt';
import { demoFelles, demoPrivat } from '../src/data/demo';
import { andelGaatt, avstem, dagerIMaaned, flyttMaaned, kategoriStatus, kontoPlan, kontoerFor, muligeDubletter, revisjonForMaaned } from '../src/logikk/oppfolging';
import type { Post, Saldo, Utgift } from '../src/data/modell';

let feil = 0;
let ok = 0;
function sjekk(navn: string, faktisk: unknown, forventet: unknown) {
  const a = JSON.stringify(faktisk);
  const b = JSON.stringify(forventet);
  if (a === b) ok++;
  else { feil++; console.error(`✗ ${navn}\n    fikk:     ${a}\n    forventet: ${b}`); }
}

// --- Grunnregning
sjekk('tilMnd år', tilMnd(1200, 'aar'), 100);
sjekk('tilMnd kvartal', tilMnd(300, 'kvartal'), 100);
sjekk('avrund 10206→10500', avrundOpp(10206, 500), 10500);
sjekk('avrund eksakt', avrundOpp(500, 500), 500);
sjekk('avrund steg 0', avrundOpp(10.2, 0), 11);

// --- Demo: summer og forslag
const dok = demoFelles();
const [vaar, host] = dok.revisjoner;
const opp = oppsummerFelles(dok, vaar);
// utgifter: 21000+2200+1800+699+329+2200+460+250+1500+9000 = 39438; sparing: 8000+1000+1000+1968 = 11968
sjekk('utgifter', Math.round(opp.utgifter), 39438);
sjekk('sparing', Math.round(opp.sparing), 11968);

// Forslaget skal treffe hver persons mål og bare bruke runde beløp
for (const p of opp.personer) sjekk(`mål oppfylt ${p.person.navn}`, p.overfort, p.maal);
sjekk('runde overføringer', vaar.overforinger.every((o) => o.belop % 500 === 0), true);
sjekk('ingen underdekning', opp.kontoer.every((k) => k.balanse >= 0), true);
sjekk('andel 40/60', opp.personer.map((p) => p.andel), [40, 60]);
// Barnetrygd dekker barnesparingen alene – ingen overføring dit
sjekk('barnetrygd trenger ikke overføring', vaar.overforinger.some((o) => o.tilKontoId === 'k-barn'), false);

// --- Excel-eksempelet (juli 2026): 63 806 i behov → per konto rundet til 500
const excel = demoFelles();
excel.revisjoner = [{
  ...structuredClone(vaar), id: 'x', overforinger: [], andeler: { kari: 35, ola: 65 },
  inntekter: [],
  poster: [
    { id: 'a', navn: 'Renter', belop: 33100, frekvens: 'mnd', type: 'utgift', kategoriId: 'bolig', kontoId: 'k-laan' },
    { id: 'b', navn: 'Avdrag', belop: 11000, frekvens: 'mnd', type: 'sparing', kategoriId: 'bolig', kontoId: 'k-laan' },
    { id: 'c', navn: 'Regninger', belop: 10206, frekvens: 'mnd', type: 'utgift', kategoriId: 'bolig', kontoId: 'k-regning' },
    { id: 'd', navn: 'Mat', belop: 8000, frekvens: 'mnd', type: 'utgift', kategoriId: 'mat', kontoId: 'k-bruk' },
    { id: 'e', navn: 'Hus', belop: 1000, frekvens: 'mnd', type: 'sparing', kategoriId: 'sparing', kontoId: 'k-hus' },
    { id: 'f', navn: 'Ferie', belop: 500, frekvens: 'mnd', type: 'sparing', kategoriId: 'sparing', kontoId: 'k-ferie' },
  ],
}];
const er = excel.revisjoner[0];
const eo = oppsummerFelles(excel, er);
sjekk('excel total', eo.total, 63806);
sjekk('excel forslag per konto', eo.kontoer.map((k) => k.forslag), [44500, 10500, 8000, 1000, 500]);
sjekk('excel mål 35/65', eo.personer.map((p) => p.maal), [23000, 42000]);
er.overforinger = foreslaOverforinger(excel, er);
const eo2 = oppsummerFelles(excel, er);
sjekk('excel overført = mål', eo2.personer.map((p) => p.overfort), [23000, 42000]);
sjekk('excel buffer', eo2.buffer, 65000 - 63806);
sjekk('excel få overføringer', er.overforinger.length <= 6, true);

// --- Revisjoner
sjekk('aktiv revisjon i august', aktivRevisjon(dok.revisjoner, '2026-08-15')?.id, host.id);
sjekk('aktiv revisjon i mars', aktivRevisjon(dok.revisjoner, '2026-03-01')?.id, vaar.id);
sjekk('aktiv revisjon før første', aktivRevisjon(dok.revisjoner, '2020-01-01')?.id, vaar.id);
const diff = sammenlign(vaar, host);
sjekk('diff renter', diff.find((d) => d.id === 'p-renter')?.endring, 'endret');
sjekk('diff sfo ny', diff.find((d) => d.id === 'p-sfo')?.endring, 'ny');
sjekk('diff strømmetj. fjernet', diff.find((d) => d.id === 'p-strm')?.endring, 'fjernet');
const kopi = kopierRevisjon(host, 'Ny', '2027-01-01');
sjekk('kopi ny id', kopi.id !== host.id, true);
sjekk('kopi beholder post-id', kopi.poster[0].id, host.poster[0].id);
sjekk('kopi er dyp', kopi.poster !== host.poster, true);

// --- Privat
const priv = demoPrivat('ola');
const po = oppsummerPrivat(dok, host, priv.revisjoner[0], 'ola');
const hopp = oppsummerFelles(dok, host);
sjekk('privat tilFelles = felles overført', po.tilFelles, hopp.personer.find((p) => p.person.id === 'ola')!.overfort);
sjekk('privat ubudsjettert', Math.round(po.ubudsjettert), Math.round(61000 - po.tilFelles - 6938));

// --- Flyt: det som går inn i en node skal gå ut (unntatt endenoder)
function balanserer(flyt: ReturnType<typeof fellesFlyt>) {
  const inn = new Map<string, number>(); const ut = new Map<string, number>();
  for (const l of flyt.lenker) { inn.set(l.mal, (inn.get(l.mal) ?? 0) + l.verdi); ut.set(l.kilde, (ut.get(l.kilde) ?? 0) + l.verdi); }
  return flyt.noder.every((n) => !inn.has(n.id) || !ut.has(n.id) || Math.abs(inn.get(n.id)! - ut.get(n.id)!) < 1);
}
sjekk('fellesflyt enkel balanserer', balanserer(fellesFlyt(dok, host, 'enkel')), true);
sjekk('fellesflyt kontoer balanserer', balanserer(fellesFlyt(dok, host, 'kontoer')), true);
sjekk('privatflyt balanserer', balanserer(privatFlyt(dok, host, priv, priv.revisjoner[0], 'kontoer')), true);
sjekk('privatflyt skjuler andres poster', privatFlyt(dok, host, priv, priv.revisjoner[0], 'enkel').noder.some((n) => n.navn.includes('Kari')), false);

// --- Oppfølging: måneder
sjekk('flytt måned bakover over årsskifte', flyttMaaned('2026-01', -1), '2025-12');
sjekk('dager i februar 2028', dagerIMaaned('2028-02'), 29);
sjekk('andel gått midt i måneden', andelGaatt('2026-09', '2026-09-15'), 0.5);
sjekk('andel gått tidligere måned', andelGaatt('2026-08', '2026-09-15'), 1);
sjekk('revisjon for august', revisjonForMaaned(dok.revisjoner, '2026-08')?.id, host.id);

// --- Oppfølging: dobbeltføring
const u = (id: string, dato: string, belop: number, kontoId = 'k-bruk'): Utgift =>
  ({ id, dato, belop, kontoId, kategoriId: 'mat', notat: '', privat: false, fortAv: 'kari@example.com' });
const liste = [u('a', '2026-09-10', 845), u('b', '2026-09-01', 845), u('c', '2026-09-10', 845, 'k-regning'), u('d', '2026-09-11', 846)];
sjekk('dublett: samme konto og beløp innen 7 dager', muligeDubletter(u('ny', '2026-09-12', 845), liste).map((x) => x.id), ['a']);
sjekk('dublett: ikke seg selv ved redigering', muligeDubletter(u('a', '2026-09-10', 845), liste).map((x) => x.id), []);

// --- Oppfølging: kategoristatus
const mat: Post = { id: 'm', navn: 'Mat', belop: 9500, frekvens: 'mnd', type: 'utgift', kategoriId: 'mat', kontoId: 'k-bruk', folgOpp: true };
const fast: Post = { id: 'f', navn: 'Strøm', belop: 2000, frekvens: 'mnd', type: 'utgift', kategoriId: 'bolig', kontoId: 'k-regning' };
const status = (brukt: number) => kategoriStatus([mat, fast], [u('x', '2026-09-05', brukt)], 0.5)[0];
sjekk('tempo i rute', status(4000).tempo, 'i-rute');
sjekk('tempo over tempo', status(6000).tempo, 'over-tempo');
sjekk('tempo over budsjett', status(10000).tempo, 'over-budsjett');
sjekk('faste poster teller ikke i oppfølging', kategoriStatus([mat, fast], [], 0.5).map((k) => k.kategoriId), ['mat']);
sjekk('utgift uten budsjett vises', kategoriStatus([], [{ ...u('y', '2026-09-05', 300), kategoriId: 'personlig' }], 0.5)[0].tempo, 'ikke-budsjettert');

// --- Oppfølging: saldokontroll
const odok = demoFelles();
const orev = odok.revisjoner[1];
orev.poster = orev.poster.map((p) => (p.id === 'p-mat' ? { ...p, folgOpp: true } : p));
const bruk = odok.kontoer.find((k) => k.id === 'k-bruk')!;
const plan = kontoPlan(bruk, odok, orev);
const innBruk = orev.overforinger.filter((o) => o.tilKontoId === 'k-bruk').reduce((s, o) => s + o.belop, 0);
sjekk('plan inn = overføringer til konto', plan.inn, innBruk);
sjekk('plan variabel = mat', plan.utVariabel, 9500);
const saldo = (maaned: string, belop: number): Saldo => ({ id: maaned, kontoId: 'k-bruk', maaned, belop, privat: false, fortAv: '' });
// Brukte 9 800 (300 over budsjett), men førte bare 9 000
const av = avstem(bruk, plan, [saldo('2026-08', 1000), saldo('2026-09', 1000 + innBruk - 9800)], [u('z', '2026-09-20', 9000)], '2026-09');
sjekk('avvik -300', Math.round(av.avvik!), -300);
sjekk('forbruk fra saldo 9800', Math.round(av.forbrukFraSaldo!), 9800);
sjekk('ikke ført 800', Math.round(av.ikkeFort!), 800);
sjekk('uten forrige saldo: ingen avvik', avstem(bruk, plan, [saldo('2026-09', 500)], [], '2026-09').avvik, undefined);
// Sparekonto: sparing blir stående
const hus = odok.kontoer.find((k) => k.id === 'k-hus')!;
const husPlan = kontoPlan(hus, odok, orev);
sjekk('sparekonto: sparing er ikke ut', husPlan.utFast + husPlan.utVariabel, 0);
// Privat: lønnskonto og egen fondskonto
const opriv = demoPrivat('ola');
const oprev = opriv.revisjoner[0];
const lonn = kontoPlan(odok.kontoer.find((k) => k.id === 'k-ola')!, odok, orev, opriv, oprev);
const privatSum = oprev.poster.reduce((s, p) => s + p.belop, 0);
const tilFelles = orev.overforinger.filter((o) => o.fraKontoId === 'k-ola').reduce((s, o) => s + o.belop, 0);
sjekk('lønnskonto inn = lønn', lonn.inn, 61000);
sjekk('lønnskonto ut = til felles + alle private poster', lonn.utFast + lonn.utVariabel, tilFelles + privatSum);
const fond = kontoPlan(opriv.kontoer[0], odok, orev, opriv, oprev);
sjekk('fondskonto inn = fondssparing', fond.inn, 2500);
sjekk('kontoer for privat: lønnskonto + egne', kontoerFor(odok, opriv, 'privat').map((k) => k.id), ['k-ola', opriv.kontoer[0].id]);

console.log(`\n${ok} ok, ${feil} feil`);
if (feil) process.exit(1);
