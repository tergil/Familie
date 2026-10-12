// Huskelistene i minnet, delt av alle sider (Lister, huskelappen på Oversikt).
// Endringer vises med en gang og lagres i bakgrunnen. Hentes på nytt når appen får fokus,
// så du ser det den andre har lagt til.
import { useEffect, useSyncExternalStore } from 'react';
import type { Liste, Punkt } from './modell';
import { lager } from './lager';

export interface ListeData {
  lister: Liste[];
  punkter: Punkt[];
  lastet: boolean;
  feil: string | null;
}

let data: ListeData = { lister: [], punkter: [], lastet: false, feil: null };
const lyttere = new Set<() => void>();
let henter: Promise<void> | null = null;
/** Lagringer som ikke er ferdige. En henting midt i en lagring kan gi gamle data – da hentes det på nytt etterpå. */
let ventende = 0;
let hentEtterpaa = false;

function sett(endring: Partial<ListeData>) {
  data = { ...data, ...endring };
  lyttere.forEach((f) => f());
}

function feiltekst(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
}

export function lastLister(): Promise<void> {
  if (henter) return henter;
  henter = (async () => {
    try {
      const svar = await lager.hentLister();
      if (ventende > 0) hentEtterpaa = true;
      else sett({ ...svar, lastet: true, feil: null });
    } catch (e) {
      console.error(e);
      sett({ feil: feiltekst(e), lastet: true });
    } finally {
      henter = null;
    }
  })();
  return henter;
}

/** Oppdaterer skjermen med en gang, lagrer i bakgrunnen. Ved feil vises feilen og alt hentes på nytt. */
async function utfor(lokalt: (d: ListeData) => Partial<ListeData>, lagre: () => Promise<void>): Promise<boolean> {
  sett(lokalt(data));
  ventende++;
  try {
    await lagre();
    return true;
  } catch (e) {
    console.error(e);
    sett({ feil: feiltekst(e) });
    hentEtterpaa = true;
    return false;
  } finally {
    ventende--;
    if (ventende === 0 && hentEtterpaa) {
      hentEtterpaa = false;
      void lastLister();
    }
  }
}

const erstatt = <T extends { id: string }>(liste: T[], nye: T[]) => {
  const ider = new Set(nye.map((x) => x.id));
  return [...liste.filter((x) => !ider.has(x.id)), ...nye];
};

export const listeLager = {
  lagreListe: (l: Liste) => utfor((d) => ({ lister: erstatt(d.lister, [l]) }), () => lager.lagreListe(l)),

  /** Ny liste med punkter (fra mal eller kopi) */
  opprett: (l: Liste, punkter: Punkt[]) => utfor(
    (d) => ({ lister: [...d.lister, l], punkter: [...d.punkter, ...punkter] }),
    async () => { await lager.lagreListe(l); await lager.lagrePunkter(punkter); },
  ),

  /** Sletter listen. Returnerer en funksjon som legger den tilbake (angre). */
  slettListe: (l: Liste) => {
    const punkter = data.punkter.filter((p) => p.listeId === l.id);
    void utfor((d) => ({ lister: d.lister.filter((x) => x.id !== l.id), punkter: d.punkter.filter((p) => p.listeId !== l.id) }), () => lager.slettListe(l.id));
    return () => listeLager.opprett(l, punkter);
  },

  lagrePunkter: (punkter: Punkt[]) => utfor((d) => ({ punkter: erstatt(d.punkter, punkter) }), () => lager.lagrePunkter(punkter)),

  /** Sletter punktet og underpunktene. Returnerer angre-funksjon. */
  slettPunkt: (p: Punkt) => {
    const borte = data.punkter.filter((x) => x.id === p.id || x.forelderId === p.id);
    const ider = new Set(borte.map((x) => x.id));
    void utfor((d) => ({ punkter: d.punkter.filter((x) => !ider.has(x.id)) }), () => lager.slettPunkter([p.id]));
    return () => listeLager.lagrePunkter(borte);
  },

  lukkFeil: () => sett({ feil: null }),
};

function lytt(f: () => void) {
  lyttere.add(f);
  return () => { lyttere.delete(f); };
}

export function useLister(): ListeData {
  const d = useSyncExternalStore(lytt, () => data);
  useEffect(() => {
    if (!data.lastet) void lastLister();
    const synlig = () => { if (document.visibilityState === 'visible') void lastLister(); };
    document.addEventListener('visibilitychange', synlig);
    return () => document.removeEventListener('visibilitychange', synlig);
  }, []);
  return d;
}
