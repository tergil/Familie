// Felles for Edge Functions: gjør databaseradene om til appens typer (samme som src/data/lager.ts).
import type { FellesDok, Hendelse, Liste, Punkt } from '../../src/data/modell';

type Rad = Record<string, unknown> & { ekstra?: Record<string, unknown> | null };

export const tilListe = (r: Rad): { eier: string | null; liste: Liste } => ({
  eier: (r.eier as string | null) ?? null,
  liste: {
    ...(r.ekstra ?? {}), id: r.id, navn: r.navn, ikon: r.ikon, kategori: r.kategori, type: r.type, privat: r.eier !== null,
    mal: r.mal, rekkefolge: Number(r.rekkefolge), opprettet: String(r.opprettet).slice(0, 10),
  } as Liste,
});

export const tilPunkt = (r: Rad): Punkt => ({
  ...(r.ekstra ?? {}), id: r.id, listeId: r.liste_id, forelderId: r.forelder_id, tekst: r.tekst, notat: (r.notat as string) ?? '',
  status: r.status, belop: r.belop === null ? null : Number(r.belop), dato: r.dato, rekkefolge: Number(r.rekkefolge),
}) as Punkt;

export const tilHendelse = (r: Rad): Hendelse => ({
  ...(r.ekstra ?? {}), id: r.id, tittel: r.tittel, dato: r.dato,
  serieId: (r.serie_id as string | null) ?? undefined, originalDato: (r.original_dato as string | null) ?? undefined, avlyst: r.avlyst ? true : undefined,
}) as Hendelse;

// deno-lint-ignore no-explicit-any
type Db = any;

/** Alt varsler og kalender trenger: lister, punkter, avtaler og fellesdokumentet (personer, familie, kalendernøkkel) */
export async function hentAlt(db: Db): Promise<{ lister: { eier: string | null; liste: Liste }[]; punkter: Punkt[]; hendelser: Hendelse[]; felles: FellesDok | null }> {
  const [l, p, h, f] = await Promise.all([
    db.from('liste').select('id, eier, navn, ikon, kategori, type, mal, rekkefolge, ekstra, opprettet').limit(5000),
    db.from('listepunkt').select('id, liste_id, forelder_id, tekst, notat, status, belop, dato, rekkefolge, ekstra').limit(50000),
    db.from('hendelse').select('id, serie_id, original_dato, avlyst, tittel, dato, ekstra').limit(20000),
    db.from('felles_dok').select('data').eq('id', 1).maybeSingle(),
  ]);
  const feil = l.error ?? p.error ?? f.error;
  if (feil) throw new Error(feil.message);
  return {
    lister: (l.data ?? []).map(tilListe),
    punkter: (p.data ?? []).map(tilPunkt),
    // Mangler tabellen (kalender.sql ikke kjørt), virker resten likevel
    hendelser: h.error ? [] : (h.data ?? []).map(tilHendelse),
    felles: (f.data?.data as FellesDok | undefined) ?? null,
  };
}

/** Navn på personer og familiemedlemmer */
export function navnFra(felles: FellesDok | null): (id: string) => string | undefined {
  const alle = new Map([...(felles?.personer ?? []), ...(felles?.familie ?? [])].map((p) => [p.id, p.navn]));
  return (id) => alle.get(id);
}
