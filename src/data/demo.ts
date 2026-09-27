// OPPDIKTEDE demodata for lokal kjøring. Ingen ekte tall her – repoet kan være offentlig.
import type { FellesDok, PrivatDok, Post, Revisjon } from './modell';
import { foreslaOverforinger, kopierRevisjon } from '../logikk/beregning';

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
      p('p-mat', 'Mat og husholdning', 9000, 'mat', 'k-bruk'),
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
        p(`pp2-${eierId}`, 'Bil – drivstoff og bom', 1800, 'transport', minKonto),
        p(`pp3-${eierId}`, 'Mobil', 399, 'abonnement', minKonto),
        p(`pp4-${eierId}`, 'Musikk', 139, 'abonnement', minKonto),
        p(`pp5-${eierId}`, 'Klær og frisør', 1200, 'personlig', minKonto),
        p(`pp6-${eierId}`, 'Fond', 2500, 'sparing', fond, 'sparing'),
      ],
    }],
  };
}
