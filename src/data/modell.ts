// Datamodellen. Alt lagres som to JSON-dokumenter:
//  - FellesDok: ett dokument som begge ser (personer, kontoer, kategorier, revisjoner)
//  - PrivatDok: ett per person, som bare eieren kan lese (sikret i databasen, se supabase/skjema.sql)

export type Id = string;

export type Frekvens = 'mnd' | 'kvartal' | 'halvaar' | 'aar';
export type PostType = 'utgift' | 'sparing';

/** felles = brukskonto (verdien heter «felles» av historiske grunner), avsender = lønnskonto, sparing = sparekonto.
 *  Om kontoen er felles eller privat avgjøres av hvilket dokument den ligger i, ikke av rollen. */
export type KontoRolle = 'felles' | 'avsender' | 'sparing';

export interface Person {
  id: Id;
  navn: string;
  /** Google-e-posten personen logger inn med */
  epost: string;
}

export interface Bank {
  id: Id;
  navn: string;
}

export interface Konto {
  id: Id;
  navn: string;
  bankId: Id | null;
  /** Lagres maskert, f.eks. "1234 xx xx567" */
  kontonr: string;
  rolle: KontoRolle;
  /** Hvem kontoen tilhører (lønnskontoer og private kontoer). null = felles. */
  eierId: Id | null;
  /** Sparemål (valgfritt) */
  sparemaal?: Sparemaal;
}

export interface Sparemaal {
  maal: number;
  saldo: number;
  saldoDato: string; // ÅÅÅÅ-MM-DD
  rente: number; // prosent, f.eks. 3.82
}

export interface Kategori {
  id: Id;
  navn: string;
  /** Plass i fargepaletten (0–7), se stil/tokens.css */
  farge: number;
}

export interface Post {
  id: Id;
  navn: string;
  belop: number;
  frekvens: Frekvens;
  type: PostType;
  kategoriId: Id;
  /** Kontoen posten trekkes fra */
  kontoId: Id;
  notat?: string;
  /** Følges opp med førte utgifter (variable poster som mat). Faste trekk kontrolleres via saldo. */
  folgOpp?: boolean;
}

export interface Inntekt {
  id: Id;
  navn: string;
  /** null = ikke knyttet til en person (f.eks. barnetrygd) */
  personId: Id | null;
  belop: number;
  frekvens: Frekvens;
  /** Kontoen inntekten går inn på */
  tilKontoId: Id;
}

export interface Overforing {
  id: Id;
  fraKontoId: Id;
  tilKontoId: Id;
  /** Månedlig beløp */
  belop: number;
}

export interface Revisjon {
  id: Id;
  navn: string;
  gjelderFra: string; // ÅÅÅÅ-MM-DD
  notat: string;
  /** Fordeling av felleskostnader i prosent per person (summerer til 100) */
  andeler: Record<Id, number>;
  /** Overføringer rundes opp til nærmeste steg (f.eks. 500) */
  avrundingSteg: number;
  inntekter: Inntekt[];
  poster: Post[];
  overforinger: Overforing[];
}

export interface FellesDok {
  skjema: 1;
  personer: Person[];
  banker: Bank[];
  kontoer: Konto[];
  kategorier: Kategori[];
  revisjoner: Revisjon[];
}

export interface PrivatRevisjon {
  id: Id;
  navn: string;
  gjelderFra: string;
  notat: string;
  poster: Post[];
}

export interface PrivatDok {
  skjema: 1;
  /** Person-id i FellesDok */
  eierId: Id;
  /** Kontoer bare eieren ser (egne sparekontoer, fond osv.) */
  kontoer: Konto[];
  revisjoner: PrivatRevisjon[];
}

// ---------------------------------------------------------------------------
// Oppfølging: førte utgifter og månedlige saldoer. Egne tabeller (ikke i dokumentene),
// så to personer kan føre samtidig uten konflikt.
// ---------------------------------------------------------------------------

export interface Utgift {
  id: Id;
  dato: string; // ÅÅÅÅ-MM-DD
  belop: number;
  kategoriId: Id;
  kontoId: Id;
  notat: string;
  /** true = privat (bare eieren ser den), false = felles */
  privat: boolean;
  /** E-posten til den som førte utgiften */
  fortAv: string;
}

/** Saldo på en konto ved utgangen av en måned */
export interface Saldo {
  id: Id;
  kontoId: Id;
  maaned: string; // ÅÅÅÅ-MM
  belop: number;
  privat: boolean;
  fortAv: string;
}

export const FREKVENS_NAVN: Record<Frekvens, string> = {
  mnd: 'Månedlig',
  kvartal: 'Kvartalsvis',
  halvaar: 'Halvårlig',
  aar: 'Årlig',
};

export const ROLLE_NAVN: Record<KontoRolle, string> = {
  felles: 'Brukskonto',
  avsender: 'Lønnskonto',
  sparing: 'Sparekonto',
};

export function nyId(): Id {
  // randomUUID finnes bare på https/localhost – reserve for f.eks. test via IP på hjemmenettet
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function tomtFellesDok(): FellesDok {
  return { skjema: 1, personer: [], banker: [], kontoer: [], kategorier: [], revisjoner: [] };
}

export function tomtPrivatDok(eierId: Id): PrivatDok {
  return { skjema: 1, eierId, kontoer: [], revisjoner: [] };
}
