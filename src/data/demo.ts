// OPPDIKTEDE demodata for lokal kjøring. Ingen ekte tall her – repoet kan være offentlig.
import type { FellesDok, PrivatDok, Post, Revisjon, Saldo, Utgift } from './modell';
import { foreslaOverforinger, iDag, kopierRevisjon } from '../logikk/beregning';
import { flyttMaaned, kontoPlan, maanedAv, revisjonForMaaned } from '../logikk/oppfolging';

const p = (id: string, navn: string, belop: number, kategoriId: string, kontoId: string, type: Post['type'] = 'utgift', frekvens: Post['frekvens'] = 'mnd'): Post =>
  ({ id, navn, belop, frekvens, type, kategoriId, kontoId });

export function demoFelles(): FellesDok {
  const vaar: Revisjon = {
    id: 'rev-1', navn: 'Budsjett januar 2026', gjelderFra: '2026-01-01', notat: 'Første versjon.',
    andeler: { kari: 40, ola: 60 }, avrundingSteg: 500,
    inntekter: [
      { id: 'i-kari', navn: 'Lønn Kari', personId: 'kari', belop: 44000, frekvens: 'mnd', tilKontoId: 'k-kari' },
      { id: 'i-ola', navn: 'Lønn Ola', personId: 'ola', belop: 61000, frekvens: 'mnd', tilKontoId: 'k-ola' },
      { id: 'i-bt', navn: 'Barnetrygd', personId: null, belop: 1968, frekvens: 'mnd', tilKontoId: 'k-barn' },
    ],
    poster: [
      p('p-renter', 'Boliglån renter', 21000, 'bolig', 'k-laan'),
      p('p-avdrag', 'Boliglån avdrag', 8000, 'bolig', 'k-laan', 'sparing'),
      p('p-strom', 'Strøm', 2200, 'bolig', 'k-regning'),
      p('p-komm', 'Kommunale avgifter', 5400, 'bolig', 'k-regning', 'utgift', 'kvartal'),
      p('p-nett', 'Internett', 699, 'abonnement', 'k-regning'),
      p('p-strm', 'Strømmetjenester', 329, 'abonnement', 'k-regning'),
      p('p-hus', 'Hus- og bilforsikring', 26400, 'forsikring', 'k-regning', 'utgift', 'aar'),
      p('p-pers', 'Personforsikringer', 460, 'forsikring', 'k-regning'),
      p('p-barnf', 'Barneforsikring', 250, 'forsikring', 'k-regning'),
      p('p-bhg', 'Barnehage', 1500, 'barn', 'k-regning'),
      { ...p('p-mat', 'Mat og husholdning', 9000, 'mat', 'k-bruk'), folgOpp: true },
      p('p-buffer', 'Sparing hus/buffer', 1000, 'sparing', 'k-hus', 'sparing'),
      p('p-ferie', 'Sparing ferie', 1000, 'sparing', 'k-ferie', 'sparing'),
      p('p-bt', 'Barnetrygd spares', 1968, 'barn', 'k-barn', 'sparing'),
    ],
    overforinger: [],
  };
  const host = kopierRevisjon(vaar, 'Budsjett juli 2026', '2026-07-01');
  host.notat = 'Renten opp, mer til mat, ferie redusert.';
  host.poster = host.poster.map((x) =>
    x.id === 'p-renter' ? { ...x, belop: 22500 } : x.id === 'p-mat' ? { ...x, belop: 9500 } : x.id === 'p-ferie' ? { ...x, belop: 500 } : x,
  ).filter((x) => x.id !== 'p-strm');
  host.poster.push(p('p-sfo', 'SFO', 2800, 'barn', 'k-regning'));

  const dok: FellesDok = {
    skjema: 1,
    personer: [
      { id: 'kari', navn: 'Kari', epost: 'kari@example.com' },
      { id: 'ola', navn: 'Ola', epost: 'ola@example.com' },
    ],
    banker: [{ id: 'b-fjell', navn: 'Fjellbanken' }, { id: 'b-kyst', navn: 'Kystbanken' }],
    kontoer: [
      { id: 'k-kari', navn: 'Lønnskonto Kari', bankId: 'b-kyst', kontonr: '1234 xx xx101', rolle: 'avsender', eierId: 'kari' },
      { id: 'k-ola', navn: 'Lønnskonto Ola', bankId: 'b-fjell', kontonr: '9876 xx xx202', rolle: 'avsender', eierId: 'ola' },
      { id: 'k-laan', navn: 'Felles lånetrekk', bankId: 'b-kyst', kontonr: '1234 xx xx303', rolle: 'felles', eierId: null },
      { id: 'k-regning', navn: 'Felles regning', bankId: 'b-fjell', kontonr: '9876 xx xx404', rolle: 'felles', eierId: null },
      { id: 'k-bruk', navn: 'Felles bruk', bankId: 'b-fjell', kontonr: '9876 xx xx505', rolle: 'felles', eierId: null },
      { id: 'k-hus', navn: 'Felles hus/buffer', bankId: 'b-fjell', kontonr: '9876 xx xx606', rolle: 'sparing', eierId: null,
        sparemaal: { maal: 50000, saldo: 12400, saldoDato: '2026-07-01', rente: 1.0 } },
      { id: 'k-ferie', navn: 'Feriekonto', bankId: 'b-fjell', kontonr: '9876 xx xx707', rolle: 'sparing', eierId: null,
        sparemaal: { maal: 40000, saldo: 26800, saldoDato: '2026-07-01', rente: 3.8 } },
      { id: 'k-barn', navn: 'Barnesparing', bankId: 'b-kyst', kontonr: '1234 xx xx808', rolle: 'sparing', eierId: null,
        sparemaal: { maal: 100000, saldo: 64200, saldoDato: '2026-07-01', rente: 4.25 } },
    ],
    kategorier: [
      { id: 'bolig', navn: 'Bolig', farge: 0 },
      { id: 'forsikring', navn: 'Forsikring', farge: 1 },
      { id: 'mat', navn: 'Mat og husholdning', farge: 2 },
      { id: 'barn', navn: 'Barn', farge: 3 },
      { id: 'abonnement', navn: 'Abonnementer', farge: 4 },
      { id: 'sparing', navn: 'Sparing', farge: 5 },
      { id: 'transport', navn: 'Transport', farge: 6 },
      { id: 'personlig', navn: 'Personlig', farge: 7 },
    ],
    revisjoner: [vaar, host],
  };
  for (const r of dok.revisjoner) r.overforinger = foreslaOverforinger(dok, r);
  return dok;
}

