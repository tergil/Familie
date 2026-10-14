// Lager nøklene til push-varsler (VAPID) og en hemmelighet for timejobben. Kjør: npm run vapid
//  - Offentlig nøkkel → src/data/varselnokkel.ts (ikke hemmelig, går i Git)
//  - Privat nøkkel og cron-hemmelighet → Data/varsler-oppsett.txt (ALDRI i Git), med ferdig utfylt SQL
// Lager bare nye nøkler med --ny. Nye nøkler betyr at alle enheter må slå på varsler på nytt.
import { createECDH, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OFFENTLIG = 'src/data/varselnokkel.ts';
const OPPSETT = 'Data/varsler-oppsett.txt';
if (existsSync(OFFENTLIG) && existsSync(OPPSETT) && !process.argv.includes('--ny')) {
  console.log(`Nøklene finnes allerede (se ${OPPSETT}). Bruk «npm run vapid -- --ny» for å lage nye.`);
  process.exit(0);
}

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const offentlig = ecdh.getPublicKey().toString('base64url');
const privat = ecdh.getPrivateKey().toString('hex').padStart(64, '0');
const privatB64 = Buffer.from(privat, 'hex').toString('base64url');
const cron = randomBytes(24).toString('base64url');
let ref = '<PROSJEKT-REF>';
try { ref = readFileSync('.env.local', 'utf8').match(/VITE_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? ref; } catch { /* ingen .env.local */ }

writeFileSync(OFFENTLIG, `// Offentlig nøkkel for push-varsler (VAPID). Ikke hemmelig. Laget av npm run vapid.
// Den private nøkkelen ligger bare i Supabase (Edge Functions → Secrets → VAPID_PRIVATE_KEY).
export const VAPID_OFFENTLIG = '${offentlig}';
`);

mkdirSync('Data', { recursive: true });
writeFileSync(OPPSETT, `OPPSETT AV VARSLER – PRIVAT, IKKE DEL OG IKKE LEGG I GIT
Laget ${new Date().toISOString().slice(0, 10)} av npm run vapid.

1) Supabase → Edge Functions → Secrets (Add new secret), legg inn disse fire:

VAPID_PUBLIC_KEY=${offentlig}
VAPID_PRIVATE_KEY=${privatB64}
CRON_HEMMELIGHET=${cron}
VAPID_SUBJECT=mailto:<din e-post>   (eller https://tergil.github.io/sulamitten/ – Apple krever ekte adresse)

NB: I Supabase skal Name og Value i hvert sitt felt – Value er bare det som står etter =.

2) Kjør supabase/varsler.sql i SQL Editor (tabellene).

3) Lag funksjonen: Supabase → Edge Functions → Deploy a new function → Via Editor.
   Navn: varsler. Lim inn HELE innholdet i supabase/functions/varsler/index.ts.
   Etterpå: åpne funksjonen → Details/Settings → slå AV «Verify JWT with legacy secret» (funksjonen sjekker selv).

4) Slå på timejobben: kjør dette i SQL Editor (Database → Extensions: pg_cron og pg_net må være på):

create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('familie-varsler') where exists (select 1 from cron.job where jobname = 'familie-varsler');
select cron.schedule('familie-varsler', '0 * * * *', $$
  select net.http_post(
    url := 'https://${ref}.supabase.co/functions/v1/varsler',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-hemmelighet', '${cron}'),
    body := '{}'::jsonb
  );
$$);
`);
console.log(`Skrev ${OFFENTLIG} og ${OPPSETT}`);
