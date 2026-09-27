// Ren beregningslogikk – ingen React, ingen lagring. Testes av scripts/test-beregning.ts.
import type {
  FellesDok, Frekvens, Id, Konto, Overforing, Person, Post, PrivatDok, PrivatRevisjon, Revisjon,
} from '../data/modell';
import { nyId } from '../data/modell';

const DELER: Record<Frekvens, number> = { mnd: 1, kvartal: 3, halvaar: 6, aar: 12 };

/** Omregner et beløp til månedsbeløp. */
export function tilMnd(belop: number, frekvens: Frekvens): number {
  return belop / DELER[frekvens];
}

/** Runder opp til nærmeste steg. Steg 0 eller mindre = ingen avrunding. */
export function avrundOpp(belop: number, steg: number): number {
  if (steg <= 0) return Math.ceil(belop);
  // Liten toleranse så 500.0000001 ikke blir 1000
  return Math.ceil(belop / steg - 1e-9) * steg;
}

export function sum<T>(liste: T[], f: (x: T) => number): number {
  let s = 0;
  for (const x of liste) s += f(x);
  return s;
}

/** Revisjonen som gjelder på datoen: nyeste med gjelderFra <= dato, ellers den eldste. */
export function aktivRevisjon<R extends { gjelderFra: string }>(revisjoner: R[], dato: string): R | undefined {
  const sortert = sorterRevisjoner(revisjoner);
  return sortert.find((r) => r.gjelderFra <= dato) ?? sortert[sortert.length - 1];
}

/** Nyeste først. */
export function sorterRevisjoner<R extends { gjelderFra: string }>(revisjoner: R[]): R[] {
  return [...revisjoner].sort((a, b) => b.gjelderFra.localeCompare(a.gjelderFra));
}