export function demoPrivat(eierId: string): PrivatDok {
  const minKonto = eierId === 'kari' ? 'k-kari' : 'k-ola';
  const fond = `pk-fond-${eierId}`;
  return {
    skjema: 1,
    eierId,
    kontoer: [
      { id: fond, navn: 'Fondssparing', bankId: null, kontonr: '', rolle: 'sparing', eierId,
        sparemaal: { maal: 100000, saldo: 31000, saldoDato: '2026-07-01', rente: 0 } },
    ],
    revisjoner: [{
      id: `prev-${eierId}`, navn: 'Privat juli 2026', gjelderFra: '2026-07-01', notat: '',
      poster: [
        p(`pp1-${eierId}`, 'Månedskort', 900, 'transport', minKonto),
        { ...p(`pp2-${eierId}`, 'Bil – drivstoff og bom', 1800, 'transport', minKonto), folgOpp: true },
        p(`pp3-${eierId}`, 'Mobil', 399, 'abonnement', minKonto),
        p(`pp4-${eierId}`, 'Musikk', 139, 'abonnement', minKonto),
        { ...p(`pp5-${eierId}`, 'Klær og frisør', 1200, 'personlig', minKonto), folgOpp: true },
        p(`pp6-${eierId}`, 'Fond', 2500, 'sparing', fond, 'sparing'),
      ],
    }],
  };
}

