// Lager app-ikonene i public/ fra én SVG. Kjør på nytt etter endring: npm run ikoner
// Logoen er et lite sankey-diagram: én inntekt som deler seg i tre strømmer.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const TERRAKOTTA = '#A84F2B';
const KREM = '#FAF6F0';

// Motivet holdes innenfor midtre ~62 % så det tåler avrunding (iOS) og «maskable»-beskjæring (Android)
const motiv = `
  <path d="M160 196 C256 196 256 124 352 124 L352 164 C256 164 256 236 160 236 Z" fill="${KREM}" opacity=".82"/>
  <path d="M160 236 C256 236 256 236 352 236 L352 276 C256 276 256 276 160 276 Z" fill="${KREM}" opacity=".62"/>
  <path d="M160 276 C256 276 256 348 352 348 L352 388 C256 388 256 316 160 316 Z" fill="${KREM}" opacity=".45"/>
  <rect x="132" y="196" width="30" height="120" rx="7" fill="${KREM}"/>
  <rect x="350" y="124" width="30" height="40" rx="7" fill="${KREM}"/>
  <rect x="350" y="236" width="30" height="40" rx="7" fill="${KREM}"/>
  <rect x="350" y="348" width="30" height="40" rx="7" fill="${KREM}"/>`;

/** Fullflate-ikon (hjemskjerm). Plattformen runder hjørnene selv. */
const fullflate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${TERRAKOTTA}"/>${motiv}</svg>`;

/** Favicon med egne avrundede hjørner (nettleserfanen runder ikke). */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${TERRAKOTTA}"/><g transform="translate(256 256) scale(1.25) translate(-256 -256)">${motiv}</g></svg>`;

writeFileSync('public/favicon.svg', favicon);
const lag = (svg, str, fil) => sharp(Buffer.from(svg)).resize(str, str).png().toFile(`public/${fil}`);
await Promise.all([
  lag(fullflate, 180, 'apple-touch-icon.png'),
  lag(fullflate, 192, 'ikon-192.png'),
  lag(fullflate, 512, 'ikon-512.png'),
  lag(favicon, 32, 'favicon-32.png'),
]);
console.log('Ikoner skrevet til public/');
