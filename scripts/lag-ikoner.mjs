// Lager app-ikonene i public/ fra Sulamitten-symbolet (src/ui/logo.json, tegnet av lag-logo.mjs).
// Kjør på nytt etter endring: npm run ikoner
// Appikonet: krem bakgrunn, skoggrønt symbol og små stråler (merkevaredokumentet 3.4). Ingen ordmerke.
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const logo = JSON.parse(readFileSync('src/ui/logo.json', 'utf8'));
const SKOGGRONN = '#0E3D32';
const KREM = '#F4E9D7';

const strek = (d, bredde) => `<path d="${d}" fill="none" stroke="${SKOGGRONN}" stroke-width="${bredde}" stroke-linecap="round" stroke-linejoin="round"/>`;
const straler = logo.straler.map((d, i) => `<path d="${d}" stroke="${logo.stralefarger[i]}" stroke-width="7" stroke-linecap="round"/>`).join('');

// Symbolet (200 × 100) plasseres midt i 512 × 512
const motiv = (skala, innhold) => `<g transform="translate(256 256) scale(${skala}) translate(-100 -48)">${innhold}</g>`;

/** Fullflate-ikon (hjemskjerm). Plattformen runder hjørnene selv. */
const fullflate = (skala) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${KREM}"/>${motiv(skala, strek(logo.sti, 6.5) + straler)}</svg>`;

/** Favicon: mikrovarianten (færre løkker, ingen stråler), egne avrundede hjørner */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${KREM}"/>${motiv(2.3, strek(logo.mikro, 13))}</svg>`;

writeFileSync('public/favicon.svg', favicon);
const lag = (svg, str, fil) => sharp(Buffer.from(svg)).resize(str, str).png().toFile(`public/${fil}`);
await Promise.all([
  lag(fullflate(2), 180, 'apple-touch-icon.png'),
  lag(fullflate(2), 192, 'ikon-192.png'),
  lag(fullflate(2), 512, 'ikon-512.png'),
  // Android beskjærer «maskable» til en sirkel: mindre motiv
  lag(fullflate(1.55), 512, 'ikon-maskable-512.png'),
  lag(favicon, 32, 'favicon-32.png'),
]);
console.log('Ikoner skrevet til public/');