type Rad<T> = T & { eier: string | null };

/**
 * Oppdiktede utgifter og saldoer for forrige og inneværende måned, slik at Oppfølging
 * har noe å vise i demomodus. Forrige måned: mat 300 kr over budsjett og 420 kr ikke ført.
 */
export function demoOppfolging(idag = iDag()): { utgifter: Rad<Utgift>[]; saldoer: Rad<Saldo>[] } {
  const felles = demoFelles();
  const naa = maanedAv(idag);
  const forrige = flyttMaaned(naa, -1);
  const dag = Number(idag.slice(8, 10));
  const utgifter: Rad<Utgift>[] = [];
  let n = 0;
  const ut = (maaned: string, d: number, belop: number, kategoriId: string, kontoId: string, notat: string, fortAv: string, privat = false) =>
    utgifter.push({ id: `demo-u${++n}`, dato: `${maaned}-${String(d).padStart(2, '0')}`, belop, kategoriId, kontoId, notat, privat, fortAv, eier: privat ? fortAv : null });

  // Mat: forrige måned 9 080 kr ført (budsjett 9 500)
  const handler = [1240, 860, 1510, 645, 1320, 980, 1105, 720, 700];
  handler.forEach((b, i) => ut(forrige, 2 + i * 3, b, 'mat', 'k-bruk', i % 3 === 0 ? 'Storhandel' : 'Butikk', i % 2 ? 'ola@example.com' : 'kari@example.com'));
  // Inneværende måned: handler frem til i dag, litt over tempo
  [1380, 945, 1620, 540, 1210, 890, 1450, 760].forEach((b, i) => {
    const d = 1 + i * 3;
    if (d <= dag) ut(naa, d, b, 'mat', 'k-bruk', i % 3 === 0 ? 'Storhandel' : 'Butikk', i % 2 ? 'ola@example.com' : 'kari@example.com');
  });
  // Private: drivstoff og klær for begge
  for (const [epost, konto] of [['kari@example.com', 'k-kari'], ['ola@example.com', 'k-ola']]) {
    ut(forrige, 6, 820, 'transport', konto, 'Drivstoff', epost, true);
    ut(forrige, 19, 760, 'transport', konto, 'Drivstoff + bom', epost, true);
    ut(forrige, 12, 1450, 'personlig', konto, 'Jakke', epost, true);
    if (dag >= 4) ut(naa, 4, 690, 'transport', konto, 'Drivstoff', epost, true);
    if (dag >= 9) ut(naa, 9, 350, 'personlig', konto, 'Frisør', epost, true);
  }

  // Saldoer på felleskontoene: to måneder tilbake + forrige måned, i tråd med budsjettet
  const saldoer: Rad<Saldo>[] = [];
  const toTilbake = flyttMaaned(naa, -2);
  const rev = revisjonForMaaned(felles.revisjoner, forrige)!;
  const avvik: Record<string, number> = { 'k-bruk': -300, 'k-regning': 120 };
  felles.kontoer.filter((k) => k.rolle !== 'avsender').forEach((k, i) => {
    const start = k.sparemaal ? k.sparemaal.saldo - 2000 : 1500 + i * 250;
    const plan = kontoPlan(k, felles, rev);
    const slutt = start + (plan.inn - plan.utFast - plan.utVariabel) + (avvik[k.id] ?? 0);
    saldoer.push({ id: `demo-s${k.id}-1`, kontoId: k.id, maaned: toTilbake, belop: start, privat: false, fortAv: 'kari@example.com', eier: null });
    saldoer.push({ id: `demo-s${k.id}-2`, kontoId: k.id, maaned: forrige, belop: Math.round(slutt), privat: false, fortAv: 'ola@example.com', eier: null });
  });
  return { utgifter, saldoer };
}
