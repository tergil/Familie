// Sankey-diagram tegnet som SVG med d3-sankey for utregning av posisjoner.
// Mobil: kompakt høyde, etiketter over lenkene med «halo» så de er lesbare.
import { useEffect, useMemo, useRef, useState } from 'react';
import { sankey, sankeyJustify, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from 'd3-sankey';
import type { Flyt, FlytNode } from '../logikk/flyt';
import { kr } from './felles';

type N = SankeyNode<FlytNode, object>;
type L = SankeyLink<FlytNode, object>;

function nodeFarge(n: FlytNode): string {
  if (n.type === 'kategori' && n.farge !== undefined) return `var(--k${n.farge})`;
  if (n.type === 'rest') return 'var(--linje-sterk)';
  return 'var(--blekk-2)';
}

function lenkeFarge(l: L): string {
  const mal = l.target as N;
  if (mal.type === 'kategori' && mal.farge !== undefined) return `var(--k${mal.farge})`;
  return 'var(--noytral-flyt)';
}

export function Sankey({ flyt, velg }: { flyt: Flyt; velg?: (n: FlytNode) => void }) {
  const boks = useRef<HTMLDivElement>(null);
  const [bredde, setBredde] = useState(0);
  const [aktiv, setAktiv] = useState<string | null>(null);
  const [hint, setHint] = useState<{ x: number; y: number; tekst: string; belop: number } | null>(null);

  useEffect(() => {
    const el = boks.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBredde(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const kompakt = bredde < 640;

  const graf = useMemo(() => {
    if (!bredde || flyt.lenker.length === 0) return null;
    const lag = (h: number) =>
      sankey<FlytNode, object>()
        .nodeId((d) => d.id)
        .nodeWidth(kompakt ? 8 : 12)
        .nodePadding(kompakt ? 20 : 32)
        .nodeAlign(sankeyJustify)
        .nodeSort(null)
        .extent([[1, 6], [bredde - 1, h - 6]])({
          nodes: flyt.noder.map((n) => ({ ...n })),
          links: flyt.lenker.map((l) => ({ source: l.kilde, target: l.mal, value: l.verdi })),
        });
    // Høyden styres av kolonnen med flest noder, så etikettene får plass
    const forste = lag(400);
    const perKolonne = new Map<number, number>();
    for (const n of forste.nodes) perKolonne.set(n.depth ?? 0, (perKolonne.get(n.depth ?? 0) ?? 0) + 1);
    const flest = Math.max(...perKolonne.values());
    // Etikettene trenger ~20px (én linje) / ~32px (to linjer) selv for små noder
    const hoyde = Math.max(kompakt ? 280 : 360, flest * (kompakt ? 20 : 32) + (kompakt ? 180 : 240));
    return { ...lag(hoyde), hoyde };
  }, [flyt, bredde, kompakt]);

  const koblet = useMemo(() => {
    if (!aktiv || !graf) return null;
    const noder = new Set<string>([aktiv]);
    const lenker = new Set<L>();
    // Følg flyten både bakover og fremover fra valgt node
    const bak = (id: string) => graf.links.forEach((l) => { if ((l.target as N).id === id && !lenker.has(l)) { lenker.add(l); noder.add((l.source as N).id); bak((l.source as N).id); } });
    const frem = (id: string) => graf.links.forEach((l) => { if ((l.source as N).id === id && !lenker.has(l)) { lenker.add(l); noder.add((l.target as N).id); frem((l.target as N).id); } });
    bak(aktiv);
    frem(aktiv);
    return { noder, lenker };
  }, [aktiv, graf]);

  const sti = sankeyLinkHorizontal<FlytNode, object>();

  function visHint(e: React.PointerEvent, tekst: string, belop: number) {
    const r = boks.current!.getBoundingClientRect();
    setHint({ x: e.clientX - r.left, y: e.clientY - r.top, tekst, belop });
  }

  return (
    <div
      ref={boks}
      className={`sankey-boks${koblet ? ' fokus' : ''}`}
      onPointerLeave={() => { setAktiv(null); setHint(null); }}
    >
      {graf && (
        <svg viewBox={`0 0 ${bredde} ${graf.hoyde}`} role="img" aria-label="Pengeflyt">
          <g>
            {graf.links.map((l, i) => {
              const s = l.source as N;
              const t = l.target as N;
              return (
                <path
                  key={i}
                  className={`lenke${koblet?.lenker.has(l) ? ' aktiv' : ''}`}
                  d={sti(l) ?? ''}
                  stroke={lenkeFarge(l)}
                  strokeWidth={Math.max(1.5, l.width ?? 1)}
                  onPointerMove={(e) => visHint(e, `${s.navn} → ${t.navn}`, l.value)}
                  onPointerLeave={() => setHint(null)}
                />
              );
            })}
          </g>
          <g>
            {graf.nodes.map((n) => {
              const x0 = n.x0 ?? 0, x1 = n.x1 ?? 0, y0 = n.y0 ?? 0, y1 = n.y1 ?? 0;
              const h = Math.max(2, y1 - y0);
              const venstre = x0 < bredde / 2;
              const tx = venstre ? x1 + 6 : x0 - 6;
              const midt = y0 + h / 2;
              const toLinjer = h >= 28 || !kompakt;
              return (
                <g
                  key={n.id}
                  className={`node${koblet?.noder.has(n.id) ? ' aktiv' : ''}`}
                  onPointerEnter={() => setAktiv(n.id)}
                  onPointerMove={(e) => visHint(e, n.navn, n.value ?? 0)}
                  onClick={() => velg?.(n)}
                  role={velg ? 'button' : undefined}
                  tabIndex={velg ? 0 : undefined}
                  aria-label={`${n.navn}: ${kr(n.value ?? 0)}`}
                  onKeyDown={(e) => e.key === 'Enter' && velg?.(n)}
                  onFocus={() => setAktiv(n.id)}
                  onBlur={() => setAktiv(null)}
                >
                  {/* Usynlig, større treffflate for fingre */}
                  <rect x={x0 - 8} y={y0 - 4} width={x1 - x0 + 16} height={h + 8} fill="transparent" />
                  <rect x={x0} y={y0} width={x1 - x0} height={h} fill={nodeFarge(n)} />
                  {toLinjer ? (
                    <>
                      <text className="navn" x={tx} y={midt - 2} textAnchor={venstre ? 'start' : 'end'}>{n.navn}</text>
                      <text x={tx} y={midt + 13} textAnchor={venstre ? 'start' : 'end'}><tspan className="sum">{kr(n.value ?? 0)}</tspan></text>
                    </>
                  ) : (
                    <text className="navn" x={tx} y={midt + 4} textAnchor={venstre ? 'start' : 'end'}>
                      {n.navn} <tspan className="sum" fontWeight={400}>{kr(n.value ?? 0)}</tspan>
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}
      {hint && (
        <div className="hint-boble" style={{ left: Math.min(Math.max(hint.x, 90), bredde - 90), top: hint.y }}>
          {hint.tekst} · <strong>{kr(hint.belop)}</strong>
        </div>
      )}
    </div>
  );
}

/** Tabellvisning av samme flyt – for tilgjengelighet og nøyaktige tall. */
export function FlytTabell({ flyt }: { flyt: Flyt }) {
  const navn = new Map(flyt.noder.map((n) => [n.id, n.navn]));
  return (
    <div className="tabell-rull">
      <table className="tabell">
        <thead><tr><th>Fra</th><th>Til</th><th className="h">Per måned</th></tr></thead>
        <tbody>
          {flyt.lenker.map((l, i) => (
            <tr key={i}><td>{navn.get(l.kilde)}</td><td>{navn.get(l.mal)}</td><td className="h">{kr(l.verdi)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
