// Tester beregningslogikken uten nettleser. Kjør: npm test
import { avrundOpp, foreslaOverforinger, kopierRevisjon, oppsummerFelles, oppsummerPrivat, privateOverforinger, sammenlign, sum, tilMnd, aktivRevisjon } from '../src/logikk/beregning';
import { fellesFlyt, privatFlyt } from '../src/logikk/flyt';
import { demoFelles, demoLister, demoPrivat } from '../src/data/demo';
import { alder, andreSondag, anledningsDato, anledningsPlan, flyttGavelister, forekomster, gaveVarsler, medAutoAnledning, personbudsjett, potter, rundDag, tilPlanType } from '../src/logikk/gaveaar';
import { andelGaatt, avstem, dagerIMaaned, flyttMaaned, kategoriStatus, kontoPlan, kontoerFor, muligeDubletter, revisjonForMaaned } from '../src/logikk/oppfolging';
import {
  MALER, adventssondager, delingsTekst, erFerdig, erGjort, flyttEtSteg, fremdrift, gavehistorikk, nyRekkefolge, punkterForDeling, hageIMaaned, huskelapp, kalenderAar, kalenderLuker, kopierPunkter, lagTre, listeSum,
  LISTETYPER, listeIkon, medStatus, nesteStatus, nullstill, punkterFraMal, tidligereGaver, tolkHurtig,
} from '../src/logikk/lister';
import type { Hendelse, Post, Punkt, Saldo, Utgift, VarselInnstillinger } from '../src/data/modell';
import { brett, icsTekst, lagIcs } from '../src/logikk/ics';
import { angreEndring, endreForekomst, forekomster as kalForekomster, gjentakTekst, kalenderPoster, sammeMonster, slettForekomst } from '../src/logikk/kalender';
import { STANDARD_VARSLER } from '../src/data/modell';
import { beregnVarsler, forVarsler, medStandard, norskTid, slaaSammen, utenDetaljer, varseltrinn } from '../src/logikk/varsler';

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
const lonnIder = new Set(dok.kontoer.filter((k) => k.rolle === 'avsender').map((k) => `k:${k.id}`));
sjekk('fellesflyt: lønnskontoene er startpunkt', fellesFlyt(dok, host, 'kontoer').lenker.some((l) => lonnIder.has(l.mal)), false);
sjekk('privatflyt: lønnskontoen er startpunkt', privatFlyt(dok, host, priv, priv.revisjoner[0], 'kontoer').lenker.some((l) => lonnIder.has(l.mal)), false);
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
// Privat brukskonto: 3 000 overføres fast fra lønn, klær (følges opp) trekkes fra brukskontoen
const opriv2 = demoPrivat('ola');
opriv2.kontoer.push({ id: 'k-egen', navn: 'Brukskonto', bankId: null, kontonr: '', rolle: 'felles', eierId: 'ola' });
const oprev2 = opriv2.revisjoner[0];
oprev2.poster.push({ id: 'p-klaer', navn: 'Klær', belop: 3000, frekvens: 'mnd', type: 'utgift', kategoriId: 'personlig', kontoId: 'k-egen', folgOpp: true });
const lonn2 = kontoPlan(odok.kontoer.find((k) => k.id === 'k-ola')!, odok, orev, opriv2, oprev2);
sjekk('lønnskonto: overføring til egen brukskonto er fast', [lonn2.utFast - lonn.utFast, lonn2.utVariabel - lonn.utVariabel], [3000, 0]);
const egen = kontoPlan(opriv2.kontoer.find((k) => k.id === 'k-egen')!, odok, orev, opriv2, oprev2);
sjekk('brukskonto: inn fra lønn, variabel ut', [egen.inn, egen.utFast, egen.utVariabel], [3000, 0, 3000]);

// --- Private overføringer: til felles, til egne kontoer, direkte trekk og rest
const penger = privateOverforinger(odok, orev, opriv2, oprev2);
sjekk('private overføringer: til felles', sum(penger.overforinger.filter((o) => o.kilde === 'felles'), (o) => o.belop), tilFelles);
sjekk('private overføringer: til egne kontoer', penger.overforinger.filter((o) => o.kilde === 'egen').map((o) => [o.konto.id, o.belop]), [[opriv2.kontoer[0].id, 2500], ['k-egen', 3000]]);
sjekk('private overføringer: rest = som ikke budsjettert', Math.round(penger.rest), Math.round(oppsummerPrivat(odok, orev, oprev2, 'ola').ubudsjettert));

