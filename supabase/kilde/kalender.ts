// Edge Function «kalender»: kalenderabonnement (.ics) som telefonens kalender kan abonnere på.
// Bygges til supabase/functions/kalender/index.ts med «npm run funksjoner».
// Kalles med ?n=<nøkkel>. Nøkkelen lages i appen (Kalender → Abonner) og ligger i fellesdokumentet.
// Uten riktig nøkkel: 404. Viser felles avtaler og bursdager/anledninger fra felles gaveår – aldri noe privat.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { kalenderPoster, leggTilDager } from '../../src/logikk/kalender';
import { lagIcs } from '../../src/logikk/ics';
import { norskTid } from '../../src/logikk/varsler';
import { hentAlt, navnFra } from './felles';

declare const Deno: { env: { get(n: string): string | undefined }; serve(f: (r: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  try {
    const nokkel = new URL(req.url).searchParams.get('n') ?? '';
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { lister, punkter, hendelser, felles } = await hentAlt(db);
    if (!felles?.kalenderNokkel || nokkel.length < 32 || nokkel !== felles.kalenderNokkel) {
      return new Response('Finnes ikke', { status: 404 });
    }
    const { dato } = norskTid();
    const fellesLister = lister.filter((x) => x.eier === null).map((x) => x.liste);
    const ider = new Set(fellesLister.map((x) => x.id));
    const poster = kalenderPoster(hendelser, fellesLister, punkter.filter((x) => ider.has(x.listeId)),
      leggTilDager(dato, -60), leggTilDager(dato, 400), { anledninger: true, frister: false });
    return new Response(lagIcs(poster, navnFra(felles)), {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=900', 'Content-Disposition': 'inline; filename="familie.ics"' },
    });
  } catch (e) {
    console.error(e);
    return new Response(`Feil: ${e instanceof Error ? e.message : e}`, { status: 500 });
  }
});
