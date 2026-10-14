// Bygger Edge Function «varsler» til én fil: supabase/functions/varsler/index.ts
// Tar med logikken fra src/logikk (samme kode som testes i npm test). Kjør: npm run varsel-funksjon
import { build } from 'rolldown';
import { readFileSync, writeFileSync } from 'node:fs';

const ut = 'supabase/functions/varsler/index.ts';
await build({
  input: 'supabase/kilde/varsler.ts',
  platform: 'neutral',
  // Pakkene hentes av Supabase sitt kjøremiljø (Deno)
  external: (id) => id.startsWith('npm:'),
  output: { file: ut, format: 'esm' },
});
const kode = readFileSync(ut, 'utf8');
writeFileSync(ut, `// GENERERT av npm run varsel-funksjon fra supabase/kilde/varsler.ts – ikke rediger denne fila.
// Lim hele innholdet inn i Supabase → Edge Functions → varsler (eller: npx supabase functions deploy varsler --no-verify-jwt).
// @ts-nocheck
${kode}`);
console.log(`Skrev ${ut}`);
