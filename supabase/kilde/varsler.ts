// Edge Function «varsler»: sender push-varsler til telefonene.
// Bygges til supabase/functions/varsler/index.ts med «npm run funksjoner» (tar med logikken fra src/logikk).
//
// Kalles på to måter:
//  1. Hvert kvarter av pg_cron (supabase/kalender.sql) med hodet x-cron-hemmelighet. Daglige varsler går til brukerne
//     som har valgt denne timen (norsk tid), varsel før avtaler sjekkes hver gang. Hvert varsel sendes bare én gang.
//  2. Fra appen med { handling: 'test' } og innlogget bruker: sender et testvarsel til brukerens enheter.
//
// Hemmeligheter (Supabase → Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_HEMMELIGHET og
// VAPID_SUBJECT (mailto:… eller https://… – Apple avviser ugyldige adresser med «BadJwtToken»).
// SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY finnes automatisk.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import type { VarselInnstillinger } from '../../src/data/modell';
import { beregnVarsler, forVarsler, medStandard, norskTid, slaaSammen } from '../../src/logikk/varsler';
import { hentAlt, navnFra } from './felles';

declare const Deno: { env: { get(n: string): string | undefined }; serve(f: (r: Request) => Response | Promise<Response>): void };

const env = (n: string) => Deno.env.get(n) ?? '';
const svar = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
});

type Abonnement = { id: string; bruker: string; endpoint: string; p256dh: string; auth: string };

/** Feil fra siste sending, så de kan vises i svaret (ikke bare i loggen) */
let sendefeil: string[] = [];

