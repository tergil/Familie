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
  /** Andre i familien uten innlogging (f.eks. barna) – brukes i kalenderen */
  familie?: Familiemedlem[];
  /** Hemmelig nøkkel for kalenderabonnementet (#/… → Edge Function «kalender»). Mangler = av. */
  kalenderNokkel?: string;
}

export interface Familiemedlem {
  id: Id;
  navn: string;
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

// ---------------------------------------------------------------------------
// Huskelister: egne tabeller (liste, listepunkt), som utgiftene. privat = bare eieren ser listen.
// ---------------------------------------------------------------------------

/** Bestemmer hvilke statuser og felt punktene har, se LISTETYPER i logikk/lister.ts */
export type ListeType = 'sjekk' | 'gave' | 'onske' | 'oppgave' | 'opplevelse' | 'serie' | 'hage' | 'kalender' | 'gaveaar';

export interface Liste {
  id: Id;
  navn: string;
  /** Emoji */
  ikon: string;
  /** Fri tekst, f.eks. «Hus» eller «Jul». Listene grupperes på denne. */
  kategori: string;
  type: ListeType;
  privat: boolean;
  /** Egen mal – vises under Maler, ikke blant listene */
  mal: boolean;
  /** Kobling til budsjettet: en post (sammenlignes med årsbeløpet) eller en sparekonto med mål */
  postId?: Id;
  kontoId?: Id;
  /** Hemmelig nøkkel for delingslenken (#/delt/<nøkkel>). null/mangler = ikke delt. */
  deling?: string | null;
  /** Gaveår: samlet budsjett for en anledning, nøkkel «jul:2026» */
  anledningsBudsjett?: Record<string, number>;
  rekkefolge: number;
  opprettet: string; // ÅÅÅÅ-MM-DD
}

export interface Punkt {
  id: Id;
  listeId: Id;
  /** Underpunkt av et annet punkt (ett nivå) */
  forelderId: Id | null;
  tekst: string;
  notat: string;
  /** En av statusene til listetypen */
  status: string;
  belop: number | null;
  /** Frist, besøksdato eller dato for kalenderluken */
  dato: string | null;
  rekkefolge: number;
  lenke?: string;
  /** Gaver: hvem gaven er til */
  mottaker?: string;
  /** 1–5 */
  vurdering?: number;
  /** Hage: hvor planten står */
  plassering?: string;
  /** Hage: måneder (1–12) det skal gjøres noe */
  maaneder?: number[];
  /** Settes når punktet blir kjøpt/ferdig – brukes i gavehistorikken */
  ferdigDato?: string;
  /** Hage: sist stelt */
  sistGjort?: string;
  /** Bilder og PDF i Supabase Storage (bøtta «vedlegg») */
  vedlegg?: Vedlegg[];
  /** Gaveår, mottaker (hovedpunkt): anledningene personen får gave til */
  anledninger?: Anledning[];
  /** Gaveår, mottaker: fødselsdato ÅÅÅÅ-MM-DD – gir bursdagen og alderen */
  fodt?: string;
  /** Gaveår, gave (underpunkt): hvilken anledning og år den er til, «<anledning-id>:<år>». Tom = idébanken. */
  anledning?: string;
  /** Gaveår, felles: person-id til den som betaler. Tom = felles. */
  betaler?: Id;
}

export type AnledningType = 'bursdag' | 'jul' | 'morsdag' | 'farsdag' | 'egen';

export interface Anledning {
  id: Id;
  type: AnledningType;
  /** Egen anledning, f.eks. «Konfirmasjon» */
  navn?: string;
  /** MM-DD for bursdag og egne. Jul, morsdag og farsdag regnes ut. */
  dag?: string;
  /** Bare én gang (f.eks. konfirmasjon): året. Mangler = hvert år. */
  aar?: number;
  /** Budsjett for gaven hver gang */
  budsjett?: number;
}

export interface Vedlegg {
  id: Id;
  /** Opprinnelig filnavn */
  navn: string;
  /** MIME-type, f.eks. image/jpeg eller application/pdf */
  type: string;
  /** Sti i bøtta: <listeId>/<punktId>/<vedleggId>.<endelse> */
  sti: string;
  storrelse: number;
}

/** Det en delingslenke viser – uten innlogging */
export interface DeltListe {
  navn: string;
  ikon: string;
  type: ListeType;
  punkter: Punkt[];
}

// ---------------------------------------------------------------------------
// Varsler (push): innstillinger per bruker. Sendes av Edge Function «varsler» (se supabase/varsler.sql).
// ---------------------------------------------------------------------------

export type VarselType = 'bursdag' | 'jul' | 'andre' | 'frist' | 'kalender' | 'hage' | 'avtaler' | 'avtaleFor';

export interface VarselValg {
  pa: boolean;
  /** Hvor mange dager før det skal varsles. 0 = samme dag. */
  dager: number[];
}

export interface VarselInnstillinger {
  /** Klokkeslett (time, norsk tid) varslene sendes */
  time: number;
  /** Tidlige gavevarsler (før dagen) bare når ingen gave er kjøpt */
  bareUtenGave: boolean;
  typer: Record<VarselType, VarselValg>;
}

export const STANDARD_VARSLER: VarselInnstillinger = {
  time: 8,
  bareUtenGave: true,
  typer: {
    bursdag: { pa: true, dager: [21, 0] },
    jul: { pa: true, dager: [21] },
    andre: { pa: true, dager: [21, 0] },
    frist: { pa: true, dager: [3, 0] },
    kalender: { pa: false, dager: [0] },
    hage: { pa: true, dager: [0] },
    /** Morgenoversikt: 0 = dagens avtaler, 1 = morgendagens */
    avtaler: { pa: true, dager: [0] },
    /** Varsel før en avtale, når avtalen har «varsel før» */
    avtaleFor: { pa: true, dager: [0] },
  },
};

/** En enhet som har slått på varsler */
export interface VarselEnhet {
  endpoint: string;
  enhet: string;
  opprettet: string;
}

// ---------------------------------------------------------------------------
// Kalender: felles avtaler. Egen tabell «hendelse» (supabase/kalender.sql). Gjentakelser utvides i logikk/kalender.ts.
// ---------------------------------------------------------------------------

export type KalenderKategori = 'barnehage' | 'trening' | 'sosialt' | 'mote' | 'besok' | 'annet';

export interface Gjentak {
  frekvens: 'dag' | 'uke' | 'maaned' | 'aar';
  /** Hver 1., 2., … gang */
  intervall: number;
  /** Ukentlig: ukedager 1 (mandag) – 7 (søndag). Mangler = samme ukedag som startdatoen. */
  ukedager?: number[];
  /** Siste dato (inklusiv). Mangler = for alltid. */
  til?: string;
}

export interface Hendelse {
  id: Id;
  tittel: string;
  kategori: KalenderKategori;
  /** Startdato ÅÅÅÅ-MM-DD (for en serie: første gang) */
  dato: string;
  /** Flerdagers: siste dag */
  sluttDato?: string;
  /** «HH:MM». Mangler = hele dagen. */
  fra?: string;
  til?: string;
  gjentak?: Gjentak;
  /** Hvem avtalen gjelder: person-id-er og familiemedlem-id-er */
  hvem: Id[];
  /** Hvem som henter/leverer/kjører (person-id) */
  ansvarlig?: Id;
  sted?: string;
  notat?: string;
  /** Varsel så mange minutter før (krever klokkeslett) */
  varselMin?: number;
  /** Unntak i en serie: denne raden erstatter (eller avlyser) forekomsten originalDato i serien serieId */
  serieId?: Id;
  originalDato?: string;
  avlyst?: boolean;
}
