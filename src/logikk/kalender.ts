// Kalender: utvider gjentakende avtaler til forekomster, håndterer unntak («bare denne»), og endrer serier.
// Bursdager og andre anledninger fra gaveårene og frister fra listene vises også i kalenderen.
// Ren logikk uten React – testes i scripts/test-beregning.ts. Brukes også av Edge Functions (varsler, kalender).
import type { FellesDok, Gjentak, Hendelse, Id, KalenderKategoriDef, Liste, Punkt } from '../data/modell';
import { nyId } from '../data/modell';
import { anledningsDato, anledningsNavn, alder, gaveaar, mottakere } from './gaveaar';
import { dagerMellom, erBrukt, erFerdig } from './lister';

/** Kategoriene dere starter med. Kan endres, legges til og slettes i kalenderen (lagres i fellesdokumentet). */
export const STANDARD_KALENDERKATEGORIER: KalenderKategoriDef[] = [
  { id: 'barnehage', navn: 'Barnehage/skole', farge: 1 },
  { id: 'trening', navn: 'Trening og aktivitet', farge: 4 },
  { id: 'sosialt', navn: 'Sosialt', farge: 6 },
  { id: 'mote', navn: 'Møte', farge: 5 },
  { id: 'besok', navn: 'Besøk og reise', farge: 2 },
  { id: 'annet', navn: 'Annet', farge: 7 },
];

export const kalenderKategorier = (felles: FellesDok | null | undefined) => felles?.kalenderKategorier ?? STANDARD_KALENDERKATEGORIER;
/** Farger for det som kommer fra resten av appen */
export const FARGE_ANLEDNING = 0;
export const FARGE_FRIST = 3;

export const UKEDAGER_KORT = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'];

// ---------------------------------------------------------------- Datoer (uten tidssoner)

const DAG = 86_400_000;
const utc = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d); };
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const leggTilDager = (dato: string, n: number) => iso(utc(dato) + n * DAG);

/** 1 = mandag … 7 = søndag */
export function ukedag(dato: string): number {
  const d = new Date(utc(dato)).getUTCDay();
  return d === 0 ? 7 : d;
}

export const mandagI = (dato: string) => leggTilDager(dato, 1 - ukedag(dato));

/** Minutter fra midnatt for «HH:MM» */
export const minutter = (tid: string) => Number(tid.slice(0, 2)) * 60 + Number(tid.slice(3, 5));

// ---------------------------------------------------------------- Gjentakelser

/** Faller serien på datoen? (Unntak ikke medregnet.) */
export function treffer(h: Hendelse, d: string): boolean {
  const g = h.gjentak;
  if (!g) return d === h.dato;
  if (d < h.dato || (g.til && d > g.til)) return false;
  const n = Math.max(1, g.intervall || 1);
  const aar = (x: string) => Number(x.slice(0, 4));
  const mnd = (x: string) => Number(x.slice(5, 7));
  switch (g.frekvens) {
    case 'dag': return dagerMellom(h.dato, d) % n === 0;
    case 'uke': {
      const dager = g.ukedager?.length ? g.ukedager : [ukedag(h.dato)];
      if (!dager.includes(ukedag(d))) return false;
      return (dagerMellom(mandagI(h.dato), mandagI(d)) / 7) % n === 0;
    }
    case 'maaned': return d.slice(8) === h.dato.slice(8) && ((aar(d) - aar(h.dato)) * 12 + mnd(d) - mnd(h.dato)) % n === 0;
    case 'aar': return d.slice(5) === h.dato.slice(5) && (aar(d) - aar(h.dato)) % n === 0;
  }
}

/** «Hverdager», «Hver uke: man, ons», «Hver 2. uke: tor», «Hver måned den 14.» */
export function gjentakTekst(g: Gjentak | undefined, dato: string): string {
  if (!g) return 'Gjentas ikke';
  const n = Math.max(1, g.intervall || 1);
  const hver = n === 1 ? 'Hver' : `Hver ${n}.`;
  let tekst: string;
  if (g.frekvens === 'dag') tekst = n === 1 ? 'Hver dag' : `Hver ${n}. dag`;
  else if (g.frekvens === 'uke') {
    const dager = [...(g.ukedager?.length ? g.ukedager : [ukedag(dato)])].sort();
    if (n === 1 && dager.join() === '1,2,3,4,5') tekst = 'Hverdager';
    else if (n === 1 && dager.length === 7) tekst = 'Hver dag';
    else tekst = `${hver} uke: ${dager.map((x) => UKEDAGER_KORT[x - 1]).join(', ')}`;
  } else if (g.frekvens === 'maaned') tekst = `${hver} måned den ${Number(dato.slice(8))}.`;
  else tekst = n === 1 ? 'Hvert år' : `Hvert ${n}. år`;
  return g.til ? `${tekst} til ${Number(g.til.slice(8))}.${Number(g.til.slice(5, 7))}.${g.til.slice(0, 4)}` : tekst;
}