/** Sender til alle enhetene. Enheter som ikke finnes lenger (404/410), slettes. */
async function send(db: ReturnType<typeof createClient>, enheter: Abonnement[], melding: { tittel: string; tekst: string; url: string }): Promise<number> {
  let sendt = 0;
  for (const e of enheter) {
    try {
      await webpush.sendNotification({ endpoint: e.endpoint, keys: { p256dh: e.p256dh, auth: e.auth } }, JSON.stringify(melding), { TTL: 60 * 60 * 20 });
      sendt++;
    } catch (feil) {
      const f = feil as { statusCode?: number; body?: string; message?: string };
      if (f.statusCode === 404 || f.statusCode === 410) {
        await db.from('varsel_abonnement').delete().eq('id', e.id);
        sendefeil.push(`${new URL(e.endpoint).host}: enheten finnes ikke lenger (${f.statusCode}) – slettet`);
      } else {
        console.error('Kunne ikke sende', f.statusCode, feil);
        sendefeil.push(`${new URL(e.endpoint).host}: ${f.statusCode ?? ''} ${(f.body || f.message || String(feil)).slice(0, 300)}`.trim());
      }
    }
  }
  return sendt;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return svar('ok');
  // Feil skal komme tilbake som lesbar tekst (vises i appen), ikke som «Internal Server Error»
  try {
    return await behandle(req);
  } catch (e) {
    console.error(e);
    return svar({ feil: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function behandle(req: Request): Promise<Response> {
  sendefeil = [];
  const mangler = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'CRON_HEMMELIGHET'].filter((n) => !env(n));
  if (mangler.length) return svar({ feil: `Mangler hemmelighet i Supabase (Edge Functions → Secrets): ${mangler.join(', ')}` }, 500);
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  try {
    webpush.setVapidDetails(env('VAPID_SUBJECT') || 'https://tergil.github.io/sulamitten/', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  } catch (e) {
    return svar({ feil: `VAPID-nøklene er ugyldige – sjekk at de er limt inn helt, uten mellomrom: ${e instanceof Error ? e.message : e}` }, 500);
  }
  const kropp = (await req.json().catch(() => ({}))) as { handling?: string; tving?: boolean };

  // 1. Testvarsel fra appen
  if (kropp.handling === 'test') {
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const { data } = await db.auth.getUser(jwt);
    if (!data.user) return svar({ feil: 'Ikke innlogget' }, 401);
    const { data: enheter } = await db.from('varsel_abonnement').select('id, bruker, endpoint, p256dh, auth').eq('bruker', data.user.id);
    const n = await send(db, (enheter ?? []) as Abonnement[], { tittel: '🔔 Testvarsel', tekst: 'Varslene virker på denne enheten.', url: '#/varsler' });
    if (!n && sendefeil.length) return svar({ feil: `Push-tjenesten sa nei: ${sendefeil.join(' | ')}`, sendt: 0, enheter: enheter?.length ?? 0 }, 502);
    return svar({ sendt: n, enheter: enheter?.length ?? 0, feil: sendefeil.length ? sendefeil : undefined });
  }

  // 2. Timejobben
  if (!env('CRON_HEMMELIGHET') || req.headers.get('x-cron-hemmelighet') !== env('CRON_HEMMELIGHET')) return svar({ feil: 'Ikke tilgang' }, 401);
  // Kjøres hvert kvarter. Daglige varsler sendes i første kvarter av timen brukeren har valgt;
  // varsel før avtaler sjekkes hver gang.
  const { dato, time, minutt } = norskTid();
  const daglig = kropp.tving || minutt % 60 < 15;
  const { data: innstillinger, error } = await db.from('varsel_innstilling').select('bruker, data');
  if (error) return svar({ feil: error.message }, 500);
  const brukere = (innstillinger ?? []).map((r) => ({ bruker: r.bruker as string, inn: medStandard(r.data as Partial<VarselInnstillinger>) }));
  const aktuelle = brukere.filter((r) => (daglig && (kropp.tving || r.inn.time === time)) || r.inn.typer.avtaleFor.pa);
  if (!aktuelle.length) return svar({ dato, time, brukere: 0 });

  // Alt (tjenestenøkkelen ser alt) – filtreres per bruker under
  const { lister, punkter, hendelser, felles } = await hentAlt(db);
  const navn = navnFra(felles);
  const voksne = new Set((felles?.personer ?? []).map((x) => x.id));

  const resultat: Record<string, number> = {};
  for (const { bruker, inn } of aktuelle) {
    // Det brukeren ser: felles lister og egne private
    const synlige = lister.filter((x) => x.eier === null || x.eier === bruker).map((x) => x.liste);
    const ider = new Set(synlige.map((x) => x.id));
    const kandidater = [];
    if (daglig && (kropp.tving || inn.time === time)) {
      kandidater.push(...beregnVarsler(synlige, punkter.filter((x) => ider.has(x.listeId)), inn, dato, { hendelser, navn }));
    }
    if (inn.typer.avtaleFor.pa && hendelser.length) {
      // Hvem brukeren er i appen (via e-posten), så varsel før avtaler går til dem det gjelder
      const { data: u } = await db.auth.admin.getUserById(bruker);
      const epost = u?.user?.email?.toLowerCase();
      const personId = felles?.personer.find((x) => x.epost.toLowerCase() === epost)?.id;
      kandidater.push(...forVarsler(hendelser, { dato, minutt }, { hendelser, navn, personId, voksne }));
    }
    if (!kandidater.length) continue;
    const { data: sendtFor } = await db.from('varsel_sendt').select('nokkel').eq('bruker', bruker).in('nokkel', kandidater.map((k) => k.nokkel));
    const sendt = new Set((sendtFor ?? []).map((r) => r.nokkel as string));
    const nye = kandidater.filter((k) => !sendt.has(k.nokkel));
    if (!nye.length) continue;
    const { data: enheter } = await db.from('varsel_abonnement').select('id, bruker, endpoint, p256dh, auth').eq('bruker', bruker);
    if (!enheter?.length) continue;
    let antall = 0;
    // Varsel før en avtale kommer alltid alene (tidskritisk); resten slås sammen når det er mange
    const forAvtale = nye.filter((v) => v.type === 'avtaleFor');
    const meldinger = [...forAvtale.map((v) => ({ tittel: v.tittel, tekst: v.tekst, url: v.url, nokler: v.nokler })), ...slaaSammen(nye.filter((v) => v.type !== 'avtaleFor'))];
    for (const melding of meldinger) {
      if (await send(db, enheter as Abonnement[], melding)) {
        antall++;
        await db.from('varsel_sendt').upsert(melding.nokler.map((nokkel) => ({ bruker, nokkel })), { onConflict: 'bruker,nokkel', ignoreDuplicates: true });
      }
    }
    resultat[bruker] = antall;
  }
  return svar({ dato, time, minutt, brukere: aktuelle.length, sendt: resultat, feil: sendefeil.length ? sendefeil : undefined });
}
