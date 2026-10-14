// Tegner Sulamitten-symbolet «Fra surr til system»: en krusedull som roer seg til en sirkel.
// Skriver banene til src/ui/logo.json (brukes av appen og av lag-ikoner.mjs). Kjøres av: npm run ikoner
import { writeFileSync } from 'node:fs';

const r1 = (n) => Math.round(n * 10) / 10;

/** Glatt bane gjennom punktene (Catmull-Rom som kubiske Bézier-kurver) */
function glatt(p) {
  let d = `M${r1(p[0][0])} ${r1(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const [a, b, c, e] = [p[i - 1] ?? p[i], p[i], p[i + 1], p[i + 2] ?? p[i + 1]];
    const k1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const k2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += `C${r1(k1[0])} ${r1(k1[1])} ${r1(k2[0])} ${r1(k2[1])} ${r1(c[0])} ${r1(c[1])}`;
  }
  return d;
}

/**
 * Krusedull: løkker som overlapper, med sentrum og radius som flytter seg litt for hver løkke (håndtegnet preg),
 * så en rolig bue og en nesten lukket sirkel. lokker: [cx, cy, rx, ry] per løkke.
 */
function symbol({ lokker, sirkel, steg = 14 }) {
  const p = [];
  const n = lokker.length;
  // Vinkelen synker (mot klokka på skjermen). Slutter nederst i siste løkke, på vei mot høyre.
  const start = Math.PI / 2 + 2 * Math.PI * n - 0.6 * Math.PI, slutt = Math.PI / 2;
  const lerp = (x, y, f) => x + (y - x) * f;
  for (let i = 0; ; i++) {
    const v = start - (i * 2 * Math.PI) / steg;
    if (v < slutt - 1e-9) break;
    const f = (start - v) / (start - slutt) * (n - 1);
    const k = Math.min(n - 2, Math.floor(f)), r = f - k;
    const [cx, cy, rx, ry] = lokker[k].map((x, j) => lerp(x, lokker[k + 1][j], r));
    p.push([cx + rx * Math.cos(v), cy + ry * Math.sin(v)]);
  }
  const { cx, cy, r } = sirkel;
  // Inn i sirkelen på venstre side, på vei opp; rundt med klokka og nesten tilbake
  const inn = 205, rundt = 346;
  const ende = p[p.length - 1];
  const mal = [cx + r * Math.cos((inn * Math.PI) / 180), cy + r * Math.sin((inn * Math.PI) / 180)];
  // Rolig bue (kubisk Bézier) fra krusedullen inn i sirkelen, i samme retning som sirkelen fortsetter
  const tan = [-Math.sin((inn * Math.PI) / 180), Math.cos((inn * Math.PI) / 180)];
  const k1 = [ende[0] + 28, ende[1] + 2], k2 = [mal[0] - 26 * tan[0], mal[1] - 26 * tan[1]];
  for (let i = 1; i < 10; i++) {
    const t = i / 10, u = 1 - t;
    p.push([0, 1].map((j) => u * u * u * ende[j] + 3 * u * u * t * k1[j] + 3 * u * t * t * k2[j] + t * t * t * mal[j]));
  }
  for (let g = inn; g <= inn + rundt; g += 15) {
    const v = (g * Math.PI) / 180, rr = r * (1 - 0.05 * ((g - inn) / rundt));
    p.push([cx + rr * Math.cos(v), cy + rr * Math.sin(v)]);
  }
  return glatt(p);
}

const SIRKEL = { cx: 148, cy: 50, r: 31 };
const sti = symbol({ sirkel: SIRKEL, lokker: [[26, 53, 15, 16], [37, 47, 18, 19], [47, 56, 17, 15], [57, 50, 17, 18]] });
// Mikrovariant (under 24 px): færre løkker, større og mer åpne
const mikro = symbol({ sirkel: SIRKEL, steg: 12, lokker: [[30, 50, 18, 18], [64, 53, 17, 16]] });

// «Aha»-stråler oppe til høyre for sirkelen (gul, terrakotta, havblå)
const straler = [-62, -38, -14].map((g) => {
  const v = (g * Math.PI) / 180, { cx, cy, r } = SIRKEL;
  const [i, y] = [r + 9, r + 18];
  return `M${r1(cx + i * Math.cos(v))} ${r1(cy + i * Math.sin(v))}L${r1(cx + y * Math.cos(v))} ${r1(cy + y * Math.sin(v))}`;
});

const logo = { viewBox: '0 0 200 100', sti, mikro, straler, stralefarger: ['#F4B942', '#D45B3E', '#4E8CC9'] };
writeFileSync('src/ui/logo.json', JSON.stringify(logo, null, 2) + '\n');
console.log('Logo skrevet til src/ui/logo.json');
