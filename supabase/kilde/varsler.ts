// Edge Function «varsler»: sender push-varsler til telefonene.
// Bygges til supabase/functions/varsler/index.ts med «npm run varsel-funksjon» (tar med logikken fra src/logikk).
//
// Kalles på to måter:
//  1. Hver time av pg_cron (supabase/varsler.sql) med hodet x-cron-hemmelighet. Sender varsler til brukerne
//     som har valgt denne timen (norsk tid). Hvert varsel sendes bare én gang (tabellen varsel_sendt).
//  2. Fra appen med { handling: 'test' } og innlogget bruker: sender et testvarsel til brukerens enheter.
//
// Hemmeligheter (Supabase → Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_HEMMELIGHET.
// SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY finnes automatisk.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import type { Liste, Punkt, VarselInnstillinger } from '../../src/data/modell';
import { STANDARD_VARSLER } from '../../src/data/modell';
import { beregnVarsler, norskTid, slaaSammen } from '../../src/logikk/varsler';

declare const Deno: { env: { get(n: string): string | undefined }; serve(f: (r: Request) => Response | Promise<Response>): void };

const env = (n: string) => Deno.env.get(n) ?? '';
const svar = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
});

type Abonnement = { id: string; bruker: string; endpoint: string; p256dh: string; auth: string };

/** Sender til alle enhetene. Enheter som ikke finnes lenger (404/410), slettes. */
async function send(db: ReturnType<typeof createClient>, enheter: Abonnement[], melding: { tittel: string; tekst: string; url: string }): Promise<number> {
  let sendt = 0;
  for (const e of enheter) {
    try {
      await webpush.sendNotification({ endpoint: e.endpoint, keys: { p256dh: e.p256dh, auth: e.auth } }, JSON.stringify(melding), { TTL: 60 * 60 * 20 });
      sendt++;
    } catch (feil) {
      const kode = (feil as { statusCode?: number }).statusCode;
      if (kode === 404 || kode === 410) await db.from('varsel_abonnement').delete().eq('id', e.id);
      else console.error('Kunne ikke sende', kode, feil);
    }
  }
  return sendt;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return svar('ok');
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:varsler@familie.invalid', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const kropp = (await req.json().catch(() => ({}))) as { handling?: string; tving?: boolean };

  // 1. Testvarsel fra appen
  if (kropp.handling === 'test') {
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const { data } = await db.auth.getUser(jwt);
    if (!data.user) return svar({ feil: 'Ikke innlogget' }, 401);
    const { data: enheter } = await db.from('varsel_abonnement').select('id, bruker, endpoint, p256dh, auth').eq('bruker', data.user.id);
    const n = await send(db, (enheter ?? []) as Abonnement[], { tittel: '🔔 Testvarsel', tekst: 'Varslene virker på denne enheten.', url: '#/varsler' });
    return svar({ sendt: n, enheter: enheter?.length ?? 0 });
  }

  // 2. Timejobben
  if (!env('CRON_HEMMELIGHET') || req.headers.get('x-cron-hemmelighet') !== env('CRON_HEMMELIGHET')) return svar({ feil: 'Ikke tilgang' }, 401);
  const { dato, time } = norskTid();
  const { data: innstillinger, error } = await db.from('varsel_innstilling').select('bruker, data');
  if (error) return svar({ feil: error.message }, 500);
  const aktuelle = (innstillinger ?? [])
    .map((r) => ({ bruker: r.bruker as string, inn: { ...STANDARD_VARSLER, ...(r.data as Partial<VarselInnstillinger>) } as VarselInnstillinger }))
    .filter((r) => kropp.tving || r.inn.time === time);
  if (!aktuelle.length) return svar({ dato, time, brukere: 0 });

  // Alle lister og punkter (tjenestenøkkelen ser alt) – filtreres per bruker under
  const [l, p] = await Promise.all([
    db.from('liste').select('id, eier, navn, ikon, kategori, type, mal, rekkefolge, ekstra, opprettet').limit(5000),
    db.from('listepunkt').select('id, liste_id, forelder_id, tekst, notat, status, belop, dato, rekkefolge, ekstra').limit(50000),
  ]);
  if (l.error || p.error) return svar({ feil: (l.error ?? p.error)!.message }, 500);
  const lister = (l.data ?? []).map((r) => ({
    eier: r.eier as string | null,
    liste: { ...(r.ekstra ?? {}), id: r.id, navn: r.navn, ikon: r.ikon, kategori: r.kategori, type: r.type, privat: r.eier !== null, mal: r.mal, rekkefolge: Number(r.rekkefolge), opprettet: String(r.opprettet).slice(0, 10) } as Liste,
  }));
  const punkter = (p.data ?? []).map((r) => ({
    ...(r.ekstra ?? {}), id: r.id, listeId: r.liste_id, forelderId: r.forelder_id, tekst: r.tekst, notat: r.notat ?? '', status: r.status,
    belop: r.belop === null ? null : Number(r.belop), dato: r.dato, rekkefolge: Number(r.rekkefolge),
  }) as Punkt);

  const resultat: Record<string, number> = {};
  for (const { bruker, inn } of aktuelle) {
    // Det brukeren ser: felles lister og egne private
    const synlige = lister.filter((x) => x.eier === null || x.eier === bruker).map((x) => x.liste);
    const ider = new Set(synlige.map((x) => x.id));
    const kandidater = beregnVarsler(synlige, punkter.filter((x) => ider.has(x.listeId)), inn, dato);
    if (!kandidater.length) continue;
    const { data: sendtFor } = await db.from('varsel_sendt').select('nokkel').eq('bruker', bruker).in('nokkel', kandidater.map((k) => k.nokkel));
    const sendt = new Set((sendtFor ?? []).map((r) => r.nokkel as string));
    const nye = kandidater.filter((k) => !sendt.has(k.nokkel));
    if (!nye.length) continue;
    const { data: enheter } = await db.from('varsel_abonnement').select('id, bruker, endpoint, p256dh, auth').eq('bruker', bruker);
    if (!enheter?.length) continue;
    let antall = 0;
    for (const melding of slaaSammen(nye)) {
      if (await send(db, enheter as Abonnement[], melding)) {
        antall++;
        await db.from('varsel_sendt').upsert(melding.nokler.map((nokkel) => ({ bruker, nokkel })), { onConflict: 'bruker,nokkel', ignoreDuplicates: true });
      }
    }
    resultat[bruker] = antall;
  }
  return svar({ dato, time, brukere: aktuelle.length, sendt: resultat });
});
