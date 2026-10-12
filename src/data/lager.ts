// Lagring: Supabase når VITE_SUPABASE_URL er satt, ellers lokal demomodus i nettleseren.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DeltListe, FellesDok, Liste, Punkt, PrivatDok, Saldo, Utgift } from './modell';
import { tomtPrivatDok } from './modell';
import { demoFelles, demoLister, demoOppfolging, demoPrivat } from './demo';

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

  // Oppfølging – egne tabeller, én rad per utgift/saldo (ingen konflikt når begge fører samtidig)
  /** Felles + egne private utgifter i perioden (ÅÅÅÅ-MM-DD, inklusive) */
  hentUtgifter(fra: string, til: string): Promise<Utgift[]>;
  /** Oppretter eller oppdaterer (etter id) */
  lagreUtgift(u: Utgift): Promise<void>;
  slettUtgift(id: string): Promise<void>;
  /** Alle synlige saldoer (felles + egne private) */
  hentSaldoer(): Promise<Saldo[]>;
  lagreSaldo(s: Saldo): Promise<void>;
  slettSaldo(id: string): Promise<void>;

  // Huskelister – egne tabeller. Private lister (og punktene i dem) ser bare eieren.
  /** Felles + egne private lister med alle punkter */
  hentLister(): Promise<{ lister: Liste[]; punkter: Punkt[] }>;
  /** Oppretter eller oppdaterer (etter id) */
  lagreListe(l: Liste): Promise<void>;
  /** Sletter listen og alle punktene i den */
  slettListe(id: string): Promise<void>;
  lagrePunkter(p: Punkt[]): Promise<void>;
  /** Sletter punktene og underpunktene deres */
  slettPunkter(ider: string[]): Promise<void>;
  /** Delt liste via lenke – virker uten innlogging. null = lenken finnes ikke (eller er slått av). */
  hentDeltListe(nokkel: string): Promise<DeltListe | null>;

  // Vedlegg (bilder og PDF) – Supabase Storage, samme tilgang som listen
  lastOppVedlegg(sti: string, fil: Blob, type: string): Promise<void>;
  /** Midlertidig adresse til filen (gyldig en time) */
  vedleggUrl(sti: string): Promise<string>;
  slettVedlegg(stier: string[]): Promise<void>;
}

