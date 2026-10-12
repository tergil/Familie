// Lager app-ikonene i public/ fra én SVG. Kjør på nytt etter endring: npm run ikoner
// Logoen er et hus med et hjerte: familien og hjemmet – budsjett, lister og gaver.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const TERRAKOTTA = '#A84F2B';
const KREM = '#FAF6F0';

// Motivet holdes innenfor midtre ~62 % så det tåler avrunding (iOS) og «maskable»-beskjæring (Android).
// Huset er fylt krem med avrundede hjørner (strek i samme farge), hjertet er skåret ut i terrakotta.
const motiv = `
  <path d="M256 142 L384 254 L346 254 L346 372 L166 372 L166 254 L128 254 Z"
    fill="${KREM}" stroke="${KREM}" stroke-width="30" stroke-linejoin="round"/>
  <path d="M256 344 C214 318 194 296 194 272 C194 252 209 238 227 238 C240 238 250 245 256 256 C262 245 272 238 285 238 C303 238 318 252 318 272 C318 296 298 318 256 344 Z"
    fill="${TERRAKOTTA}"/>`;

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
