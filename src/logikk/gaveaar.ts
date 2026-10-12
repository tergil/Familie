// Gaveår: faste mottakere med anledninger (bursdag, jul, morsdag, farsdag, egne), idébank og budsjett.
// Mottakeren er et hovedpunkt i en liste av typen «gaveaar», gavene og ideene er underpunktene.
// Ren logikk uten React – testes i scripts/test-beregning.ts.
import type { Anledning, AnledningType, Id, Liste, Punkt, Vedlegg } from '../data/modell';
import { nyId } from '../data/modell';
import { dagerMellom, erBrukt, nyttPunkt } from './lister';

export const ANLEDNING_NAVN: Record<AnledningType, string> = {
  bursdag: 'Bursdag', jul: 'Jul', morsdag: 'Morsdag', farsdag: 'Farsdag', egen: 'Annen anledning',
};

export const ANLEDNING_IKON: Record<AnledningType, string> = {
  bursdag: '🎂', jul: '🎄', morsdag: '💐', farsdag: '👔', egen: '🎉',
};

/** Samlede planer på tvers av gaveårene: jul, bursdager og «andre» (alt annet enn jul og bursdag) */
export type PlanType = 'jul' | 'bursdag' | 'andre';
export const PLAN_TYPER: PlanType[] = ['jul', 'bursdag', 'andre'];
export const PLAN_NAVN: Record<PlanType, string> = { jul: 'Jul', bursdag: 'Bursdager', andre: 'Andre' };
export const PLAN_IKON: Record<PlanType, string> = { jul: '🎄', bursdag: '🎂', andre: '🎉' };

/** Gamle lenker (morsdag, farsdag) havner under «andre» */
export function tilPlanType(t: string | undefined): PlanType {
  return t === 'jul' || t === 'bursdag' ? t : t ? 'andre' : 'jul';
}

/** Hører anledningen til planen? */
export function iPlan(type: PlanType, a: Anledning): boolean {
  return type === 'andre' ? a.type !== 'jul' && a.type !== 'bursdag' : a.type === type;
}

/** Alderen personen fyller på datoen (fødselsdato ÅÅÅÅ-MM-DD) */
export function alder(fodt: string | undefined, dato: string): number | undefined {
  if (!fodt || !/^\d{4}-\d{2}-\d{2}$/.test(fodt)) return undefined;
  const aar = Number(dato.slice(0, 4)) - Number(fodt.slice(0, 4)) - (dato.slice(5) < fodt.slice(5) ? 1 : 0);
  return aar >= 0 ? aar : undefined;
}

/** Runde dager: 10, 20, 30 … */
export const rundDag = (a: number | undefined) => !!a && a >= 10 && a % 10 === 0;

const pad = (n: number) => String(n).padStart(2, '0');

/** Andre søndag i måneden (morsdag i februar, farsdag i november) */
export function andreSondag(aar: number, maaned: number): string {
  const ukedag = new Date(Date.UTC(aar, maaned - 1, 1)).getUTCDay(); // 0 = søndag
  return `${aar}-${pad(maaned)}-${pad(1 + ((7 - ukedag) % 7) + 7)}`;
}

/** Datoen anledningen faller på i året, eller null (mangler dato, eller én gang i et annet år) */
export function anledningsDato(a: Anledning, aar: number): string | null {
  if (a.aar && a.aar !== aar) return null;
  switch (a.type) {
    case 'jul': return `${aar}-12-24`;
    case 'morsdag': return andreSondag(aar, 2);
    case 'farsdag': return andreSondag(aar, 11);
    default: return a.dag ? `${aar}-${a.dag}` : null;
  }
}

export function anledningsNavn(a: Anledning): string {
  return a.type === 'egen' ? a.navn?.trim() || ANLEDNING_NAVN.egen : ANLEDNING_NAVN[a.type];
}

export function nyAnledning(type: AnledningType, ekstra: Partial<Anledning> = {}): Anledning {
  return { id: nyId(), type, ...ekstra };
}

export const anledningsNokkel = (a: Anledning, aar: number) => `${a.id}:${aar}`;

/** Gavelistene som er gaveår (ikke maler) */
export const gaveaar = (lister: Liste[]) => lister.filter((l) => !l.mal && l.type === 'gaveaar');

