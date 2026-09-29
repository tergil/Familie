// Henter utgifter og saldoer for oppfølgingen. Oppdateres når noe lagres, og når appen
// får fokus igjen (så du ser det den andre har ført).
import { useCallback, useEffect, useState } from 'react';
import type { Saldo, Utgift } from './modell';
import { OPPFOLGING_ENDRET, lager } from './lager';
import { dagerIMaaned, flyttMaaned } from '../logikk/oppfolging';

export interface OppfolgingData {
  /** Utgifter i valgt måned og forrige (forrige brukes til sammenligning) */
  utgifter: Utgift[];
  saldoer: Saldo[];
  laster: boolean;
  feil: string | null;
  lastPaaNytt: () => void;
}

export function useOppfolging(maaned: string): OppfolgingData {
  const [utgifter, setUtgifter] = useState<Utgift[]>([]);
  const [saldoer, setSaldoer] = useState<Saldo[]>([]);
  const [laster, setLaster] = useState(true);
  const [feil, setFeil] = useState<string | null>(null);

  const last = useCallback(async () => {
    try {
      const fra = `${flyttMaaned(maaned, -1)}-01`;
      const til = `${maaned}-${String(dagerIMaaned(maaned)).padStart(2, '0')}`;
      const [u, s] = await Promise.all([lager.hentUtgifter(fra, til), lager.hentSaldoer()]);
      setUtgifter(u);
      setSaldoer(s);
      setFeil(null);
    } catch (e) {
      console.error(e);
      setFeil(e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e));
    } finally {
      setLaster(false);
    }
  }, [maaned]);

  useEffect(() => {
    setLaster(true);
    void last();
    const synlig = () => { if (document.visibilityState === 'visible') void last(); };
    window.addEventListener(OPPFOLGING_ENDRET, last);
    document.addEventListener('visibilitychange', synlig);
    return () => {
      window.removeEventListener(OPPFOLGING_ENDRET, last);
      document.removeEventListener('visibilitychange', synlig);
    };
  }, [last]);

  return { utgifter, saldoer, laster, feil, lastPaaNytt: () => void last() };
}
