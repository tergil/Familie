// Oppfølging av budsjettet: saldokontroll per konto og førte utgifter per kategori.
// Ren logikk uten React – testes i scripts/test-beregning.ts.
import type { FellesDok, Id, Konto, Post, PrivatDok, PrivatRevisjon, Revisjon, Saldo, Utgift } from '../data/modell';
import { aktivRevisjon, postMnd, sum, tilMnd } from './beregning';

// ---------------------------------------------------------------- Måneder

/** "2026-09-28" → "2026-09" */
export const maanedAv = (dato: string) => dato.slice(0, 7);

export function flyttMaaned(maaned: string, antall: number): string {
  const [a, m] = maaned.split('-').map(Number);
  const d = new Date(a, m - 1 + antall, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function dagerIMaaned(maaned: string): number {
  const [a, m] = maaned.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

/** Hvor stor del av måneden som er gått (0–1). Tidligere måneder = 1, fremtidige = 0. */
export function andelGaatt(maaned: string, iDag: string): number {
  const naa = maanedAv(iDag);
  if (maaned < naa) return 1;
  if (maaned > naa) return 0;
  return Number(iDag.slice(8, 10)) / dagerIMaaned(maaned);
}

/** Revisjonen som gjelder for måneden (den som gjelder den 1.) */
export function revisjonForMaaned<R extends { gjelderFra: string }>(revisjoner: R[], maaned: string): R | undefined {
  return aktivRevisjon(revisjoner, `${maaned}-01`);
}

// ---------------------------------------------------------------- Dobbeltføring

/** Utgifter på samme konto med samme beløp innen ±dager fra datoen. */
export function muligeDubletter(ny: Pick<Utgift, 'id' | 'dato' | 'belop' | 'kontoId'>, alle: Utgift[], dager = 7): Utgift[] {
  const t = Date.parse(ny.dato);
  return alle.filter((u) =>
    u.id !== ny.id
    && u.kontoId === ny.kontoId
    && Math.abs(u.belop - ny.belop) < 0.005
    && Math.abs(Date.parse(u.dato) - t) <= dager * 86_400_000);
}

// ---------------------------------------------------------------- Kategoristatus (førte utgifter)

export type Tempo = 'i-rute' | 'over-tempo' | 'over-budsjett' | 'ikke-budsjettert';

export interface KategoriStatus {
  kategoriId: Id;
  /** Budsjett for måneden: sum av postene med «Følg opp» i kategorien */
  budsjett: number;
  brukt: number;
  /** Hvor mye som «burde» vært brukt nå, gitt hvor langt måneden er kommet */
  forventet: number;
  tempo: Tempo;
  antall: number;
}

export function kategoriStatus(poster: Post[], utgifter: Utgift[], andel: number): KategoriStatus[] {
  const fulgt = poster.filter((p) => p.folgOpp);
  const ider = new Set([...fulgt.map((p) => p.kategoriId), ...utgifter.map((u) => u.kategoriId)]);
  return [...ider].map((kategoriId) => {
    const budsjett = sum(fulgt.filter((p) => p.kategoriId === kategoriId), postMnd);
    const mine = utgifter.filter((u) => u.kategoriId === kategoriId);
    const brukt = sum(mine, (u) => u.belop);
    const forventet = budsjett * andel;
    const tempo: Tempo = budsjett <= 0 ? 'ikke-budsjettert'
      : brukt > budsjett + 0.5 ? 'over-budsjett'
      // 5 % slingringsmonn, så én stor handel tidlig i måneden ikke gir alarm
      : brukt > forventet + budsjett * 0.05 ? 'over-tempo'
      : 'i-rute';
    return { kategoriId, budsjett, brukt, forventet, tempo, antall: mine.length };
  }).sort((a, b) => b.budsjett - a.budsjett || b.brukt - a.brukt);
}

// ---------------------------------------------------------------- Saldokontroll

/** Hvordan en konto skal bevege seg i løpet av en måned ifølge budsjettet */
export interface KontoPlan {
  /** Overføringer og inntekter inn */
  inn: number;
  /** Faste trekk: poster uten «Følg opp» + overføringer ut */
  utFast: number;
  /** Variable poster med «Følg opp» (det som føres som utgifter) */
  utVariabel: number;
}

/**
 * Budsjettert bevegelse for en konto per måned.
 * - Sparing på en sparekonto blir stående (er ikke «ut»).
 * - Private poster trekkes fra eierens lønnskonto. Private spareposter settes inn på sin egen konto.
 */
export function kontoPlan(
  konto: Konto, felles: FellesDok, rev: Revisjon | undefined,
  privat?: PrivatDok, prev?: PrivatRevisjon,
): KontoPlan {
  const plan: KontoPlan = { inn: 0, utFast: 0, utVariabel: 0 };
  const ut = (p: Post) => { if (p.folgOpp) plan.utVariabel += postMnd(p); else plan.utFast += postMnd(p); };

  if (rev) {
    plan.inn += sum(rev.overforinger.filter((o) => o.tilKontoId === konto.id), (o) => o.belop);
    plan.inn += sum(rev.inntekter.filter((i) => i.tilKontoId === konto.id), (i) => tilMnd(i.belop, i.frekvens));
    plan.utFast += sum(rev.overforinger.filter((o) => o.fraKontoId === konto.id), (o) => o.belop);
    for (const p of rev.poster.filter((x) => x.kontoId === konto.id)) {
      if (p.type === 'sparing' && konto.rolle === 'sparing') continue;
      ut(p);
    }
  }

  if (privat && prev) {
    const minLonn = felles.kontoer.find((k) => k.rolle === 'avsender' && k.eierId === privat.eierId);
    for (const p of prev.poster) {
      const fraLonn = !privat.kontoer.some((k) => k.id === p.kontoId);
      if (konto.id === minLonn?.id) {
        // Alt i privatbudsjettet går ut fra lønnskontoen – også sparing til egne kontoer
        if (fraLonn || p.type === 'sparing') ut(p);
      } else if (p.kontoId === konto.id && !fraLonn) {
        if (p.type === 'sparing') plan.inn += postMnd(p);
      }
    }
  }
  return plan;
}

export interface Avstemming {
  konto: Konto;
  plan: KontoPlan;
  saldo?: number;
  forrige?: number;
  /** Budsjettert endring i saldo */
  forventet: number;
  /** Faktisk endring (krever to saldoer) */
  faktisk?: number;
  /** faktisk - forventet. Negativ = brukt mer enn budsjettert. */
  avvik?: number;
  /** Variabelt forbruk utledet av saldo: inn - faste trekk - faktisk endring */
  forbrukFraSaldo?: number;
  /** Sum førte utgifter på kontoen i måneden */
  fort: number;
  /** forbrukFraSaldo - fort. Positiv = noe er ikke ført. */
  ikkeFort?: number;
}

export function avstem(konto: Konto, plan: KontoPlan, saldoer: Saldo[], utgifter: Utgift[], maaned: string): Avstemming {
  const finn = (m: string) => saldoer.find((s) => s.kontoId === konto.id && s.maaned === m)?.belop;
  const saldo = finn(maaned);
  const forrige = finn(flyttMaaned(maaned, -1));
  const forventet = plan.inn - plan.utFast - plan.utVariabel;
  const fort = sum(utgifter.filter((u) => u.kontoId === konto.id && maanedAv(u.dato) === maaned), (u) => u.belop);
  const a: Avstemming = { konto, plan, saldo, forrige, forventet, fort };
  if (saldo !== undefined && forrige !== undefined) {
    a.faktisk = saldo - forrige;
    a.avvik = a.faktisk - forventet;
    a.forbrukFraSaldo = plan.inn - plan.utFast - a.faktisk;
    if (plan.utVariabel > 0 || fort > 0) a.ikkeFort = a.forbrukFraSaldo - fort;
  }
  return a;
}

/** Kontoer som hører til felles- eller privatvisningen */
export function kontoerFor(felles: FellesDok, privat: PrivatDok | undefined, visning: 'felles' | 'privat'): Konto[] {
  if (visning === 'felles') return felles.kontoer.filter((k) => k.rolle !== 'avsender');
  if (!privat) return [];
  const minLonn = felles.kontoer.filter((k) => k.rolle === 'avsender' && k.eierId === privat.eierId);
  return [...minLonn, ...privat.kontoer];
}
