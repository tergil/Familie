// Kalenderavtalene i minnet, delt av Kalender-siden og kortet på Oversikt.
// Endringer vises med en gang og lagres i bakgrunnen. Hentes på nytt når appen får fokus.
import { useEffect, useSyncExternalStore } from 'react';
import type { Hendelse } from './modell';
import { lager } from './lager';

export interface KalenderData {
  hendelser: Hendelse[];
  lastet: boolean;
  feil: string | null;
}

let data: KalenderData = { hendelser: [], lastet: false, feil: null };
const lyttere = new Set<() => void>();
let henter: Promise<void> | null = null;
let ventende = 0;
let hentEtterpaa = false;

function sett(endring: Partial<KalenderData>) {
  data = { ...data, ...endring };
  lyttere.forEach((f) => f());
}

const feiltekst = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e));

export function lastKalender(): Promise<void> {
  if (henter) return henter;
  henter = (async () => {
    try {
      const hendelser = await lager.hentHendelser();
      if (ventende > 0) hentEtterpaa = true;
      else sett({ hendelser, lastet: true, feil: null });
    } catch (e) {
      console.error(e);
      sett({ feil: feiltekst(e), lastet: true });
    } finally {
      henter = null;
    }
  })();
  return henter;
}

/** Lagrer og sletter i én operasjon (f.eks. «denne og fremover» som både endrer og lager ny serie) */
export async function endreKalender(endring: { lagre: Hendelse[]; slett: string[] }): Promise<boolean> {
  const slett = new Set(endring.slett);
  const forrige = data.hendelser;
  const lagre = new Map(endring.lagre.map((h) => [h.id, h]));
  sett({ hendelser: [...forrige.filter((h) => !slett.has(h.id) && !slett.has(h.serieId ?? '') && !lagre.has(h.id)), ...endring.lagre] });
  ventende++;
  try {
    // Nye/endrede først, så slettinger (en ny serie kan overta unntak fra den gamle)
    await lager.lagreHendelser(endring.lagre);
    await lager.slettHendelser(endring.slett);
    return true;
  } catch (e) {
    console.error(e);
    sett({ feil: feiltekst(e) });
    hentEtterpaa = true;
    return false;
  } finally {
    ventende--;
    if (ventende === 0 && hentEtterpaa) { hentEtterpaa = false; void lastKalender(); }
  }
}

export const lukkKalenderFeil = () => sett({ feil: null });

function lytt(f: () => void) {
  lyttere.add(f);
  return () => { lyttere.delete(f); };
}

export function useKalender(): KalenderData & { forrige: () => Hendelse[] } {
  const d = useSyncExternalStore(lytt, () => data);
  useEffect(() => {
    if (!data.lastet) void lastKalender();
    const synlig = () => { if (document.visibilityState === 'visible') void lastKalender(); };
    document.addEventListener('visibilitychange', synlig);
    return () => document.removeEventListener('visibilitychange', synlig);
  }, []);
  return { ...d, forrige: () => data.hendelser };
}