// --- Huskelister: adventskalender
sjekk('advent 2026', adventssondager(2026), ['2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20']);
sjekk('advent 2023 (julaften på søndag)', adventssondager(2023), ['2023-12-03', '2023-12-10', '2023-12-17', '2023-12-24']);
sjekk('advent 2025', adventssondager(2025)[0], '2025-11-30');
const sondager = kalenderLuker(2026, 'sondager', [{ navn: 'St. Lucia', dag: '12-13' }, { navn: 'Nissefest', dag: '12-05' }]);
sjekk('søndager + egne dager, sortert', sondager.map((l) => l.dato), ['2026-11-29', '2026-12-05', '2026-12-06', '2026-12-13', '2026-12-20']);
sjekk('St. Lucia på en adventssøndag slås sammen', sondager[3].tekst, '3. søndag i advent · St. Lucia');
const alle24 = kalenderLuker(2026, 'alle', [{ navn: 'St. Lucia', dag: '12-13' }]);
sjekk('24 luker', alle24.length, 24);
sjekk('luke 13 heter St. Lucia', alle24[12].tekst, 'St. Lucia');
sjekk('kalenderår før og etter jul', [kalenderAar('2026-10-11'), kalenderAar('2026-12-27')], [2026, 2027]);

// --- Huskelister: status, sum og tre
const lp = (id: string, ekstra: Partial<Punkt> = {}): Punkt => ({ id, listeId: 'l', forelderId: null, tekst: id, notat: '', status: 'ide', belop: null, dato: null, rekkefolge: 0, ...ekstra });
sjekk('neste status går rundt', [nesteStatus('gave', 'ide'), nesteStatus('gave', 'gitt')], ['kjopt', 'ide']);
sjekk('ukjent status regnes som første', erFerdig('sjekk', 'kjopt'), false);
sjekk('ferdigDato settes ved kjøp', medStatus(lp('a'), 'gave', 'kjopt', '2026-10-11').ferdigDato, '2026-10-11');
sjekk('ferdigDato beholdes ved gitt', medStatus(lp('a', { status: 'kjopt', ferdigDato: '2026-10-01' }), 'gave', 'gitt', '2026-12-24').ferdigDato, '2026-10-01');
sjekk('ferdigDato fjernes ved tilbake til idé', medStatus(lp('a', { status: 'kjopt', ferdigDato: '2026-10-01' }), 'gave', 'ide', '2026-10-11').ferdigDato, undefined);
sjekk('listesum: planlagt og kjøpt', listeSum('gave', [lp('a', { belop: 300 }), lp('b', { belop: 500, status: 'kjopt' }), lp('c', { belop: 200, status: 'gitt' }), lp('d')]),
  { planlagt: 300, brukt: 700, antallMedBelop: 3 });
