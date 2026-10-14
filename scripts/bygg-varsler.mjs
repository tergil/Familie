// Bygger Edge Functions til én fil hver: supabase/functions/<navn>/index.ts
// Tar med logikken fra src/logikk (samme kode som testes i npm test). Kjør: npm run funksjoner
import { build } from 'rolldown';
import { readFileSync, writeFileSync } from 'node:fs';

for (const navn of ['varsler', 'kalender']) {
  const ut = `supabase/functions/${navn}/index.ts`;
  await build({
    input: `supabase/kilde/${navn}.ts`,
    platform: 'neutral',
    // Pakkene hentes av Supabase sitt kjøremiljø (Deno)
    external: (id) => id.startsWith('npm:'),
    output: { file: ut, format: 'esm' },
  });
  const kode = readFileSync(ut, 'utf8');
  writeFileSync(ut, `// GENERERT av npm run funksjoner fra supabase/kilde/${navn}.ts – ikke rediger denne fila.
// Lim hele innholdet inn i Supabase → Edge Functions → ${navn} (eller: npx supabase functions deploy ${navn} --no-verify-jwt).
// @ts-nocheck
${kode}`);
  console.log(`Skrev ${ut}`);
}