// ---------------------------------------------------------------- Forekomster

export interface Forekomst {
  /** Unik per forekomst: «<serie-id>|<originaldato>» */
  nokkel: string;
  /** Raden serien er lagret i */
  serie: Hendelse;
  /** Det som gjelder for akkurat denne gangen (unntaket hvis det finnes) */
  hendelse: Hendelse;
  /** Datoen den vises på (kan være flyttet) */
  dato: string;
  /** Datoen i serien den hører til */
  originalDato: string;
  unntak?: Hendelse;
}

/** Hvor mange dager en avtale varer utover startdagen */
const varighet = (h: Hendelse) => (h.sluttDato && h.sluttDato > h.dato ? dagerMellom(h.dato, h.sluttDato) : 0);

/** Alle forekomster som overlapper perioden fra–til (inklusiv), sortert på dato og tid */
export function forekomster(hendelser: Hendelse[], fra: string, til: string): Forekomst[] {
  const serier = hendelser.filter((h) => !h.serieId);
  const unntak = new Map(hendelser.filter((h) => h.serieId && h.originalDato).map((h) => [`${h.serieId}|${h.originalDato}`, h]));
  const ut: Forekomst[] = [];
  for (const serie of serier) {
    const lengde = varighet(serie);
    const start = [serie.dato, leggTilDager(fra, -lengde)].sort()[1];
    const slutt = [til, serie.gjentak?.til ?? (serie.gjentak ? til : serie.dato)].sort()[0];
    for (let d = start; d <= slutt; d = leggTilDager(d, 1)) {
      if (!treffer(serie, d)) continue;
      const nokkel = `${serie.id}|${d}`;
      const u = unntak.get(nokkel);
      if (u) {
        // Unntak tas med på sin (kanskje flyttede) dato, om den er i perioden
        if (!u.avlyst && u.dato <= til && leggTilDager(u.dato, varighet(u)) >= fra) {
          ut.push({ nokkel, serie, hendelse: { ...u, gjentak: serie.gjentak }, dato: u.dato, originalDato: d, unntak: u });
        }
        continue;
      }
      ut.push({ nokkel, serie, hendelse: serie, dato: d, originalDato: d });
    }
  }
  // Unntak flyttet inn i perioden fra en dato utenfor
  for (const u of unntak.values()) {
    const serie = serier.find((s) => s.id === u.serieId);
    if (!serie || u.avlyst || u.dato < fra || u.dato > til || ut.some((f) => f.unntak?.id === u.id)) continue;
    if (!treffer(serie, u.originalDato!)) continue;
    ut.push({ nokkel: `${serie.id}|${u.originalDato}`, serie, hendelse: { ...u, gjentak: serie.gjentak }, dato: u.dato, originalDato: u.originalDato!, unntak: u });
  }
  return ut.sort((a, b) => a.dato.localeCompare(b.dato) || (a.hendelse.fra ?? '').localeCompare(b.hendelse.fra ?? '') || a.hendelse.tittel.localeCompare(b.hendelse.tittel, 'nb'));
}

// ---------------------------------------------------------------- Endre og slette i en serie

export type Modus = 'denne' | 'fremover' | 'alle';

export interface Endring {
  lagre: Hendelse[];
  slett: Id[];
}

/** Feltene skjemaet endrer (alt unntatt id og serie-feltene) */
export type Avtale = Omit<Hendelse, 'id' | 'serieId' | 'originalDato' | 'avlyst'>;

const utenSerie = (h: Hendelse): Avtale => {
  const { id: _i, serieId: _s, originalDato: _o, avlyst: _a, ...rest } = h;
  return rest;
};

/** Samme gjentakelse (sluttdato ikke medregnet)? */
export function sammeMonster(a: Gjentak | undefined, b: Gjentak | undefined, dato: string): boolean {
  if (!a || !b) return !a && !b;
  const dager = (g: Gjentak) => [...(g.ukedager?.length ? g.ukedager : [ukedag(dato)])].sort().join();
  return a.frekvens === b.frekvens && Math.max(1, a.intervall || 1) === Math.max(1, b.intervall || 1) && (a.frekvens !== 'uke' || dager(a) === dager(b));
}

