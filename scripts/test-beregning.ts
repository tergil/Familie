// Tester beregningslogikken uten nettleser. Kjør: npm test
import { avrundOpp, foreslaOverforinger, kopierRevisjon, oppsummerFelles, oppsummerPrivat, sammenlign, tilMnd, aktivRevisjon } from '../src/logikk/beregning';
import { fellesFlyt, privatFlyt } from '../src/logikk/flyt';
import { demoFelles, demoPrivat } from '../src/data/demo';

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

console.log(`\n${ok} ok, ${feil} feil`);
if (feil) process.exit(1);
