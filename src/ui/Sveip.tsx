// Sveip på en rad (bare berøring): mot høyre for én handling (f.eks. gjort), mot venstre for en annen (f.eks. slett).
// Knappene i raden og i arket gjør det samme – sveip er en snarvei, ikke eneste vei.
import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Ikon } from './felles';

export interface SveipHandling {
  tekst: string;
  ikon: string;
  gjor: () => void;
  /** Rød bakgrunn (slett) */
  fare?: boolean;
}

/** Hvor langt (px) man må dra før handlingen utføres */
const TERSKEL = 84;

export function Sveip({ className, hoyre, venstre, children }: {
  className?: string; hoyre?: SveipHandling; venstre?: SveipHandling; children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [slipper, setSlipper] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; retning?: 'x' | 'y' } | null>(null);
  const flyttet = useRef(false);

  function ned(e: PointerEvent<HTMLDivElement>) {
    // Bare finger, og ikke når man drar i håndtaket for rekkefølge
    if (e.pointerType !== 'touch' || (e.target as HTMLElement).closest('.dra-handtak, input, textarea, select')) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    flyttet.current = false;
    setSlipper(false);
  }
  function flytt(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const x = e.clientX - s.x, y = e.clientY - s.y;
    if (!s.retning) {
      if (Math.abs(x) > 10 && Math.abs(x) > Math.abs(y) * 1.5) {
        s.retning = 'x';
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (Math.abs(y) > 10) s.retning = 'y';
    }
    if (s.retning !== 'x') return;
    flyttet.current = true;
    // Bare retninger som har en handling; litt motstand forbi terskelen
    const maks = x > 0 ? (hoyre ? 1 : 0) : (venstre ? 1 : 0);
    const lengde = Math.abs(x) > TERSKEL ? TERSKEL + (Math.abs(x) - TERSKEL) * 0.3 : Math.abs(x);
    setDx(Math.sign(x) * lengde * maks);
  }
  function opp(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    setSlipper(true);
    if (dx >= TERSKEL && hoyre) hoyre.gjor();
    else if (dx <= -TERSKEL && venstre) venstre.gjor();
    setDx(0);
  }

  const handling = dx > 0 ? hoyre : dx < 0 ? venstre : undefined;
  const klar = Math.abs(dx) >= TERSKEL;
  return (
    <div className="sveip">
      {handling && (
        <div className={`sveip-bak ${dx > 0 ? 'hoyre' : 'venstre'}${handling.fare ? ' fare' : ''}${klar ? ' klar' : ''}`} aria-hidden="true">
          <Ikon navn={handling.ikon} storrelse={20} /><span>{handling.tekst}</span>
        </div>
      )}
      <div className={`sveip-front ${className ?? ''}${slipper ? ' slipper' : ''}`} style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={ned} onPointerMove={flytt} onPointerUp={opp} onPointerCancel={opp}
        // Et sveip skal ikke også åpne punktet
        onClickCapture={(e) => { if (flyttet.current) { e.preventDefault(); e.stopPropagation(); flyttet.current = false; } }}>
        {children}
      </div>
    </div>
  );
}