/** Endrer en forekomst. For en serie velges «bare denne», «denne og fremover» eller «hele serien». */
export function endreForekomst(hendelser: Hendelse[], f: Forekomst, ny: Avtale, modus: Modus): Endring {
  const { serie } = f;
  const unntakI = hendelser.filter((h) => h.serieId === serie.id);
  if (!serie.gjentak) return { lagre: [{ ...serie, ...ny, id: serie.id }], slett: [] };

  if (modus === 'denne') {
    return { lagre: [{ ...ny, gjentak: undefined, id: f.unntak?.id ?? nyId(), serieId: serie.id, originalDato: f.originalDato, avlyst: false }], slett: [] };
  }
  const forskyvning = dagerMellom(f.originalDato, ny.dato);
  const nyttMonster = forskyvning !== 0 || !sammeMonster(ny.gjentak, serie.gjentak, serie.dato);

  if (modus === 'alle' || f.originalDato === serie.dato) {
    const oppdatert: Hendelse = { ...serie, ...ny, id: serie.id, dato: leggTilDager(serie.dato, forskyvning) };
    // Når mønsteret endres, passer ikke unntakene lenger
    return { lagre: [oppdatert], slett: nyttMonster ? unntakI.map((u) => u.id) : [] };
  }

  // Denne og fremover: den gamle serien slutter dagen før, en ny begynner her
  const gammel: Hendelse = { ...serie, gjentak: { ...serie.gjentak, til: leggTilDager(f.originalDato, -1) } };
  const nyId_ = nyId();
  const nySerie: Hendelse = { ...ny, id: nyId_ };
  const etter = unntakI.filter((u) => u.originalDato! >= f.originalDato);
  return {
    lagre: [gammel, nySerie, ...(nyttMonster ? [] : etter.filter((u) => u.originalDato !== f.originalDato).map((u) => ({ ...u, serieId: nyId_ })))],
    slett: nyttMonster ? etter.map((u) => u.id) : etter.filter((u) => u.originalDato === f.originalDato).map((u) => u.id),
  };
}

/** Sletter en forekomst: bare denne (avlyses), denne og fremover, eller hele serien */
export function slettForekomst(hendelser: Hendelse[], f: Forekomst, modus: Modus): Endring {
  const { serie } = f;
  const unntakI = hendelser.filter((h) => h.serieId === serie.id);
  if (!serie.gjentak || modus === 'alle' || (modus === 'fremover' && f.originalDato === serie.dato)) {
    return { lagre: [], slett: [serie.id, ...unntakI.map((u) => u.id)] };
  }
  if (modus === 'denne') {
    return { lagre: [{ ...utenSerie(f.hendelse), gjentak: undefined, id: f.unntak?.id ?? nyId(), serieId: serie.id, originalDato: f.originalDato, avlyst: true }], slett: [] };
  }
  return {
    lagre: [{ ...serie, gjentak: { ...serie.gjentak, til: leggTilDager(f.originalDato, -1) } }],
    slett: unntakI.filter((u) => u.originalDato! >= f.originalDato).map((u) => u.id),
  };
}

// ---------------------------------------------------------------- Alt som vises i kalenderen

export interface KalenderPost {
  nokkel: string;
  dato: string;
  sluttDato?: string;
  fra?: string;
  til?: string;
  tittel: string;
  /** Plass i fargepaletten (--k0 … --k7). -1 = ingen kategori (nøytral farge). */
  farge: number;
  hvem: Id[];
  ansvarlig?: Id;
  sted?: string;
  notat?: string;
  kilde: 'avtale' | 'anledning' | 'frist';
  forekomst?: Forekomst;
  /** For anledninger og frister: hvor i appen den hører hjemme */
  url?: string;
  gjentar?: boolean;
  /** Forekomst som er endret fra serien (f.eks. en annen henter) */
  endret?: boolean;
}