/** Varsler sider som viser utgifter/saldoer om at noe er endret */
export const OPPFOLGING_ENDRET = 'familie:oppfolging-endret';
export function varsleOppfolgingEndret() {
  window.dispatchEvent(new Event(OPPFOLGING_ENDRET));
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

  // Lokalt lagres eierens e-post på private rader, og bare egne vises
  private megEpost() {
    return les<Bruker>('bruker')?.epost ?? '';
  }

  private rader<T extends { privat: boolean; fortAv: string }>(nokkel: 'utgifter' | 'saldoer'): (T & { eier: string | null })[] {
    let alle = les<(T & { eier: string | null })[]>(nokkel);
    if (!alle) {
      const demo = demoOppfolging();
      skriv('utgifter', demo.utgifter);
      skriv('saldoer', demo.saldoer);
      alle = les<(T & { eier: string | null })[]>(nokkel) ?? [];
    }
    return alle;
  }

  private synlig<T extends { privat: boolean }>(r: T & { eier: string | null }) {
    return !r.privat || r.eier === this.megEpost();
  }

  private lagreRad<T extends { id: string; privat: boolean }>(nokkel: 'utgifter' | 'saldoer', rad: T, fortAv: string) {
    const alle = this.rader<T & { fortAv: string }>(nokkel);
    const i = alle.findIndex((x) => x.id === rad.id);
    const ny = { ...rad, fortAv: i >= 0 ? alle[i].fortAv : fortAv, eier: rad.privat ? this.megEpost() : null };
    if (i >= 0) alle[i] = ny; else alle.push(ny);
    skriv(nokkel, alle);
  }

  async hentUtgifter(fra: string, til: string) {
    return this.rader<Utgift>('utgifter').filter((u) => this.synlig(u) && u.dato >= fra && u.dato <= til)
      .map(({ eier: _e, ...u }) => u as Utgift);
  }

  async lagreUtgift(u: Utgift) {
    this.lagreRad('utgifter', u, this.megEpost());
  }

  async slettUtgift(id: string) {
    skriv('utgifter', this.rader<Utgift>('utgifter').filter((u) => u.id !== id));
  }

  async hentSaldoer() {
    return this.rader<Saldo>('saldoer').filter((x) => this.synlig(x)).map(({ eier: _e, ...x }) => x as Saldo);
  }

  async lagreSaldo(x: Saldo) {
    this.lagreRad('saldoer', x, this.megEpost());
  }

  async slettSaldo(id: string) {
    skriv('saldoer', this.rader<Saldo>('saldoer').filter((x) => x.id !== id));
  }

  private alleLister(): { lister: (Liste & { eier: string | null })[]; punkter: Punkt[] } {
    let lister = les<(Liste & { eier: string | null })[]>('lister');
    let punkter = les<Punkt[]>('listepunkter');
    if (!lister || !punkter) {
      ({ lister, punkter } = demoLister());
      skriv('lister', lister);
      skriv('listepunkter', punkter);
    }
    return { lister, punkter };
  }

  async hentLister() {
    const { lister, punkter } = this.alleLister();
    const synlige = lister.filter((l) => this.synlig(l));
    const ider = new Set(synlige.map((l) => l.id));
    return { lister: synlige.map(({ eier: _e, ...l }) => l as Liste), punkter: punkter.filter((p) => ider.has(p.listeId)) };
  }

  async lagreListe(l: Liste) {
    const { lister } = this.alleLister();
    const i = lister.findIndex((x) => x.id === l.id);
    const ny = { ...l, eier: l.privat ? this.megEpost() : null };
    if (i >= 0) lister[i] = ny; else lister.push(ny);
    skriv('lister', lister);
  }

  async slettListe(id: string) {
    const { lister, punkter } = this.alleLister();
    skriv('lister', lister.filter((l) => l.id !== id));
    skriv('listepunkter', punkter.filter((p) => p.listeId !== id));
  }

  async lagrePunkter(nye: Punkt[]) {
    const { punkter } = this.alleLister();
    for (const p of nye) {
      const i = punkter.findIndex((x) => x.id === p.id);
      if (i >= 0) punkter[i] = p; else punkter.push(p);
    }
    skriv('listepunkter', punkter);
  }

  async slettPunkter(ider: string[]) {
    const borte = new Set(ider);
    skriv('listepunkter', this.alleLister().punkter.filter((p) => !borte.has(p.id) && !borte.has(p.forelderId ?? '')));
  }

  // Demomodus: delingslenken virker bare i denne nettleseren
  async hentDeltListe(nokkel: string) {
    const { lister, punkter } = this.alleLister();
    const l = lister.find((x) => x.deling && x.deling === nokkel);
    return l ? { navn: l.navn, ikon: l.ikon, type: l.type, punkter: punkter.filter((p) => p.listeId === l.id) } : null;
  }

  // Demomodus: vedlegg lagres som data-URL i nettleseren (bilder er forminsket før opplasting)
  async lastOppVedlegg(sti: string, fil: Blob) {
    const url = await new Promise<string>((ok, feil) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = () => feil(r.error);
      r.readAsDataURL(fil);
    });
    skriv(`vedlegg.${sti}`, url);
  }

  async vedleggUrl(sti: string) {
    const url = les<string>(`vedlegg.${sti}`);
    if (!url) throw new Error('Fant ikke vedlegget');
    return url;
  }

  async slettVedlegg(stier: string[]) {
    for (const sti of stier) {
      minne.delete(`vedlegg.${sti}`);
      try { localStorage.removeItem(`${LOKAL}.vedlegg.${sti}`); } catch { /* ignorer */ }
    }
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

  /** Private rader får eier = innlogget bruker; felles har eier = null */
  private async eier(privat: boolean) {
    if (!privat) return null;
    const { data } = await this.db.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error('Ikke innlogget');
    return id;
  }

  async hentUtgifter(fra: string, til: string) {
    const { data, error } = await this.db.from('utgift')
      .select('id, eier, dato, belop, kategori_id, konto_id, notat, fort_av')
      .gte('dato', fra).lte('dato', til).order('dato', { ascending: false }).limit(5000);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id, dato: r.dato, belop: Number(r.belop), kategoriId: r.kategori_id, kontoId: r.konto_id,
      notat: r.notat ?? '', privat: r.eier !== null, fortAv: r.fort_av ?? '',
    }));
  }

  async lagreUtgift(u: Utgift) {
    const { error } = await this.db.from('utgift').upsert({
      id: u.id, eier: await this.eier(u.privat), dato: u.dato, belop: u.belop,
      kategori_id: u.kategoriId, konto_id: u.kontoId, notat: u.notat,
    });
    if (error) throw error;
  }

  async slettUtgift(id: string) {
    const { error } = await this.db.from('utgift').delete().eq('id', id);
    if (error) throw error;
  }

  async hentSaldoer() {
    const { data, error } = await this.db.from('saldo')
      .select('id, eier, konto_id, maaned, belop, fort_av').order('maaned', { ascending: false }).limit(5000);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id, kontoId: r.konto_id, maaned: r.maaned, belop: Number(r.belop), privat: r.eier !== null, fortAv: r.fort_av ?? '',
    }));
  }

  async lagreSaldo(x: Saldo) {
    const { error } = await this.db.from('saldo').upsert({
      id: x.id, eier: await this.eier(x.privat), konto_id: x.kontoId, maaned: x.maaned, belop: x.belop,
    });
    if (error) throw error;
  }

  async slettSaldo(id: string) {
    const { error } = await this.db.from('saldo').delete().eq('id', id);
    if (error) throw error;
  }

  // Felt som bare appen bruker ligger i «ekstra» (jsonb), så nye felt ikke krever endringer i databasen
  async hentLister() {
    const [l, p] = await Promise.all([
      this.db.from('liste').select('id, eier, navn, ikon, kategori, type, mal, rekkefolge, ekstra, opprettet').limit(2000),
      this.db.from('listepunkt').select('id, liste_id, forelder_id, tekst, notat, status, belop, dato, rekkefolge, ekstra').limit(20000),
    ]);
    if (l.error) throw l.error;
    if (p.error) throw p.error;
    return {
      lister: (l.data ?? []).map((r): Liste => ({
        ...(r.ekstra ?? {}),
        id: r.id, navn: r.navn, ikon: r.ikon, kategori: r.kategori, type: r.type, privat: r.eier !== null, mal: r.mal,
        rekkefolge: Number(r.rekkefolge), opprettet: String(r.opprettet).slice(0, 10),
      })),
      punkter: (p.data ?? []).map((r): Punkt => ({
        ...(r.ekstra ?? {}),
        id: r.id, listeId: r.liste_id, forelderId: r.forelder_id, tekst: r.tekst, notat: r.notat ?? '', status: r.status,
        belop: r.belop === null ? null : Number(r.belop), dato: r.dato, rekkefolge: Number(r.rekkefolge),
      })),
    };
  }

  async lagreListe(l: Liste) {
    const { id, navn, ikon, kategori, type, privat, mal, rekkefolge, opprettet, ...ekstra } = l;
    const { error } = await this.db.from('liste').upsert({
      id, eier: await this.eier(privat), navn, ikon, kategori, type, mal, rekkefolge, opprettet, ekstra,
    });
    if (error) throw error;
  }

  async slettListe(id: string) {
    const { error } = await this.db.from('liste').delete().eq('id', id);
    if (error) throw error;
  }

  async lagrePunkter(punkter: Punkt[]) {
    if (!punkter.length) return;
    // Forelder før underpunkt, ellers stopper fremmednøkkelen innsettingen
    const sortert = [...punkter].sort((a, b) => Number(!!a.forelderId) - Number(!!b.forelderId));
    const { error } = await this.db.from('listepunkt').upsert(sortert.map((p) => {
      const { id, listeId, forelderId, tekst, notat, status, belop, dato, rekkefolge, ...ekstra } = p;
      return { id, liste_id: listeId, forelder_id: forelderId, tekst, notat, status, belop, dato, rekkefolge, ekstra };
    }));
    if (error) throw error;
  }

  async slettPunkter(ider: string[]) {
    if (!ider.length) return;
    const { error } = await this.db.from('listepunkt').delete().in('id', ider);
    if (error) throw error;
  }

  /** Funksjonen hent_delt_liste (supabase/lister.sql) slipper til uten innlogging, men bare med riktig nøkkel */
  async hentDeltListe(nokkel: string): Promise<DeltListe | null> {
    const { data, error } = await this.db.rpc('hent_delt_liste', { nokkel });
    if (error) throw error;
    if (!data) return null;
    const d = data as { navn: string; ikon: string; type: DeltListe['type']; punkter: { id: string; forelder_id: string | null; tekst: string; notat: string; status: string; belop: number | null; rekkefolge: number; lenke: string | null }[] };
    return {
      navn: d.navn, ikon: d.ikon, type: d.type,
      punkter: d.punkter.map((r) => ({
        id: r.id, listeId: '', forelderId: r.forelder_id, tekst: r.tekst, notat: r.notat ?? '', status: r.status,
        belop: r.belop === null ? null : Number(r.belop), dato: null, rekkefolge: Number(r.rekkefolge), lenke: r.lenke ?? undefined,
      })),
    };
  }

  async lastOppVedlegg(sti: string, fil: Blob, type: string) {
    const { error } = await this.db.storage.from('vedlegg').upload(sti, fil, { contentType: type, upsert: false });
    if (error) throw error;
  }

  async vedleggUrl(sti: string) {
    const { data, error } = await this.db.storage.from('vedlegg').createSignedUrl(sti, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async slettVedlegg(stier: string[]) {
    if (!stier.length) return;
    const { error } = await this.db.storage.from('vedlegg').remove(stier);
    if (error) throw error;
  }
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const nokkel = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const lager: Lager = url && nokkel ? new SupabaseLager(url, nokkel) : new LokaltLager();