/** Mottakerne i et gaveår: hovedpunktene */
export const mottakere = (listeId: Id, punkter: Punkt[]) =>
  punkter.filter((p) => p.listeId === listeId && !p.forelderId).sort((a, b) => a.rekkefolge - b.rekkefolge);

/** Gaver og ideer til en mottaker */
export const gaverTil = (mottakerId: Id, punkter: Punkt[]) =>
  punkter.filter((p) => p.forelderId === mottakerId).sort((a, b) => a.rekkefolge - b.rekkefolge);

// ---------------------------------------------------------------- Tidslinje (årshjulet)

export interface Forekomst {
  liste: Liste;
  mottaker: Punkt;
  anledning: Anledning;
  aar: number;
  dato: string;
  /** Dager til datoen fra i dag */
  dager: number;
  /** «<anledning-id>:<år>» */
  nokkel: string;
  /** Gaver valgt til akkurat denne gangen */
  gaver: Punkt[];
  /** Ideer i idébanken til mottakeren */
  ideer: number;
  /** Bursdag med kjent fødselsdato: alderen personen fyller */
  alder?: number;
}

/** Alle anledninger de neste 12 månedene (fra i dag), sortert på dato */
export function forekomster(lister: Liste[], punkter: Punkt[], iDag: string, dagerFrem = 365): Forekomst[] {
  const iAar = Number(iDag.slice(0, 4));
  const ut: Forekomst[] = [];
  for (const liste of gaveaar(lister)) {
    for (const mottaker of mottakere(liste.id, punkter)) {
      const alle = gaverTil(mottaker.id, punkter);
      const ideer = alle.filter((g) => !g.anledning && !erBrukt('gaveaar', g.status)).length;
      for (const anledning of mottaker.anledninger ?? []) {
        for (const aar of [iAar, iAar + 1]) {
          const dato = anledningsDato(anledning, aar);
          if (!dato) continue;
          const dager = dagerMellom(iDag, dato);
          if (dager < 0 || dager > dagerFrem) continue;
          const nokkel = anledningsNokkel(anledning, aar);
          ut.push({
            liste, mottaker, anledning, aar, dato, dager, nokkel, gaver: alle.filter((g) => g.anledning === nokkel), ideer,
            alder: anledning.type === 'bursdag' ? alder(mottaker.fodt, dato) : undefined,
          });
        }
      }
    }
  }
  return ut.sort((a, b) => a.dato.localeCompare(b.dato) || a.mottaker.tekst.localeCompare(b.mottaker.tekst, 'nb'));
}

/** Anledninger innen fristen (3 uker) der ingen gave er kjøpt ennå – til huskelappen */
export function gaveVarsler(lister: Liste[], punkter: Punkt[], iDag: string, dager = 21): Forekomst[] {
  return forekomster(lister, punkter, iDag, dager).filter((f) => !f.gaver.some((g) => erBrukt('gaveaar', g.status)));
}

/** Neste dato for anledningen fra i dag (i år eller neste år) */
export function nesteDato(a: Anledning, iDag: string): string | null {
  const aar = Number(iDag.slice(0, 4));
  for (const x of [aar, aar + 1]) {
    const d = anledningsDato(a, x);
    if (d && d >= iDag) return d;
  }
  return null;
}

/** Valgene i «Til anledning» for en gave: kommende ganger for mottakerens anledninger */
export function anledningsValg(mottaker: Punkt, iDag: string): { nokkel: string; tekst: string; dato: string }[] {
  const aar = Number(iDag.slice(0, 4));
  const ut: { nokkel: string; tekst: string; dato: string }[] = [];
  for (const a of mottaker.anledninger ?? []) {
    for (const x of [aar, aar + 1]) {
      const dato = anledningsDato(a, x);
      if (dato && dato >= iDag) ut.push({ nokkel: anledningsNokkel(a, x), tekst: `${anledningsNavn(a)} ${x}`, dato });
    }
  }
  return ut.sort((a, b) => a.dato.localeCompare(b.dato));
}

/**
 * En gave som blir kjøpt eller gitt uten anledning, kobles til mottakerens neste anledning.
 * Da blir den med på bursdagen/julen (og vises som kjøpt der) i stedet for å forsvinne. Kan endres etterpå.
 */
