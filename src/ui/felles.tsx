// Små gjenbrukbare byggeklosser. Hold dem enkle – stilen ligger i stil/app.css.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

// ---------------------------------------------------------------- Tall

const krFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const pstFormat = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 });

/** 12 345 kr (avrundet til hele kroner) */
export function kr(n: number, medKr = true): string {
  const s = krFormat.format(Math.round(n)).replace(/−/, '−');
  return medKr ? `${s} kr` : s;
}

export function krKort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${pstFormat.format(n / 1_000_000)} mill`;
  if (Math.abs(n) >= 10_000) return `${krFormat.format(Math.round(n / 1000))}k`;
  return krFormat.format(Math.round(n));
}

export function pst(n: number): string {
  return `${pstFormat.format(n)} %`;
}

export function datoTekst(iso: string): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function maanedTekst(iso: string): string {
  const [a, m] = iso.split('-').map(Number);
  const s = new Date(a, m - 1, 1).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Tolker "1 200,50" / "1200.5" / "12 000" til tall */
export function tolkTall(s: string): number {
  const renset = s.replace(/[\s kr]/g, '').replace(/[−–]/g, '-').replace(',', '.');
  const n = Number(renset);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------- Ikoner

const STIER: Record<string, ReactNode> = {
  oversikt: <><path d="M3 12 12 4l9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  budsjett: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  privat: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  sparing: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  mer: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  pluss: <path d="M12 5v14M5 12h14" />,
  lukk: <path d="M6 6l12 12M18 6 6 18" />,
  opp: <path d="M12 19V5M6 11l6-6 6 6" />,
  ned: <path d="M12 5v14M6 13l6 6 6-6" />,
  sjekk: <path d="M5 12.5 10 17 19 7" />,
  advarsel: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17v.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  kopi: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  slett: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  bank: <><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></>,
  konto: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></>,
  kategori: <><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  loggut: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h11" /></>,
  revisjon: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  lastned: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 20h16" /></>,
  lastopp: <><path d="M12 16V5M7 10l5-5 5 5" /><path d="M4 20h16" /></>,
  pilned: <path d="M6 9l6 6 6-6" />,
  pilhoyre: <path d="M9 6l6 6-6 6" />,
  pilvenstre: <path d="M15 6l-6 6 6 6" />,
  oppfolging: <><path d="M4 19V5M4 19h16" /><path d="M8 15l3-4 3 2 5-6" /></>,
  flyt: <><path d="M3 6c8 0 8 12 18 12" /><path d="M3 12c8 0 10-6 18-6" /></>,
  tabell: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M10 4v16" /></>,
  overforing: <><path d="M4 8h14l-3-3M20 16H6l3 3" /></>,
  inntekt: <><path d="M12 3v18M16 7c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 3 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3" /></>,
  rediger: <><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13 7l4 4" /></>,
  sol: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  mane: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  google: <></>,
};

export function Ikon({ navn, storrelse = 20 }: { navn: keyof typeof STIER | string; storrelse?: number }) {
  if (navn === 'google') {
    return (
      <svg width={storrelse} height={storrelse} viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
    );
  }
  return (
    <svg width={storrelse} height={storrelse} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {STIER[navn]}
    </svg>
  );
}

// ---------------------------------------------------------------- Ark (bunnark / dialog)

export function Ark({ tittel, lukk, children, bred }: { tittel: string; lukk: () => void; children: ReactNode; bred?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tast = (e: KeyboardEvent) => e.key === 'Escape' && lukk();
    document.addEventListener('keydown', tast);
    const forrige = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!ref.current?.contains(document.activeElement)) {
      ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.lukk)')?.focus({ preventScroll: true });
    }
    return () => {
      document.removeEventListener('keydown', tast);
      document.body.style.overflow = forrige;
    };
  }, [lukk]);
  return (
    <div className="slor" onMouseDown={(e) => e.target === e.currentTarget && lukk()}>
      <div className={`ark${bred ? ' bred' : ''}`} role="dialog" aria-modal="true" aria-label={tittel} ref={ref}>
        <div className="handtak" />
        <div className="ark-hode">
          <h2>{tittel}</h2>
          <button className="knapp flat ikon lukk" onClick={lukk} aria-label="Lukk"><Ikon navn="lukk" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Skjemafelt

export function Felt({ etikett, hjelp, children }: { etikett: string; hjelp?: string; children: ReactNode }) {
  return (
    <label className="felt">
      <span>{etikett}</span>
      {children}
      {hjelp && <small>{hjelp}</small>}
    </label>
  );
}

export function BelopFelt({ verdi, endre, autoFocus }: { verdi: number; endre: (n: number) => void; autoFocus?: boolean }) {
  const [tekst, setTekst] = useState(verdi ? String(verdi) : '');
  return (
    <div className="belop-felt">
      <input
        inputMode="decimal" autoFocus={autoFocus} value={tekst} placeholder="0"
        onChange={(e) => { setTekst(e.target.value); endre(tolkTall(e.target.value)); }}
        onFocus={(e) => e.target.select()}
      />
    </div>
  );
}

export function Segment<T extends string>({ valg, verdi, endre, full, etikett }: {
  valg: { verdi: T; tekst: string }[]; verdi: T; endre: (v: T) => void; full?: boolean; etikett: string;
}) {
  return (
    <div className={`segment${full ? ' full' : ''}`} role="group" aria-label={etikett}>
      {valg.map((v) => (
        <button key={v.verdi} type="button" aria-pressed={v.verdi === verdi} onClick={() => endre(v.verdi)}>{v.tekst}</button>
      ))}
    </div>
  );
}

export function Fargevalg({ verdi, endre }: { verdi: number; endre: (n: number) => void }) {
  return (
    <div className="fargevalg" role="group" aria-label="Farge">
      {Array.from({ length: 8 }, (_, i) => (
        <button key={i} type="button" aria-pressed={i === verdi} aria-label={`Farge ${i + 1}`}
          style={{ background: `var(--k${i})` }} onClick={() => endre(i)} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Visning

export function Kpi({ etikett, verdi, under, hero }: { etikett: string; verdi: ReactNode; under?: ReactNode; hero?: boolean }) {
  return (
    <div className={`kpi${hero ? ' hero' : ''}`}>
      <span className="etikett">{etikett}</span>
      <span className="verdi">{verdi}</span>
      {under && <span className="under">{under}</span>}
    </div>
  );
}

/** Viser endring med pil + tekst (aldri bare farge). Økte kostnader = opp. */
export function Endring({ diff, invertert }: { diff: number; invertert?: boolean }) {
  if (Math.abs(diff) < 0.5) return <span className="dempet">Uendret</span>;
  const opp = diff > 0;
  const klasse = invertert ? (opp ? 'ned' : 'opp') : opp ? 'opp' : 'ned';
  return (
    <span className={`endring ${klasse}`}>
      <Ikon navn={opp ? 'opp' : 'ned'} storrelse={13} />
      {kr(Math.abs(diff))}
    </span>
  );
}

export function Tom({ ikon, tittel, tekst, children }: { ikon: string; tittel: string; tekst?: string; children?: ReactNode }) {
  return (
    <div className="tom">
      <Ikon navn={ikon} storrelse={40} />
      <strong>{tittel}</strong>
      {tekst && <p>{tekst}</p>}
      {children}
    </div>
  );
}

export function Prikk({ farge }: { farge?: number }) {
  return <span className="prikk" style={{ background: farge === undefined ? 'var(--noytral-flyt)' : `var(--k${farge})` }} />;
}

export function Avatar({ navn, bilde }: { navn: string; bilde?: string }) {
  return <span className="avatar">{bilde ? <img src={bilde} alt="" referrerPolicy="no-referrer" /> : navn.slice(0, 1).toUpperCase()}</span>;
}

export function useUnikId() {
  return useId();
}