const tre = lagTre([lp('barn', { forelderId: 'f', rekkefolge: 2 }), lp('f', { rekkefolge: 1 }), lp('foreldrelos', { forelderId: 'borte', rekkefolge: 3 })], 'sjekk');
sjekk('tre: underpunkt under forelder, foreldreløse på toppnivå', tre.map((t) => [t.punkt.id, t.barn.map((b) => b.id)]), [['f', ['barn']], ['foreldrelos', []]]);
// Pakkeliste: man krysser av tingene, ikke overskriften «Klær»
const klaer = lp('klaer', { status: 'apen' });
const ting = [lp('sokk', { forelderId: 'klaer', status: 'ferdig' }), lp('lue', { forelderId: 'klaer', status: 'ferdig' })];
sjekk('hovedpunkt gjort når alle underpunktene er gjort', erGjort('sjekk', klaer, ting), true);
sjekk('hovedpunkt ikke gjort når ett underpunkt mangler', erGjort('sjekk', klaer, [ting[0], { ...ting[1], status: 'apen' }]), false);
sjekk('punkt uten underpunkter følger egen status', erGjort('sjekk', klaer, []), false);
sjekk('fremdrift teller ikke overskrifter', fremdrift('sjekk', [klaer, ...ting, lp('mat', { status: 'apen' })]), { ferdig: 2, totalt: 3 });
// Dra og slipp: gjenbruker rekkefølgetallene, bare flyttede lagres
const r = [lp('a', { rekkefolge: 2 }), lp('b', { rekkefolge: 5 }), lp('c', { rekkefolge: 9 })];
sjekk('flytt c øverst', nyRekkefolge(r, ['c', 'a', 'b']).map((p) => [p.id, p.rekkefolge]), [['c', 2], ['a', 5], ['b', 9]]);
sjekk('uendret rekkefølge lagrer ingenting', nyRekkefolge(r, ['a', 'b', 'c']).length, 0);
sjekk('like tall gjøres unike', nyRekkefolge([lp('x', { rekkefolge: 1 }), lp('y', { rekkefolge: 1 })], ['y', 'x']).map((p) => p.id), ['x']);
sjekk('ett steg opp', flyttEtSteg(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
sjekk('ikke forbi toppen', flyttEtSteg(['a', 'b'], 'a', -1), ['a', 'b']);

// Deling: bare det som ikke er kjøpt, med pris, notat, lenke og underpunkter
const onsker = [
  lp('sofa', { tekst: 'Ny sofa', status: 'onske', belop: 14000, lenke: 'https://example.com/sofa', rekkefolge: 1 }),
  lp('kjopt', { tekst: 'Utemøbler', status: 'kjopt', belop: 9000, rekkefolge: 2 }),
  lp('strikk', { tekst: 'Strikk', status: 'onske', rekkefolge: 3 }),
  lp('genser', { tekst: 'Genser', status: 'onske', forelderId: 'strikk', notat: 'Str. M', rekkefolge: 4 }),
];
sjekk('deling: kjøpte er ikke med', punkterForDeling('onske', onsker).map((p) => p.id), ['sofa', 'strikk', 'genser']);
sjekk('delingstekst', delingsTekst({ navn: 'Ønsker', ikon: 'hus', type: 'onske' }, onsker).replace(/ /g, ' '),
  'Ønsker\n\n• Ny sofa – 14 000 kr\n  https://example.com/sofa\n• Strikk\n   – Genser\n     Str. M');
sjekk('delingstekst tom liste', delingsTekst({ navn: 'Tom', ikon: '', type: 'sjekk' }, []), 'Tom\n\n(Ingenting på listen akkurat nå)');
sjekk('hurtig gave med mottaker', tolkHurtig('gave', 'Mamma: skjerf'), { mottaker: 'Mamma', tekst: 'skjerf' });
sjekk('hurtig uten kolon i andre lister', tolkHurtig('sjekk', ' Kjøpe melk: lett '), { tekst: 'Kjøpe melk: lett' });

// --- Maler, kopi og nullstilling
const hytte = punkterFraMal(MALER.find((m) => m.id === 'pakke-hytte')!, 'ny');
sjekk('mal: grupper med underpunkter', [hytte.filter((p) => !p.forelderId).length, hytte.filter((p) => p.forelderId).length], [4, 16]);
const listeKopi = kopierPunkter([lp('f', { status: 'ferdig' }), lp('b', { forelderId: 'f', status: 'ferdig' })], 'ny', 'sjekk');
sjekk('kopi: nye id-er, forelder pekes om, status nullstilt', [listeKopi[0].id !== 'f', listeKopi[1].forelderId === listeKopi[0].id, listeKopi.every((p) => p.status === 'apen' && p.listeId === 'ny')], [true, true, true]);
sjekk('nullstill: bare endrede', nullstill([lp('a', { status: 'apen' }), lp('b', { status: 'ferdig', ferdigDato: '2026-01-01' })], 'sjekk').map((p) => [p.id, p.status, p.ferdigDato ?? null]), [['b', 'apen', null]]);

// --- Huskelapp, hage og gavehistorikk (demodata regnet fra en fast dag)
const dl = demoLister('2026-10-11');
const lapp = huskelapp(dl.lister, dl.punkter, '2026-10-11');
sjekk('huskelapp: forfalt først, ferdige og kalender ikke med', lapp.map((h) => [h.punkt.tekst, h.dager]), [['Fornye pass til barna', -2], ['Bestille EU-kontroll', 3], ['Utelys ved garasjen', 5]]);
const hageOkt = hageIMaaned(dl.lister, dl.punkter, '2026-10-11');
sjekk('hage i oktober', hageOkt.map((h) => `${h.forelder?.tekst}: ${h.punkt.tekst}`), ['Epletre: Høste epler', 'Plen: Rake løv']);
const stelt = dl.punkter.map((p) => (p.tekst === 'Rake løv' ? { ...p, sistGjort: '2026-10-02' } : p));
sjekk('hage: gjort denne måneden sorteres sist', hageIMaaned(dl.lister, stelt, '2026-10-11').map((h) => [h.punkt.tekst, h.gjort]), [['Høste epler', false], ['Rake løv', true]]);
sjekk('hage: gjort i fjor teller ikke', hageIMaaned(dl.lister, dl.punkter.map((p) => ({ ...p, sistGjort: '2025-10-02' })), '2026-10-11').every((h) => !h.gjort), true);
// Demodataene har også Karis private lister – lager.hentLister filtrerer dem bort for Ola
const hist = gavehistorikk(dl.lister, dl.punkter);
sjekk('gavehistorikk per mottaker', hist.map((m) => [m.navn, m.gaver.map((g) => `${g.aar} ${g.punkt.tekst}`)]), [['Bestemor', ['2026 Pledd']], ['Mamma', ['2026 Skjerf', '2025 Lysestake']], ['Pappa', ['2025 Termokopp']]]);
sjekk('tidligere gaver, uten store/små bokstaver', tidligereGaver(hist, ' mamma ').map((g) => g.punkt.tekst), ['Skjerf', 'Lysestake']);

// --- Gaveår: datoer for anledninger
sjekk('morsdag 2026 (2. søndag i februar)', andreSondag(2026, 2), '2026-02-08');
sjekk('morsdag 2027', andreSondag(2027, 2), '2027-02-14');
sjekk('farsdag 2026 (2. søndag i november)', andreSondag(2026, 11), '2026-11-08');
sjekk('jul', anledningsDato({ id: 'j', type: 'jul' }, 2026), '2026-12-24');
sjekk('bursdag uten dato', anledningsDato({ id: 'b', type: 'bursdag' }, 2026), null);
sjekk('engangsanledning bare sitt år', [anledningsDato({ id: 'k', type: 'egen', dag: '05-09', aar: 2027 }, 2026), anledningsDato({ id: 'k', type: 'egen', dag: '05-09', aar: 2027 }, 2027)], [null, '2027-05-09']);

// --- Gaveår: tidslinje, varsler og juleplan (demodata regnet fra 11. oktober 2026)
const ga = demoLister('2026-10-11');
const tidslinje = forekomster(ga.lister, ga.punkter, '2026-10-11');
sjekk('årshjul: første anledninger', tidslinje.slice(0, 3).map((f) => `${f.anledning.type} ${f.mottaker.tekst} ${f.dato}`),
  ['bursdag Mamma 2026-10-29', 'farsdag Pappa 2026-11-08', 'jul Bestemor 2026-12-24']);
sjekk('årshjul: konfirmasjon neste år er med', tidslinje.some((f) => f.anledning.navn === 'Konfirmasjon' && f.dato === '2027-05-09'), true);
sjekk('varsel 3 uker før når ingenting er kjøpt', gaveVarsler(ga.lister, ga.punkter, '2026-10-11').map((f) => `${f.mottaker.tekst} ${f.dager}`), ['Mamma 18']);
const kjoptTilMamma = ga.punkter.map((p) => (p.tekst === 'Strikkebok' ? { ...p, status: 'kjopt', anledning: 'a-m-b:2026' } : p));
sjekk('ingen varsel når gaven er kjøpt', gaveVarsler(ga.lister, kjoptTilMamma, '2026-10-11').length, 0);
const jul = anledningsPlan(ga.lister, ga.punkter, 'jul', 2026);
sjekk('juleplan: felles og private mottakere', jul.map((p) => p.navn), ['Bestemor', 'Lena', 'Mamma', 'Ola', 'Pappa']);
sjekk('juleplan: valgt gave og ideer', [jul[0].deler[0].gaver.map((g) => g.tekst), jul[0].deler[0].ideer.map((g) => g.tekst)], [['Pledd'], ['Puslespill']]);
sjekk('potter: felles gave betalt av Kari teller på Kari', potter(jul, 'kari'), [{ id: 'kari', planlagt: 0, brukt: 700, antall: 1 }]);
const fellesGa = ga.lister.find((l) => l.navn === 'Gaveår')!;
sjekk('personbudsjett jul, felles', personbudsjett(jul, fellesGa.id), 800 + 400 + 600 + 600);

// --- Gaveår: alder, bursdager og «andre»
sjekk('alder før og på bursdagen', [alder('1956-10-29', '2026-10-28'), alder('1956-10-29', '2026-10-29')], [69, 70]);
sjekk('alder uten fødselsdato', alder(undefined, '2026-10-29'), undefined);
sjekk('runde dager', [rundDag(70), rundDag(71), rundDag(0), rundDag(undefined)], [true, false, false, false]);
sjekk('gamle lenker til morsdag/farsdag går til «andre»', [tilPlanType('morsdag'), tilPlanType('jul'), tilPlanType(undefined)], ['andre', 'jul', 'jul']);
const bursdager = anledningsPlan(ga.lister, ga.punkter, 'bursdag', 2026);
sjekk('bursdager sortert på dato, med alder', bursdager.map((p) => `${p.dato} ${p.navn} ${p.alder ?? '-'}`),
  ['2026-02-20 Ola 41', '2026-03-14 Bestemor 85', '2026-06-02 Pappa 72', '2026-10-29 Mamma 70']);
sjekk('andre: alt unntatt jul og bursdag', anledningsPlan(ga.lister, ga.punkter, 'andre', 2027).map((p) => `${p.tittel} ${p.navn}`),
  ['Morsdag Mamma', 'Konfirmasjon Lena', 'Farsdag Pappa']);
sjekk('årshjul: alder på bursdag', tidslinje.find((f) => f.anledning.type === 'bursdag')!.alder, 70);
// Kjøpt fra idébanken uten anledning → kobles til neste anledning (Mammas bursdag 29. okt.)
const mammaGa = ga.punkter.find((p) => p.tekst === 'Mamma' && p.listeId === fellesGa.id)!;
const strikkebok = ga.punkter.find((p) => p.tekst === 'Strikkebok')!;
sjekk('kjøpt idé får neste anledning', medAutoAnledning({ ...strikkebok, status: 'kjopt' }, mammaGa, '2026-10-11').anledning, 'a-m-b:2026');
sjekk('idé uten kjøp forblir i idébanken', medAutoAnledning(strikkebok, mammaGa, '2026-10-11').anledning, undefined);
sjekk('valgt anledning endres ikke', medAutoAnledning({ ...strikkebok, status: 'kjopt', anledning: 'a-m-j:2026' }, mammaGa, '2026-10-11').anledning, 'a-m-j:2026');

// --- Varsler
sjekk('varseltrinn: 18 dager igjen, [21, 0]', varseltrinn(18, [21, 0]), { trinn: 21, alle: [21] });
sjekk('varseltrinn: samme dag', varseltrinn(0, [21, 0]), { trinn: 0, alle: [0, 21] });
sjekk('varseltrinn: for tidlig', varseltrinn(25, [21]), null);
sjekk('varseltrinn: passert', varseltrinn(-1, [0]), null);
const vInn = structuredClone(STANDARD_VARSLER);
const v11 = beregnVarsler(ga.lister, ga.punkter, vInn, '2026-10-11');
sjekk('varsler 11. okt: Mammas bursdag og frist om 3 dager', v11.map((v) => v.tittel),
  ['Mamma har bursdag (fyller 70) om 18 dager', 'Om 3 dager: Bestille EU-kontroll']);
sjekk('bursdagsvarsel: tekst og nøkkel', [v11[0].tekst, v11[0].nokkel],
  ['tor. 29. okt.: ingen gave kjøpt ennå – 2 ideer i idébanken.', `bursdag:${mammaGa.id}:a-m-b:2026-10-29:21`]);
const medGave = ga.punkter.map((p) => (p.tekst === 'Strikkebok' ? { ...p, status: 'kjopt', anledning: 'a-m-b:2026' } : p));
sjekk('kjøpt gave: ingen tidlig varsel', beregnVarsler(ga.lister, medGave, vInn, '2026-10-11').some((v) => v.type === 'bursdag'), false);
sjekk('kjøpt gave: varsel på dagen med gaven', beregnVarsler(ga.lister, medGave, vInn, '2026-10-29').find((v) => v.type === 'bursdag')?.tekst, 'Gave: Strikkebok');
const v1203 = beregnVarsler(ga.lister, ga.punkter, vInn, '2026-12-03');
sjekk('julevarsel 3 uker før', v1203.filter((v) => v.type === 'jul').map((v) => [v.tittel, v.tekst]), [['Jul om 21 dager', 'Gave kjøpt til 1 av 5.']]);
sjekk('hage den 1. i måneden', beregnVarsler(ga.lister, ga.punkter, vInn, '2026-10-01').filter((v) => v.type === 'hage').map((v) => v.tekst), ['Epletre: høste epler, Plen: rake løv']);
const medKalender = structuredClone(vInn); medKalender.typer.kalender.pa = true;
sjekk('kalenderluke samme dag', beregnVarsler(ga.lister, ga.punkter, medKalender, '2026-11-29').filter((v) => v.type === 'kalender').map((v) => v.tittel), ['Luke i dag: 1. søndag i advent']);
const avslaatt = structuredClone(vInn); for (const k of Object.keys(avslaatt.typer) as (keyof typeof avslaatt.typer)[]) avslaatt.typer[k].pa = false;
sjekk('alt avslått gir ingen varsler', beregnVarsler(ga.lister, ga.punkter, avslaatt, '2026-10-11').length, 0);
sjekk('mange varsler slås sammen', slaaSammen(Array.from({ length: 5 }, (_, i) => ({ type: 'frist' as const, nokkel: `k${i}`, nokler: [`k${i}`], tittel: `T${i}`, tekst: '', url: '' })))
  .map((x) => [x.tittel, x.nokler.length]), [['5 påminnelser i dag', 5]]);

// Skjul detaljer: ingenting om hva varselet gjelder, men samme lenke og nøkler
const skjult = utenDetaljer([{ tittel: 'Mamma har bursdag i dag', tekst: 'Gave: skjerf', url: '#/lister/x', nokler: ['a'] }, { tittel: 'Tannlege kl. 10:00', tekst: 'Oslo', url: '#/kalender', nokler: ['b'] }], ['bursdag', 'avtaleFor']);
sjekk('skjul detaljer: ingen navn eller gaver', skjult.some((m) => /Mamma|skjerf|Tannlege|Oslo/.test(m.tittel + m.tekst)), false);
sjekk('skjul detaljer: samme lenke og nøkler', skjult.map((m) => [m.url, m.nokler[0]]), [['#/lister/x', 'a'], ['#/kalender', 'b']]);
sjekk('skjul detaljer: avtale har egen tekst', skjult[1].tekst.includes('avtale'), true);

// Listeikoner: gamle emojier blir SVG-ikoner
sjekk('listeikon fra emoji', ['🎁', '🕯️', '🕯', '🏔️', '⚡', 'gave', '', undefined, '🦄'].map((e) => listeIkon(e)), ['gave', 'lys', 'lys', 'fjell', 'lyn', 'gave', 'liste', 'liste', 'liste']);
sjekk('ingen emojier i maler og listetyper', /\p{Extended_Pictographic}/u.test(JSON.stringify([MALER, LISTETYPER])), false);

sjekk('norsk tid om sommeren (UTC+2)', norskTid(new Date('2026-10-11T22:30:00Z')), { dato: '2026-10-12', time: 0, minutt: 30 });
sjekk('norsk tid om vinteren (UTC+1)', norskTid(new Date('2026-12-01T07:00:00Z')), { dato: '2026-12-01', time: 8, minutt: 480 });

// --- Kalender: gjentakelser og unntak (eksempel: henting i barnehagen hver hverdag)
const henting: Hendelse = { id: 'h1', tittel: 'Henting barnehagen', kategori: 'barnehage', dato: '2026-10-12', fra: '16:00', til: '16:30',
  gjentak: { frekvens: 'uke', intervall: 1, ukedager: [1, 2, 3, 4, 5] }, hvem: ['barn'], ansvarlig: 'terje' };
const brukEndring = (alle: Hendelse[], e: { lagre: Hendelse[]; slett: string[] }) =>
  [...alle.filter((h) => !e.slett.includes(h.id) && !e.lagre.some((l) => l.id === h.id)), ...e.lagre];
const uke = (alle: Hendelse[]) => kalForekomster(alle, '2026-10-12', '2026-10-18').map((f) => `${f.dato.slice(8)} ${f.hendelse.fra} ${f.hendelse.ansvarlig}`);
sjekk('hverdager: 5 ganger i uka', uke([henting]), ['12 16:00 terje', '13 16:00 terje', '14 16:00 terje', '15 16:00 terje', '16 16:00 terje']);
sjekk('gjentakstekst: hverdager', gjentakTekst(henting.gjentak, henting.dato), 'Hverdager');
const torsdag = () => kalForekomster(medIngrid, '2026-10-15', '2026-10-15')[0];
const forTorsdag = kalForekomster([henting], '2026-10-15', '2026-10-15')[0];
const medIngrid = brukEndring([henting], endreForekomst([henting], forTorsdag, { ...henting, dato: '2026-10-15', ansvarlig: 'ingrid' }, 'denne'));
sjekk('bare torsdag: Ingrid henter', uke(medIngrid).map((x) => x.split(' ')[2]), ['terje', 'terje', 'terje', 'ingrid', 'terje']);
sjekk('unntaket er knyttet til serien', [torsdag().unntak?.serieId, torsdag().originalDato], ['h1', '2026-10-15']);
const onsdag = kalForekomster(medIngrid, '2026-10-14', '2026-10-14')[0];
const fraOnsdag = brukEndring(medIngrid, endreForekomst(medIngrid, onsdag, { ...henting, dato: '2026-10-14', fra: '15:00' }, 'fremover'));
sjekk('fremover fra onsdag: ny tid, Ingrid beholder torsdag', uke(fraOnsdag), ['12 16:00 terje', '13 16:00 terje', '14 15:00 terje', '15 16:00 ingrid', '16 15:00 terje']);
const fredag = kalForekomster(medIngrid, '2026-10-16', '2026-10-16')[0];
sjekk('avlys bare fredag', uke(brukEndring(medIngrid, slettForekomst(medIngrid, fredag, 'denne'))).length, 4);
sjekk('slett fra onsdag og fremover', uke(brukEndring(medIngrid, slettForekomst(medIngrid, onsdag, 'fremover'))).map((x) => x.slice(0, 2)), ['12', '13']);
sjekk('slett hele serien fjerner også unntak', brukEndring(medIngrid, slettForekomst(medIngrid, onsdag, 'alle')).length, 0);
const alleKl15 = brukEndring(medIngrid, endreForekomst(medIngrid, onsdag, { ...henting, dato: '2026-10-14', fra: '15:00' }, 'alle'));
sjekk('hele serien ny tid, samme mønster beholder unntak', [uke(alleKl15)[0], uke(alleKl15)[3]], ['12 15:00 terje', '15 16:00 ingrid']);
const trening: Hendelse = { id: 't', tittel: 'Fotball', kategori: 'trening', dato: '2026-10-15', fra: '18:00', gjentak: { frekvens: 'uke', intervall: 2 }, hvem: [] };
sjekk('annenhver torsdag', kalForekomster([trening], '2026-10-01', '2026-11-30').map((f) => f.dato), ['2026-10-15', '2026-10-29', '2026-11-12', '2026-11-26']);
sjekk('gjentakstekst: annenhver uke', gjentakTekst(trening.gjentak, trening.dato), 'Hver 2. uke: tor');
const maaned31: Hendelse = { id: 'm', tittel: 'Regning', kategori: 'annet', dato: '2026-01-31', gjentak: { frekvens: 'maaned', intervall: 1 }, hvem: [] };
sjekk('månedlig den 31. hopper over korte måneder', kalForekomster([maaned31], '2026-01-01', '2026-05-31').map((f) => f.dato), ['2026-01-31', '2026-03-31', '2026-05-31']);
const flyttet = brukEndring([henting], endreForekomst([henting], forTorsdag, { ...henting, dato: '2026-10-17', fra: '10:00' }, 'denne'));
sjekk('flyttet forekomst vises på ny dato', kalForekomster(flyttet, '2026-10-12', '2026-10-18').map((f) => f.dato.slice(8)), ['12', '13', '14', '16', '17']);
sjekk('sammenligning av mønster uavhengig av rekkefølge', sammeMonster({ ukedager: [5, 1], intervall: 1, frekvens: 'uke' }, { frekvens: 'uke', intervall: 1, ukedager: [1, 5] }, '2026-10-12'), true);
const poster = kalenderPoster([henting], ga.lister, ga.punkter, '2026-10-26', '2026-11-01');
sjekk('kalender viser bursdag fra gaveåret med alder', poster.filter((p) => p.kilde === 'anledning').map((p) => `${p.dato} ${p.tittel}`), ['2026-10-29 Mamma har bursdag (70 år)']);

const endringOnsdag = endreForekomst(medIngrid, onsdag, { ...henting, dato: '2026-10-14', fra: '15:00' }, 'fremover');
sjekk('angre «denne og fremover» gir samme uke som før', uke(brukEndring(brukEndring(medIngrid, endringOnsdag), angreEndring(medIngrid, endringOnsdag))), uke(medIngrid));
const slettAlle = slettForekomst(medIngrid, onsdag, 'alle');
sjekk('angre sletting av hele serien', uke(brukEndring(brukEndring(medIngrid, slettAlle), angreEndring(medIngrid, slettAlle))), uke(medIngrid));

// --- Kalenderabonnement (ICS)
const ics = lagIcs(kalenderPoster(medIngrid, ga.lister, ga.punkter, '2026-10-15', '2026-10-15', { anledninger: false, frister: false }),
  (id) => ({ terje: 'Terje', ingrid: 'Ingrid', barn: 'Emma' } as Record<string, string>)[id], new Date('2026-10-14T10:00:00Z'));
sjekk('ics: torsdag med Ingrid som henter', ['SUMMARY:Henting barnehagen (Ingrid)', 'DTSTART;TZID=Europe/Oslo:20261015T160000', 'DTEND;TZID=Europe/Oslo:20261015T163000', 'DESCRIPTION:Gjelder: Emma\\nHenter/leverer: Ingrid'].every((l) => ics.includes(l)), true);
sjekk('ics: CRLF og tidssone', [ics.includes('\r\nBEGIN:VTIMEZONE\r\n'), ics.endsWith('END:VCALENDAR\r\n')], [true, true]);
sjekk('ics: tekst beskyttes', icsTekst('Middag; vin, ost\nkl. 19'), 'Middag\\; vin\\, ost\\nkl. 19');
sjekk('ics: lange linjer brettes på 75 byte', brett('SUMMARY:' + 'æ'.repeat(60)).split('\r\n').map((l) => new TextEncoder().encode(l).length <= 75), [true, true]);
const heldag = lagIcs([{ nokkel: 'a|1', dato: '2026-10-29', tittel: 'Mamma har bursdag', farge: 0, hvem: [], kilde: 'anledning' }], () => undefined);
sjekk('ics: hele dagen', ['DTSTART;VALUE=DATE:20261029', 'DTEND;VALUE=DATE:20261030'].every((l) => heldag.includes(l)), true);

// --- Varsler for avtaler
const navnKal = (id: string) => ({ terje: 'Terje', ingrid: 'Ingrid', barn: 'Emma' } as Record<string, string>)[id];
const medVarsel = medIngrid.map((h) => (h.id === 'h1' || h.serieId === 'h1' ? { ...h, varselMin: 30 } : h));
const morgen = beregnVarsler([], [], vInn, '2026-10-15', { hendelser: medIngrid, navn: navnKal });
sjekk('morgenoversikt i dag', morgen.filter((v) => v.type === 'avtaler').map((v) => [v.tittel, v.tekst]), [['I dag: 1 avtale', '16:00 Henting barnehagen – Ingrid']]);
const gamle = { time: 7, bareUtenGave: true, typer: { ...vInn.typer } } as VarselInnstillinger;
delete (gamle.typer as Partial<VarselInnstillinger['typer']>).avtaler;
sjekk('gamle innstillinger uten avtaler fylles ut', medStandard(gamle).typer.avtaler, STANDARD_VARSLER.typer.avtaler);
const voksne = new Set(['terje', 'ingrid']);
const kl = (t: string) => ({ dato: '2026-10-15', minutt: Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) });
sjekk('varsel 30 min før til den som henter', forVarsler(medVarsel, kl('15:30'), { hendelser: medVarsel, navn: navnKal, personId: 'ingrid', voksne }).map((v) => [v.tittel, v.tekst]),
  [['Henting barnehagen kl. 16:00', 'Det er du som henter/leverer']]);
sjekk('ikke til den som ikke henter', forVarsler(medVarsel, kl('15:30'), { hendelser: medVarsel, navn: navnKal, personId: 'terje', voksne }).length, 0);
sjekk('bare innenfor kvarteret', [kl('15:14'), kl('15:44')].map((k) => forVarsler(medVarsel, k, { hendelser: medVarsel, navn: navnKal, personId: 'ingrid', voksne }).length), [0, 1]);

// --- Flytte gamle gavelister inn i gaveåret
const mittGa = ga.lister.find((l) => l.navn === 'Mitt gaveår')!;
const flytt = flyttGavelister(ga.lister, ga.punkter, { felles: fellesGa, privat: mittGa });
sjekk('flytting: lister og gaver', [flytt.flyttet.map((l) => l.navn), flytt.gaver.length], [['Gaver jul 2025', 'Gaver jul 2026'], 5]);
sjekk('flytting: nye mottakere (Ola finnes fra før)', flytt.mottakere.map((m) => m.tekst).sort(), ['Mamma', 'Pappa']);
const olaId = ga.punkter.find((p) => p.tekst === 'Ola' && p.listeId === mittGa.id)!.id;
sjekk('flytting: gave til eksisterende mottaker', flytt.gaver.find((g) => g.tekst === 'Konsertbilletter')!.forelderId, olaId);
const lysestake = flytt.gaver.find((g) => g.tekst === 'Lysestake')!;
const nyMamma = flytt.mottakere.find((m) => m.tekst === 'Mamma')!;
sjekk('flytting: jul fra listenavnet med riktig år', [lysestake.anledning === `${nyMamma.anledninger![0].id}:2025`, lysestake.status, lysestake.listeId], [true, 'gitt', mittGa.id]);

console.log(`\n${ok} ok, ${feil} feil`);
if (feil) process.exit(1);
