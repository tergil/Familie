// Felles tilstand for hele appen: innlogget bruker, dokumentene, lagring og angre.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FellesDok, Person, PrivatDok, PrivatRevisjon, Revisjon } from './modell';
import { KonfliktFeil, lager, type Bruker, type Lagret } from './lager';
import { aktivRevisjon, iDag } from '../logikk/beregning';

export type LagreStatus = 'lagret' | 'lagrer' | 'feil' | 'konflikt';

interface Toast {
  tekst: string;
  angre?: () => void;
}

interface Tilstand {
  bruker: Bruker | null;
  felles: FellesDok | null;
  privat: PrivatDok | null;
  meg: Person | undefined;
  status: LagreStatus;
  /** Valgt revisjon i fellesbudsjettet */
  rev: Revisjon | undefined;
  velgRev: (id: string) => void;
  /** Valgt revisjon i privatbudsjettet */
  prev: PrivatRevisjon | undefined;
  velgPrev: (id: string) => void;
  /** Fellesrevisjonen som gjelder for valgt privatrevisjon */
  revForPrivat: Revisjon | undefined;
  /** Endre fellesbudsjettet. Med angreTekst vises en «Angre»-toast. */
  endreFelles: (endring: (d: FellesDok) => void, angreTekst?: string) => void;
  endrePrivat: (endring: (d: PrivatDok) => void, angreTekst?: string) => void;
  erstattFelles: (d: FellesDok) => void;
  erstattPrivat: (d: PrivatDok) => void;
  lastPaaNytt: () => Promise<void>;
  loggUt: () => Promise<void>;
  toast: Toast | null;
  visToast: (t: Toast | null) => void;
}

const Kontekst = createContext<Tilstand | null>(null);

export function useTilstand(): Tilstand {
  const t = useContext(Kontekst);
  if (!t) throw new Error('useTilstand må brukes inne i <TilstandGiver>');
  return t;
}

/** Holder ett dokument synkronisert med lageret: én lagring om gangen, alltid siste versjon. */
function useDokument<T>(lagre: (d: T, v: number) => Promise<number>, settStatus: (s: LagreStatus) => void) {
  const [dok, setDok] = useState<T | null>(null);
  const versjon = useRef(0);
  const venter = useRef<T | null>(null);
  const lagrer = useRef(false);

  const kjor = useCallback(async () => {
    if (lagrer.current || venter.current === null) return;
    lagrer.current = true;
    settStatus('lagrer');
    try {
      while (venter.current !== null) {
        const data = venter.current;
        venter.current = null;
        versjon.current = await lagre(data, versjon.current);
      }
      settStatus('lagret');
    } catch (e) {
      console.error(e);
      settStatus(e instanceof KonfliktFeil ? 'konflikt' : 'feil');
    } finally {
      lagrer.current = false;
    }
  }, [lagre, settStatus]);

  const sett = useCallback((d: T) => {
    setDok(d);
    venter.current = d;
    void kjor();
  }, [kjor]);

  const last = useCallback((l: Lagret<T> | null) => {
    versjon.current = l?.versjon ?? 0;
    venter.current = null;
    setDok(l?.data ?? null);
  }, []);

  return { dok, sett, last };
}

export function TilstandGiver({ bruker, children }: { bruker: Bruker; children: ReactNode }) {
  const [status, setStatus] = useState<LagreStatus>('lagret');
  const [toast, visToast] = useState<Toast | null>(null);
  const [lastet, setLastet] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const [revId, velgRev] = useState<string | null>(null);
  const [prevId, velgPrev] = useState<string | null>(null);

  const lagreFelles = useCallback((d: FellesDok, v: number) => lager.lagreFelles(d, v), []);
  const lagrePrivat = useCallback((d: PrivatDok, v: number) => lager.lagrePrivat(d, v), []);
  const felles = useDokument<FellesDok>(lagreFelles, setStatus);
  const privat = useDokument<PrivatDok>(lagrePrivat, setStatus);

  const meg = felles.dok?.personer.find((p) => p.epost.toLowerCase() === bruker.epost.toLowerCase());

  const lastPaaNytt = useCallback(async () => {
    try {
      const f = await lager.hentFelles();
      felles.last(f);
      const person = f?.data.personer.find((p) => p.epost.toLowerCase() === bruker.epost.toLowerCase());
      privat.last(person ? await lager.hentPrivat(person.id) : null);
      setStatus('lagret');
      setLastet(true);
    } catch (e) {
      console.error(e);
      setFeil(e instanceof Error ? e.message : String(e));
    }
  }, [bruker.epost, felles.last, privat.last]);

  useEffect(() => { void lastPaaNytt(); }, [lastPaaNytt]);

  // Når personen først dukker opp (f.eks. etter import), hent privatbudsjettet
  const megId = meg?.id;
  const harPrivat = privat.dok !== null;
  useEffect(() => {
    if (lastet && megId && !harPrivat) lager.hentPrivat(megId).then(privat.last).catch(console.error);
  }, [lastet, megId, harPrivat, privat.last]);

  const felledok = felles.dok;
  const privdok = privat.dok;

  const rev = useMemo(() => {
    if (!felledok) return undefined;
    return felledok.revisjoner.find((r) => r.id === revId) ?? aktivRevisjon(felledok.revisjoner, iDag());
  }, [felledok, revId]);

  const prev = useMemo(() => {
    if (!privdok) return undefined;
    return privdok.revisjoner.find((r) => r.id === prevId) ?? aktivRevisjon(privdok.revisjoner, iDag());
  }, [privdok, prevId]);

  const revForPrivat = useMemo(() => {
    if (!felledok) return undefined;
    return aktivRevisjon(felledok.revisjoner, prev?.gjelderFra ?? iDag());
  }, [felledok, prev]);

  const endreFelles = useCallback((endring: (d: FellesDok) => void, angreTekst?: string) => {
    if (!felledok) return;
    const for_ = felledok;
    const ny = structuredClone(felledok);
    endring(ny);
    felles.sett(ny);
    if (angreTekst) visToast({ tekst: angreTekst, angre: () => { felles.sett(for_); visToast(null); } });
  }, [felledok, felles]);

  const endrePrivat = useCallback((endring: (d: PrivatDok) => void, angreTekst?: string) => {
    if (!privdok) return;
    const for_ = privdok;
    const ny = structuredClone(privdok);
    endring(ny);
    privat.sett(ny);
    if (angreTekst) visToast({ tekst: angreTekst, angre: () => { privat.sett(for_); visToast(null); } });
  }, [privdok, privat]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => visToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const verdi: Tilstand = {
    bruker, felles: felledok, privat: privdok, meg, status,
    rev, velgRev, prev, velgPrev, revForPrivat,
    endreFelles, endrePrivat,
    erstattFelles: felles.sett, erstattPrivat: privat.sett,
    lastPaaNytt, loggUt: async () => { await lager.loggUt(); location.reload(); },
    toast, visToast,
  };

  if (feil) {
    return (
      <div className="laster"><div className="banner feil" style={{ maxWidth: 480 }}><div><strong>Kunne ikke laste budsjettet</strong><p>{feil}</p></div></div></div>
    );
  }
  if (!lastet) return <div className="laster"><div className="spinner" aria-label="Laster" /></div>;
  return <Kontekst.Provider value={verdi}>{children}</Kontekst.Provider>;
}
