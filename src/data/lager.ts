// Lagring: Supabase når VITE_SUPABASE_URL er satt, ellers lokal demomodus i nettleseren.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FellesDok, PrivatDok } from './modell';
import { tomtPrivatDok } from './modell';
import { demoFelles, demoPrivat } from './demo';

export interface Bruker {
  epost: string;
  navn: string;
  bilde?: string;
}

export interface Lagret<T> {
  data: T;
  /** Øker for hver lagring – brukes til å oppdage at den andre har lagret samtidig */
  versjon: number;
}

export class KonfliktFeil extends Error {
  constructor() {
    super('Budsjettet er endret et annet sted siden du åpnet det.');
  }
}

export class IkkeMedlemFeil extends Error {
  constructor(epost: string) {
    super(`${epost} har ikke tilgang til dette budsjettet.`);
  }
}

export interface Lager {
  modus: 'lokal' | 'supabase';
  hentBruker(): Promise<Bruker | null>;
  loggInn(epost?: string): Promise<void>;
  loggUt(): Promise<void>;
  hentFelles(): Promise<Lagret<FellesDok> | null>;
  lagreFelles(data: FellesDok, versjon: number): Promise<number>;
  /** personId trengs for å opprette et tomt dokument første gang */
  hentPrivat(personId: string): Promise<Lagret<PrivatDok>>;
  lagrePrivat(data: PrivatDok, versjon: number): Promise<number>;
}

// ---------------------------------------------------------------------------
// Lokal demomodus – lagrer i nettleseren (localStorage). Ingen innlogging.
// ---------------------------------------------------------------------------

const LOKAL = 'familie.v1';
/** Reserve når nettleseren blokkerer localStorage (privat modus, innebygd ramme) */
const minne = new Map<string, string>();

function les<T>(nokkel: string): T | null {
  try {
    const s = localStorage.getItem(`${LOKAL}.${nokkel}`) ?? minne.get(nokkel);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    const s = minne.get(nokkel);
    return s ? (JSON.parse(s) as T) : null;
  }
}

function skriv(nokkel: string, verdi: unknown) {
  minne.set(nokkel, JSON.stringify(verdi));
  try {
    localStorage.setItem(`${LOKAL}.${nokkel}`, JSON.stringify(verdi));
  } catch {
    /* privat modus o.l. – data lever bare i minnet */
  }
}

class LokaltLager implements Lager {
  modus = 'lokal' as const;

  async hentBruker() {
    return les<Bruker>('bruker');
  }

  async loggInn(epost?: string) {
    const dok = (await this.hentFelles())!.data;
    const person = dok.personer.find((p) => p.epost === epost) ?? dok.personer[0];
    skriv('bruker', { epost: person.epost, navn: person.navn });
  }

  async loggUt() {
    minne.delete('bruker');
    try { localStorage.removeItem(`${LOKAL}.bruker`); } catch { /* ignorer */ }
  }

  async hentFelles() {
    const lagret = les<Lagret<FellesDok>>('felles');
    if (lagret) return lagret;
    const ny = { data: demoFelles(), versjon: 1 };
    skriv('felles', ny);
    return ny;
  }

  async lagreFelles(data: FellesDok, versjon: number) {
    const naa = les<Lagret<FellesDok>>('felles');
    if (naa && naa.versjon !== versjon) throw new KonfliktFeil();
    skriv('felles', { data, versjon: versjon + 1 });
    return versjon + 1;
  }

  async hentPrivat(personId: string) {
    const lagret = les<Lagret<PrivatDok>>(`privat.${personId}`);
    if (lagret) return lagret;
    const ny = { data: personId === 'kari' || personId === 'ola' ? demoPrivat(personId) : tomtPrivatDok(personId), versjon: 1 };
    skriv(`privat.${personId}`, ny);
    return ny;
  }

  async lagrePrivat(data: PrivatDok, versjon: number) {
    const naa = les<Lagret<PrivatDok>>(`privat.${data.eierId}`);
    if (naa && naa.versjon !== versjon) throw new KonfliktFeil();
    skriv(`privat.${data.eierId}`, { data, versjon: versjon + 1 });
    return versjon + 1;
  }
}

// ---------------------------------------------------------------------------
// Supabase – innlogging med Google. Tilgangen håndheves i databasen (RLS),
// se supabase/skjema.sql. Appen kan ikke omgå den.
// ---------------------------------------------------------------------------

class SupabaseLager implements Lager {
  modus = 'supabase' as const;
  private db: SupabaseClient;

  constructor(url: string, nokkel: string) {
    this.db = createClient(url, nokkel, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
  }

  async hentBruker() {
    const { data } = await this.db.auth.getSession();
    const u = data.session?.user;
    if (!u?.email) return null;
    const { data: medlem, error } = await this.db.rpc('er_medlem');
    if (error) throw error;
    if (!medlem) {
      await this.db.auth.signOut();
      throw new IkkeMedlemFeil(u.email);
    }
    return {
      epost: u.email,
      navn: (u.user_metadata?.full_name as string | undefined) ?? u.email,
      bilde: u.user_metadata?.avatar_url as string | undefined,
    };
  }

  async loggInn() {
    const { error } = await this.db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw error;
  }

  async loggUt() {
    await this.db.auth.signOut();
  }

  async hentFelles() {
    const { data, error } = await this.db.from('felles_dok').select('data, versjon').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data ? { data: data.data as FellesDok, versjon: data.versjon as number } : null;
  }

  async lagreFelles(data: FellesDok, versjon: number) {
    if (versjon === 0) {
      const { error } = await this.db.from('felles_dok').insert({ id: 1, data, versjon: 1 });
      if (error) throw error.code === '23505' ? new KonfliktFeil() : error;
      return 1;
    }
    const { data: rader, error } = await this.db
      .from('felles_dok').update({ data, versjon: versjon + 1 }).eq('id', 1).eq('versjon', versjon).select('versjon');
    if (error) throw error;
    if (!rader?.length) throw new KonfliktFeil();
    return versjon + 1;
  }

  async hentPrivat(personId: string) {
    const { data, error } = await this.db.from('privat_dok').select('data, versjon').maybeSingle();
    if (error) throw error;
    return data ? { data: data.data as PrivatDok, versjon: data.versjon as number } : { data: tomtPrivatDok(personId), versjon: 0 };
  }

  async lagrePrivat(data: PrivatDok, versjon: number) {
    if (versjon === 0) {
      const { error } = await this.db.from('privat_dok').insert({ data, versjon: 1 });
      if (error) throw error.code === '23505' ? new KonfliktFeil() : error;
      return 1;
    }
    const { data: rader, error } = await this.db
      .from('privat_dok').update({ data, versjon: versjon + 1 }).eq('versjon', versjon).select('versjon');
    if (error) throw error;
    if (!rader?.length) throw new KonfliktFeil();
    return versjon + 1;
  }
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const nokkel = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const lager: Lager = url && nokkel ? new SupabaseLager(url, nokkel) : new LokaltLager();