export function iDag(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Fellesbudsjettet
// ---------------------------------------------------------------------------

export interface KontoStatus {
  konto: Konto;
  /** Sum av postene som trekkes fra kontoen (per mnd) */
  behov: number;
  /** Inntekter som går direkte inn på kontoen (f.eks. barnetrygd) */
  inntektInn: number;
  /** Overføringer inn fra personene */
  overfortInn: number;
  /** Det som bør overføres, rundet opp */
  forslag: number;
  /** inntektInn + overfortInn - behov. Positiv = buffer, negativ = underdekning. */
  balanse: number;
}

export interface PersonStatus {
  person: Person;
  andel: number;
  inntekt: number;
  /** Hva personen skal bidra med totalt (andel av behovet, rundet opp) */
  maal: number;
  /** Hva som faktisk er satt opp som overføringer */
  overfort: number;
  /** overfort - maal */
  avvik: number;
  /** inntekt - overfort */
  igjen: number;
}

export interface FellesOppsummering {
  utgifter: number;
  sparing: number;
  total: number;
  inntekter: number;
  overfortTotalt: number;
  /** Sum av balansene – det som blir til overs på felleskontoene */
  buffer: number;
  kontoer: KontoStatus[];
  personer: PersonStatus[];
  kategorier: { kategoriId: Id; belop: number }[];
}

export function postMnd(p: Post): number {
  return tilMnd(p.belop, p.frekvens);
}

export function eierAvKonto(dok: FellesDok, kontoId: Id): Id | null {
  return dok.kontoer.find((k) => k.id === kontoId)?.eierId ?? null;
}

export function oppsummerFelles(dok: FellesDok, rev: Revisjon): FellesOppsummering {
  const utgifter = sum(rev.poster.filter((p) => p.type === 'utgift'), postMnd);
  const sparing = sum(rev.poster.filter((p) => p.type === 'sparing'), postMnd);
  const inntekter = sum(rev.inntekter, (i) => tilMnd(i.belop, i.frekvens));

  const kontoer: KontoStatus[] = dok.kontoer
    .filter((k) => k.rolle !== 'avsender')
    .map((konto) => {
      const behov = sum(rev.poster.filter((p) => p.kontoId === konto.id), postMnd);
      const inntektInn = sum(rev.inntekter.filter((i) => i.tilKontoId === konto.id), (i) => tilMnd(i.belop, i.frekvens));
      const overfortInn = sum(rev.overforinger.filter((o) => o.tilKontoId === konto.id), (o) => o.belop);
      const rest = Math.max(0, behov - inntektInn);
      return {
        konto, behov, inntektInn, overfortInn,
        forslag: rest > 0 ? avrundOpp(rest, rev.avrundingSteg) : 0,
        balanse: inntektInn + overfortInn - behov,
      };
    })
    .filter((s) => s.behov > 0 || s.inntektInn > 0 || s.overfortInn > 0 || s.konto.rolle === 'felles');

  const maalTotalt = sum(kontoer, (k) => k.forslag);
  const personer: PersonStatus[] = dok.personer.map((person) => {
    const andel = rev.andeler[person.id] ?? 0;
    const inntekt = sum(rev.inntekter.filter((i) => i.personId === person.id), (i) => tilMnd(i.belop, i.frekvens));
    const overfort = sum(
      rev.overforinger.filter((o) => eierAvKonto(dok, o.fraKontoId) === person.id),
      (o) => o.belop,
    );
    const maal = andel > 0 ? avrundOpp((maalTotalt * andel) / 100, rev.avrundingSteg) : 0;
    return { person, andel, inntekt, maal, overfort, avvik: overfort - maal, igjen: inntekt - overfort };
  });

  const perKategori = new Map<Id, number>();
  for (const p of rev.poster) perKategori.set(p.kategoriId, (perKategori.get(p.kategoriId) ?? 0) + postMnd(p));

  return {
    utgifter, sparing, total: utgifter + sparing, inntekter,
    overfortTotalt: sum(rev.overforinger, (o) => o.belop),
    buffer: sum(kontoer, (k) => k.balanse),
    kontoer, personer,
    kategorier: [...perKategori].map(([kategoriId, belop]) => ({ kategoriId, belop })).sort((a, b) => b.belop - a.belop),
  };
}

/**
 * Foreslår overføringer med runde beløp og få transaksjoner.
 * Hver person får sitt mål (andel av behovet, rundet opp). Kontoene fylles
 * grådig: største konto først, fra personen med mest igjen å fordele.
 */
export function foreslaOverforinger(dok: FellesDok, rev: Revisjon): Overforing[] {
  const opp = oppsummerFelles(dok, rev);
  const behov = opp.kontoer.filter((k) => k.forslag > 0).map((k) => ({ id: k.konto.id, rest: k.forslag }));
  if (behov.length === 0) return [];

  const givere = opp.personer
    .filter((p) => p.maal > 0)
    .map((p) => ({
      fraKontoId: dok.kontoer.find((k) => k.rolle === 'avsender' && k.eierId === p.person.id)?.id,
      rest: p.maal,
    }))
    .filter((g): g is { fraKontoId: string; rest: number } => !!g.fraKontoId);
  if (givere.length === 0) return [];

  // Overskuddet fra avrunding av personmålene legges på den største kontoen (blir buffer der)
  behov.sort((a, b) => b.rest - a.rest);
  const overskudd = sum(givere, (g) => g.rest) - sum(behov, (b) => b.rest);
  if (overskudd > 0) behov[0].rest += overskudd;

  const resultat: Overforing[] = [];
  for (const konto of behov) {
    while (konto.rest > 0) {
      const giver = givere.reduce((a, b) => (b.rest > a.rest ? b : a));
      if (giver.rest <= 0) break;
      const belop = Math.min(konto.rest, giver.rest);
      const finnes = resultat.find((o) => o.fraKontoId === giver.fraKontoId && o.tilKontoId === konto.id);
      if (finnes) finnes.belop += belop;
      else resultat.push({ id: nyId(), fraKontoId: giver.fraKontoId, tilKontoId: konto.id, belop });
      konto.rest -= belop;
      giver.rest -= belop;
    }
  }
  return resultat;
}

// ---------------------------------------------------------------------------
// Privatbudsjettet
// ---------------------------------------------------------------------------

export interface PrivatOppsummering {
  inntekt: number;
  tilFelles: number;
  utgifter: number;
  sparing: number;
  /** inntekt - tilFelles - utgifter - sparing */
  ubudsjettert: number;
  /** Andel av inntekten som spares, inkl. egen andel av felles sparing */
  spareandel: number;
}

export function oppsummerPrivat(
  felles: FellesDok, frev: Revisjon | undefined, prev: PrivatRevisjon | undefined, personId: Id,
): PrivatOppsummering {
  const fopp = frev ? oppsummerFelles(felles, frev) : undefined;
  const meg = fopp?.personer.find((p) => p.person.id === personId);
  const inntekt = meg?.inntekt ?? 0;
  const tilFelles = meg?.overfort ?? 0;
  const poster = prev?.poster ?? [];
  const utgifter = sum(poster.filter((p) => p.type === 'utgift'), postMnd);
  const sparing = sum(poster.filter((p) => p.type === 'sparing'), postMnd);
  const fellesSparingAndel = fopp && meg ? (fopp.sparing * meg.andel) / 100 : 0;
  return {
    inntekt, tilFelles, utgifter, sparing,
    ubudsjettert: inntekt - tilFelles - utgifter - sparing,
    spareandel: inntekt > 0 ? (sparing + fellesSparingAndel) / inntekt : 0,
  };
}

// ---------------------------------------------------------------------------
// Revisjoner
// ---------------------------------------------------------------------------

/** Lager en ny revisjon som kopi. Post-id-ene beholdes så revisjonene kan sammenlignes. */
export function kopierRevisjon<R extends Revisjon | PrivatRevisjon>(rev: R, navn: string, gjelderFra: string): R {
  const kopi = structuredClone(rev);
  kopi.id = nyId();
  kopi.navn = navn;
  kopi.gjelderFra = gjelderFra;
  kopi.notat = '';
  return kopi;
}

export type Endring = 'ny' | 'fjernet' | 'endret' | 'lik';

export interface PostDiff {
  id: Id;
  navn: string;
  kategoriId: Id;
  for: number;
  etter: number;
  endring: Endring;
}

/** Sammenligner postene i to revisjoner (månedsbeløp). */
export function sammenlign(fra: { poster: Post[] }, til: { poster: Post[] }): PostDiff[] {
  const ut: PostDiff[] = [];
  const gamle = new Map(fra.poster.map((p) => [p.id, p]));
  for (const p of til.poster) {
    const g = gamle.get(p.id);
    const etter = postMnd(p);
    const foer = g ? postMnd(g) : 0;
    ut.push({
      id: p.id, navn: p.navn, kategoriId: p.kategoriId, for: foer, etter,
      endring: !g ? 'ny' : Math.abs(etter - foer) > 0.005 ? 'endret' : 'lik',
    });
    gamle.delete(p.id);
  }
  for (const g of gamle.values()) {
    ut.push({ id: g.id, navn: g.navn, kategoriId: g.kategoriId, for: postMnd(g), etter: 0, endring: 'fjernet' });
  }
  const orden: Record<Endring, number> = { endret: 0, ny: 1, fjernet: 2, lik: 3 };
  return ut.sort((a, b) => orden[a.endring] - orden[b.endring] || Math.abs(b.etter - b.for) - Math.abs(a.etter - a.for));
}

/** Kontoer fra begge dokumentene (privat-siden trenger begge). */
export function alleKontoer(felles: FellesDok, privat?: PrivatDok): Konto[] {
  return privat ? [...felles.kontoer, ...privat.kontoer] : felles.kontoer;
}