export function medAutoAnledning(gave: Punkt, mottaker: Punkt | undefined, iDag: string): Punkt {
  if (gave.anledning || !mottaker || !erBrukt('gaveaar', gave.status)) return gave;
  const neste = anledningsValg(mottaker, iDag)[0];
  return neste ? { ...gave, anledning: neste.nokkel } : gave;
}

/** Teksten for en anledningsnøkkel, også for tidligere år («Jul 2025») */
export function nokkelTekst(mottaker: Punkt | undefined, nokkel: string): string {
  const [id, aar] = nokkel.split(':');
  const a = mottaker?.anledninger?.find((x) => x.id === id);
  return a ? `${anledningsNavn(a)} ${aar}` : `Anledning ${aar ?? ''}`.trim();
}

// ---------------------------------------------------------------- Plan for én anledning (Juleplan osv.)

export interface PlanDel {
  liste: Liste;
  mottaker: Punkt;
  anledning: Anledning;
  /** Gaver valgt til denne gangen */
  gaver: Punkt[];
  /** Idébanken til mottakeren */
  ideer: Punkt[];
}

export interface PlanPerson {
  navn: string;
  /** Anledningen, f.eks. «Bursdag» eller «Konfirmasjon» */
  tittel: string;
  type: AnledningType;
  dato: string;
  /** Bursdag med kjent fødselsdato */
  alder?: number;
  deler: PlanDel[];
}

/**
 * Alle mottakere med anledninger i planen dette året, fra alle gaveårene du ser.
 * Samme person og anledning i felles og privat gaveår slås sammen.
 * Jul sorteres på navn (samme dag for alle), bursdager og andre på dato.
 */
export function anledningsPlan(lister: Liste[], punkter: Punkt[], type: PlanType, aar: number): PlanPerson[] {
  const per = new Map<string, PlanPerson>();
  for (const liste of gaveaar(lister)) {
    for (const mottaker of mottakere(liste.id, punkter)) {
      const alle = gaverTil(mottaker.id, punkter);
      for (const anledning of mottaker.anledninger ?? []) {
        const dato = iPlan(type, anledning) ? anledningsDato(anledning, aar) : null;
        if (!dato) continue;
        const navn = mottaker.tekst.trim();
        const nokkel = `${navn.toLocaleLowerCase('nb')}|${anledningsNavn(anledning).toLocaleLowerCase('nb')}`;
        if (!per.has(nokkel)) per.set(nokkel, { navn, tittel: anledningsNavn(anledning), type: anledning.type, dato, deler: [] });
        const rad = per.get(nokkel)!;
        if (anledning.type === 'bursdag') rad.alder ??= alder(mottaker.fodt, dato);
        rad.deler.push({
          liste, mottaker, anledning,
          gaver: alle.filter((g) => g.anledning === anledningsNokkel(anledning, aar)),
          ideer: alle.filter((g) => !g.anledning && !erBrukt('gaveaar', g.status)),
        });
      }
    }
  }
  return [...per.values()].sort((a, b) => (type === 'jul' ? 0 : a.dato.localeCompare(b.dato)) || a.navn.localeCompare(b.navn, 'nb'));
}

export interface Pott {
  /** 'felles' eller person-id */
  id: string;
  planlagt: number;
  brukt: number;
  antall: number;
}

/**
 * Hvem som betaler hva: private gaveår teller på eieren (deg), felles gaveår på «felles»,
 * med mindre gaven er merket «Betales av» en person.
 */
export function potter(plan: PlanPerson[], megId: Id | undefined): Pott[] {
  const map = new Map<string, Pott>();
  for (const d of plan.flatMap((p) => p.deler)) {
    for (const g of d.gaver) {
      const id = d.liste.privat ? megId ?? 'meg' : g.betaler ?? 'felles';
      if (!map.has(id)) map.set(id, { id, planlagt: 0, brukt: 0, antall: 0 });
      const pott = map.get(id)!;
      pott.antall++;
      if (erBrukt('gaveaar', g.status)) pott.brukt += g.belop ?? 0;
      else pott.planlagt += g.belop ?? 0;
    }
  }
  return [...map.values()];
}