/** Avtaler, anledninger fra gaveårene (unntatt jul) og frister fra listene i perioden */
export function kalenderPoster(hendelser: Hendelse[], lister: Liste[], punkter: Punkt[], fra: string, til: string,
  valg: { anledninger?: boolean; frister?: boolean } = { anledninger: true, frister: true },
  kategorier: KalenderKategoriDef[] = STANDARD_KALENDERKATEGORIER): KalenderPost[] {
  const ut: KalenderPost[] = forekomster(hendelser, fra, til).map((f) => {
    const h = f.hendelse;
    // Slettet kategori: nøytral farge
    const farge = kategorier.find((k) => k.id === h.kategori)?.farge ?? -1;
    const forskyvning = varighet(h);
    return {
      nokkel: f.nokkel, dato: f.dato, sluttDato: forskyvning ? leggTilDager(f.dato, forskyvning) : undefined, fra: h.fra, til: h.til,
      tittel: h.tittel, farge, hvem: h.hvem ?? [], ansvarlig: h.ansvarlig, sted: h.sted, notat: h.notat,
      kilde: 'avtale', forekomst: f, gjentar: !!f.serie.gjentak, endret: !!f.unntak,
    };
  });

  if (valg.anledninger) {
    const sett = new Set<string>();
    const forste = Number(fra.slice(0, 4));
    const siste = Number(til.slice(0, 4));
    for (const liste of gaveaar(lister)) {
      for (const m of mottakere(liste.id, punkter)) {
        for (const a of m.anledninger ?? []) {
          if (a.type === 'jul') continue;
          for (let aar = forste; aar <= siste; aar++) {
            const dato = anledningsDato(a, aar);
            if (!dato || dato < fra || dato > til) continue;
            // Samme person i felles og privat gaveår vises én gang
            const nokkel = `${m.tekst.trim().toLowerCase()}|${anledningsNavn(a).toLowerCase()}|${dato}`;
            if (sett.has(nokkel)) continue;
            sett.add(nokkel);
            const fyller = a.type === 'bursdag' ? alder(m.fodt, dato) : undefined;
            ut.push({
              nokkel: `anledning|${m.id}|${a.id}|${dato}`, dato, kilde: 'anledning', hvem: [], farge: FARGE_ANLEDNING,
              tittel: a.type === 'bursdag' ? `${m.tekst} har bursdag${fyller !== undefined ? ` (${fyller} år)` : ''}` : `${anledningsNavn(a)} – ${m.tekst}`,
              url: `#/lister/${liste.id}`,
            });
          }
        }
      }
    }
  }

  if (valg.frister) {
    const aktuelle = new Map(lister.filter((l) => !l.mal && l.type !== 'kalender' && l.type !== 'hage' && l.type !== 'gaveaar').map((l) => [l.id, l]));
    for (const p of punkter) {
      const l = aktuelle.get(p.listeId);
      if (!l || !p.dato || p.dato < fra || p.dato > til || erFerdig(l.type, p.status) || erBrukt(l.type, p.status)) continue;
      ut.push({ nokkel: `frist|${p.id}`, dato: p.dato, kilde: 'frist', hvem: [], farge: FARGE_FRIST, tittel: `Frist: ${p.tekst}`, url: `#/lister/${l.id}` });
    }
  }

  // Hele dagen først, så etter klokkeslett
  return ut.sort((a, b) => a.dato.localeCompare(b.dato) || (a.fra ?? '').localeCompare(b.fra ?? '') || a.tittel.localeCompare(b.tittel, 'nb'));
}

/** Er posten på datoen (også flerdagers som startet før)? */
export const paaDato = (p: KalenderPost, dato: string) => p.dato === dato || (!!p.sluttDato && p.dato < dato && p.sluttDato >= dato);

/**
 * Er posten over? Med sluttid: når sluttiden er passert. Bare starttid: regnes som én time.
 * Hele dagen (og flerdagers): over først når dagen (siste dag) er omme.
 */
export function erForbi(p: KalenderPost, naa: { dato: string; minutt: number }): boolean {
  const sisteDag = p.sluttDato ?? p.dato;
  if (sisteDag !== naa.dato) return sisteDag < naa.dato;
  if (!p.fra || (p.sluttDato && p.sluttDato !== p.dato)) return false;
  const slutt = p.til && p.til > p.fra ? minutter(p.til) : minutter(p.fra) + 60;
  return slutt <= naa.minutt;
}

/** De neste postene som ikke er over, med dagen de vises under (flerdagers som startet før i dag vises i dag) */
export function kommende(poster: KalenderPost[], naa: { dato: string; minutt: number }, antall = 5): { dag: string; post: KalenderPost }[] {
  return poster
    .filter((p) => !erForbi(p, naa))
    .map((post) => ({ dag: post.dato < naa.dato ? naa.dato : post.dato, post }))
    .sort((a, b) => a.dag.localeCompare(b.dag) || (a.dag === a.post.dato ? a.post.fra ?? '' : '').localeCompare(b.dag === b.post.dato ? b.post.fra ?? '' : '') || a.post.tittel.localeCompare(b.post.tittel, 'nb'))
    .slice(0, antall);
}

/** Endringen som angrer en annen: legger tilbake det som ble endret/slettet, og sletter det som ble laget */
export function angreEndring(foer: Hendelse[], e: Endring): Endring {
  const slettet = new Set(e.slett);
  const endret = new Set(e.lagre.map((h) => h.id));
  return {
    lagre: foer.filter((h) => slettet.has(h.id) || endret.has(h.id) || slettet.has(h.serieId ?? '')),
    slett: e.lagre.filter((h) => !foer.some((x) => x.id === h.id)).map((h) => h.id),
  };
}