/** Sum av personbudsjettene for anledningen i én liste */
export function personbudsjett(plan: PlanPerson[], listeId: Id): number {
  return plan.flatMap((p) => p.deler).filter((d) => d.liste.id === listeId).reduce((s, d) => s + (d.anledning.budsjett ?? 0), 0);
}

/** «Juleplan 2026», «Bursdager 2026», «Andre anledninger 2026» */
export function planTittel(type: PlanType, aar: number | string): string {
  return type === 'jul' ? `Juleplan ${aar}` : type === 'bursdag' ? `Bursdager ${aar}` : `Andre anledninger ${aar}`;
}

export const planNokkel = (type: PlanType, aar: number) => `${type}:${aar}`;

// ---------------------------------------------------------------- Flytte gamle gavelister inn i gaveåret

export interface Flytting {
  /** Nye mottakere og endrede (fikk jul som anledning) */
  mottakere: Punkt[];
  gaver: Punkt[];
  /** Vedlegg som må kopieres til ny sti */
  vedlegg: { fra: string; til: string }[];
  /** Gavelistene som er flyttet og kan slettes */
  flyttet: Liste[];
}

/**
 * Flytter gavelister (type «gave») inn i gaveårene: private til ditt private gaveår, felles til det felles.
 * Mottakeren finnes eller opprettes. Lister med «jul» i navnet gir anledningen Jul for året i navnet.
 */
export function flyttGavelister(lister: Liste[], punkter: Punkt[], maal: { felles?: Liste; privat?: Liste }): Flytting {
  const ut: Flytting = { mottakere: [], gaver: [], vedlegg: [], flyttet: [] };
  // Mottakere per gaveår (eksisterende + nye), nøkkel = navn med små bokstaver
  const register = new Map<string, Map<string, Punkt>>();
  const hent = (liste: Liste) => {
    if (!register.has(liste.id)) register.set(liste.id, new Map(mottakere(liste.id, punkter).map((m) => [m.tekst.trim().toLocaleLowerCase('nb'), m])));
    return register.get(liste.id)!;
  };
  let rekkefolge = punkter.reduce((m, p) => Math.max(m, p.rekkefolge), 0);

  for (const gammel of lister.filter((l) => !l.mal && l.type === 'gave')) {
    const til = gammel.privat ? maal.privat : maal.felles;
    if (!til) continue;
    const aar = Number(gammel.navn.match(/\b(20\d\d)\b/)?.[1] ?? gammel.opprettet.slice(0, 4));
    const erJul = /jul/i.test(gammel.navn);
    const reg = hent(til);
    const fra = punkter.filter((p) => p.listeId === gammel.id);
    for (const p of fra) {
      // Underpunkter i gavelister får mottakeren til hovedpunktet
      const forelder = p.forelderId ? fra.find((x) => x.id === p.forelderId) : undefined;
      const navn = (p.mottaker ?? forelder?.mottaker)?.trim() || 'Uten mottaker';
      const nokkel = navn.toLocaleLowerCase('nb');
      let m = reg.get(nokkel);
      if (!m) {
        m = { ...nyttPunkt(til.id, 'gaveaar', navn, ++rekkefolge), anledninger: [] };
        reg.set(nokkel, m);
      }
      let jul = m.anledninger?.find((a) => a.type === 'jul');
      if (erJul && !jul) {
        jul = nyAnledning('jul');
        m = { ...m, anledninger: [...(m.anledninger ?? []), jul] };
        reg.set(nokkel, m);
      }
      const id = nyId();
      const vedlegg: Vedlegg[] | undefined = p.vedlegg?.map((v) => {
        const sti = `${til.id}/${id}/${v.sti.split('/').pop()}`;
        ut.vedlegg.push({ fra: v.sti, til: sti });
        return { ...v, sti };
      });
      ut.gaver.push({
        ...p, id, listeId: til.id, forelderId: m.id, mottaker: undefined, rekkefolge: ++rekkefolge, vedlegg,
        anledning: erJul && jul ? anledningsNokkel(jul, aar) : undefined,
      });
    }
    ut.flyttet.push(gammel);
  }
  // Mottakere som er nye eller har fått ny anledning
  const foer = new Map(punkter.map((p) => [p.id, p]));
  for (const reg of register.values()) for (const m of reg.values()) if (foer.get(m.id) !== m) ut.mottakere.push(m);
  return ut;
}
