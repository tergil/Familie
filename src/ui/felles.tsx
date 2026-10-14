// Små gjenbrukbare byggeklosser. Hold dem enkle – stilen ligger i stil/app.css.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import LOGO from './logo.json';
import { listeIkon } from '../logikk/lister';

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

/** "5. des." */
export function kortDato(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

/** "fre. 5. des." */
export function ukedagDato(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Dager til en dato som tekst: «I dag», «Om 3 dager», «2 dager siden» */
export function dagerTekst(dager: number): string {
  if (dager === 0) return 'I dag';
  if (dager === 1) return 'I morgen';
  if (dager === -1) return 'I går';
  return dager > 0 ? `Om ${dager} dager` : `${-dager} dager siden`;
}

export const MAANEDER_KORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

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
  liste: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11" /><circle cx="5.2" cy="18" r="1.2" /></>,
  kalender: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  blad: <><path d="M5 19C5 11 10 5 20 5c0 10-6 15-14 15" /><path d="M5 19l8-8" /></>,
  gave: <><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13" /><path d="M12 8C10 4 6.5 4 6.5 6.2 6.5 8 9.5 8 12 8c2.5 0 5.5 0 5.5-1.8C17.5 4 14 4 12 8z" /></>,
  stjerne: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  lenke: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  klokke: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  sted: <><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  del: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></>,
  dokument: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  grep: <><circle cx="9" cy="6" r="1.3" /><circle cx="15" cy="6" r="1.3" /><circle cx="9" cy="12" r="1.3" /><circle cx="15" cy="12" r="1.3" /><circle cx="9" cy="18" r="1.3" /><circle cx="15" cy="18" r="1.3" /></>,
  binders: <path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1L13 4.4a3.3 3.3 0 0 1 4.7 4.7l-7.8 7.8a1.7 1.7 0 0 1-2.4-2.4L14.6 7.4" />,
  bjelle: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  mobil: <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></>,
  skjerm: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  google: <></>,
  // Listeikoner (erstatter emojiene – se LISTEIKONER)
  hus: <><path d="M3 12 12 4l9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  juletre: <><path d="M12 3 7 10h3l-4 6h12l-4-6h3z" /><path d="M12 16v4" /></>,
  lys: <><rect x="9" y="10" width="6" height="11" rx="1" /><path d="M12 10V8.5" /><path d="M12 3c1.6 1.7 1.6 3.3 0 4.3-1.6-1-1.6-2.6 0-4.3z" /></>,
  koffert: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18" /></>,
  fjell: <><path d="M2.5 20 9 8l4 7 2.5-4L21.5 20z" /><path d="M7 11.5l2 1.3 1.8-1" /></>,
  bestikk: <><path d="M5 3v5a2 2 0 0 0 4 0V3M7 3v18" /><path d="M17 21V3c-2.2 1.2-3.3 4-3.3 8H17" /></>,
  tv: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M9 21h6M8 2.5 12 6l4-3.5" /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7.5 4v16M16.5 4v16M3 9h4.5M3 15h4.5M16.5 9H21M16.5 15H21" /></>,
  bok: <><path d="M4 19.5V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2.5 2 2 0 0 0 2 2h14" /><path d="M8.5 7h7" /></>,
  spire: <><path d="M12 21v-9" /><path d="M12 12C12 8 9.5 6 5 6c0 4 2.5 6 7 6z" /><path d="M12 10c0-3 2.3-5.2 7-5.2 0 3.4-2.3 5.2-7 5.2z" /></>,
  blomst: <><path d="M12 21v-8" /><path d="M7 4.5l2.6 2.2L12 3.5l2.4 3.2L17 4.5V9a5 5 0 0 1-10 0z" /><path d="M12 18c-1.8-2-4.2-2.3-6-1.6M12 18c1.8-2 4.2-2.3 6-1.6" /></>,
  verktoy: <path d="M14.7 6.3a4 4 0 0 0-5.3 5.3L3.5 17.5a2.1 2.1 0 0 0 3 3l5.9-5.9a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.6-.4-.4-2.6z" />,
  lyn: <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />,
  sofa: <><path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" /><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z" /><path d="M5.5 18v2M18.5 18v2" /></>,
  fest: <><path d="M4 20.5 8.5 8l7.5 7.5z" /><path d="M14 3.5v2M19.5 9.5h2M17 7l1.5-1.5M12.5 11c1-2 2.8-3 5-3" /></>,
  hjerte: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />,
  bil: <><path d="M5 16.5V12l2-5h10l2 5v4.5" /><path d="M3 12h18v4.5H3z" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="16.5" cy="19" r="1.5" /></>,
  barnevogn: <><path d="M13 3.5V11h8a7.5 7.5 0 0 0-8-7.5z" /><path d="M3 6h2l2 5h14a7 7 0 0 1-7 6H9.5" /><circle cx="9" cy="20" r="1.5" /><circle cx="17" cy="20" r="1.5" /></>,
  pote: <><circle cx="6.5" cy="10.5" r="1.7" /><circle cx="10" cy="6.5" r="1.7" /><circle cx="14" cy="6.5" r="1.7" /><circle cx="17.5" cy="10.5" r="1.7" /><path d="M12 12c-3 0-5.5 3.5-5.5 5.6 0 1.9 1.9 2.4 3 1.9l2.5-1 2.5 1c1.1.5 3 0 3-1.9C17.5 15.5 15 12 12 12z" /></>,
  lyspare: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" /></>,
  kake: <><path d="M3.5 21h17M5 21v-7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v7" /><path d="M5 17c2 1.3 3.5 1.3 5 0 1.5 1.3 3.5 1.3 5 0 1.5 1.3 3 1.3 4 0" /><path d="M12 13V9.5" /><path d="M12 4.5c1.1 1.1 1.1 2.3 0 3.2-1.1-.9-1.1-2.1 0-3.2z" /></>,
  pose: <><path d="M5 8h14l-1 12.5H6z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  fly: <path d="M10.2 13.8 3.5 11.3 5 9.8l7.2.8 4.2-4.2a2 2 0 0 1 2.8 2.8L15 13.4l.8 7.2-1.5 1.5-2.5-6.7-2.8 2.8.4 2.4-1.3 1.3-1.5-3-3-1.5 1.3-1.3 2.4.4z" />,
  ball: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5l4 2.9-1.5 4.6h-5L8 10.4z" /><path d="M12 3v4.5M16 10.4l4.5-1.6M14.5 15l2.7 4M9.5 15l-2.7 4M8 10.4 3.5 8.8" /></>,
  musikk: <><path d="M9 18V5.5l11-2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  mynt: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  telt: <><path d="M3 20 12 4l9 16z" /><path d="M12 20 9 14h6z" /></>,
  slips: <path d="M10 3h4l-1 3 2 11-3 4-3-4 2-11z" />,
  smil: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14c1.8 2.2 5.2 2.2 7 0M9 9.5v.5M15 9.5v.5" /></>,
  oye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  oyeAv: <><path d="M10 5.7A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.9 0 3.5-.6 4.9-1.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></>,
};

/**
 * Ikonene man kan velge for en liste, gruppert som i velgeren. Navnene lagres i Liste.ikon.
 * Eldre lister har emojier lagret – listeIkon() i logikk/lister.ts oversetter dem.
 */
export const LISTEIKONER = [
  'liste', 'pose', 'gave', 'kake', 'fest', 'juletre', 'lys', 'hjerte', 'stjerne',
  'koffert', 'fly', 'fjell', 'telt', 'sol', 'bil', 'bestikk', 'tv', 'film', 'bok', 'musikk', 'ball',
  'spire', 'blomst', 'hus', 'sofa', 'verktoy', 'lyn', 'lyspare', 'barnevogn', 'pote', 'mynt', 'kalender',
];

/** Navn på listeikonene (skjermleser og verktøytips) */
export const IKON_ETIKETT: Record<string, string> = {
  liste: 'Liste', pose: 'Handlepose', gave: 'Gave', kake: 'Kake', fest: 'Fest', juletre: 'Juletre', lys: 'Lys', hjerte: 'Hjerte',
  stjerne: 'Stjerne', koffert: 'Koffert', fly: 'Fly', fjell: 'Fjell', telt: 'Telt', sol: 'Sol', bil: 'Bil', bestikk: 'Mat',
  tv: 'TV', film: 'Film', bok: 'Bok', musikk: 'Musikk', ball: 'Sport', spire: 'Hage', blomst: 'Blomst', hus: 'Hus', sofa: 'Sofa',
  verktoy: 'Verktøy', lyn: 'Strøm', lyspare: 'Idé', barnevogn: 'Barn', pote: 'Dyr', mynt: 'Penger', kalender: 'Kalender',
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

/**
 * Ikon i en farget rute. Fargen betyr kategori: lister i samme kategori har samme farge
 * (Gaver rosa, Jul terrakotta, Hage grønn, Hus havblå, Reise og Fritid gul). Uten kategori: nøytral.
 */
export function IkonBoble({ ikon, kategori, storrelse = 'normal' }: { ikon?: string; kategori?: string; storrelse?: 'liten' | 'normal' | 'stor' }) {
  const navn = listeIkon(ikon);
  const px = storrelse === 'liten' ? 16 : storrelse === 'stor' ? 28 : 20;
  return <span className={`liste-ikon ${kategoriTone(kategori)}${storrelse === 'normal' ? '' : ` ${storrelse}`}`} aria-hidden="true"><Ikon navn={navn} storrelse={px} /></span>;
}
const KATEGORI_TONE: Record<string, string> = {
  gaver: 'tone-rosa', jul: 'tone-terrakotta', hage: 'tone-gronn', hus: 'tone-havbla', reise: 'tone-gul', fritid: 'tone-gul',
};
const TONER = ['tone-gul', 'tone-terrakotta', 'tone-havbla', 'tone-rosa', 'tone-gronn'];
/** Egne kategorier får en fast farge ut fra navnet; Annet og ingen kategori er nøytrale */
function kategoriTone(kategori?: string): string {
  const k = (kategori ?? '').trim().toLowerCase();
  if (!k || k === 'annet') return 'tone-noytral';
  return KATEGORI_TONE[k] ?? TONER[[...k].reduce((sum, t) => sum + t.charCodeAt(0), 0) % TONER.length];
}

// ---------------------------------------------------------------- Logo

/**
 * Sulamitten-symbolet: krusedull som blir en sirkel («Fra surr til system»).
 * mikro = færre løkker og ingen stråler (under ~24 px). animer = streken tegnes opp (bare ved utvalgte øyeblikk).
 */
export function Logo({ hoyde = 32, mikro, animer }: { hoyde?: number; mikro?: boolean; animer?: boolean }) {
  return (
    <svg className={`logo${animer ? ' tegn' : ''}`} width={hoyde * 2} height={hoyde} viewBox={LOGO.viewBox} aria-hidden="true">
      <path className="logo-strek" d={mikro ? LOGO.mikro : LOGO.sti} pathLength={1} fill="none" stroke="currentColor"
        strokeWidth={mikro ? 12 : 7} strokeLinecap="round" strokeLinejoin="round" />
      {!mikro && LOGO.straler.map((d, i) => (
        <path key={d} className={`logo-straale s${i}`} d={d} fill="none" strokeWidth={6.5} strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** Logo med ordmerket «Sulamitten» (og evt. slagordet) */
export function Merke({ hoyde = 28, slagord, animer, loddrett }: { hoyde?: number; slagord?: boolean; animer?: boolean; loddrett?: boolean }) {
  return (
    <span className={`merke-logo${loddrett ? ' loddrett' : ''}`}>
      <Logo hoyde={hoyde} animer={animer} />
      <span className="merke-tekst">
        <span className="ordmerke">Sulamitten</span>
        {slagord && <span className="slagord">Hele sulamitten. Samlet.</span>}
      </span>
    </span>
  );
}

/** Lasteskjerm: logoen tegnes opp (rolig, gjentas til innholdet er klart) */
export function Laster() {
  return <div className="laster" role="status"><Logo hoyde={44} animer /><span className="skjult">Laster …</span></div>;
}

// ---------------------------------------------------------------- Bekreft (før sletting o.l.)

export interface BekreftValg {
  tittel: string;
  /** Hva som skjer – konsekvensen skal komme tydelig fram */
  tekst?: ReactNode;
  /** Teksten på knappen, f.eks. «Slett lista» */
  knapp?: string;
  /** Ikon i dialogen og på knappen (standard: søppelbøtte) */
  ikon?: string;
  ja: () => void;
}

/** Dialog som spør før noe slettes. Avbryt er valgt når den åpnes, så Enter ikke sletter ved et uhell. */
export function Bekreft({ tittel, tekst, knapp = 'Slett', ikon = 'slett', ja, nei }: BekreftValg & { nei: () => void }) {
  const tittelId = useId(), tekstId = useId();
  useEffect(() => {
    // Escape lukker bare denne dialogen, ikke arket under
    const tast = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); nei(); } };
    window.addEventListener('keydown', tast, true);
    return () => window.removeEventListener('keydown', tast, true);
  }, [nei]);
  return createPortal(
    <div className="slor bekreft-slor" onMouseDown={(e) => e.target === e.currentTarget && nei()}>
      <div className="bekreft" role="alertdialog" aria-modal="true" aria-labelledby={tittelId} aria-describedby={tekst ? tekstId : undefined}>
        <span className="bekreft-ikon"><Ikon navn={ikon} storrelse={22} /></span>
        <h2 id={tittelId}>{tittel}</h2>
        {tekst && <div id={tekstId} className="bekreft-tekst">{tekst}</div>}
        <div className="bekreft-knapper">
          <button type="button" className="knapp" autoFocus onClick={nei}>Avbryt</button>
          <button type="button" className="knapp slett" onClick={ja}><Ikon navn={ikon} storrelse={18} />{knapp}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** const [bekreftDialog, spor] = useBekreft(); … spor({ tittel, tekst, knapp, ja }) … {bekreftDialog} */
export function useBekreft(): [ReactNode, (v: BekreftValg) => void] {
  const [valg, setValg] = useState<BekreftValg | null>(null);
  const nei = useCallback(() => setValg(null), []);
  const dialog = valg ? <Bekreft {...valg} nei={nei} ja={() => { setValg(null); valg.ja(); }} /> : null;
  return [dialog, setValg];
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
  valg: { verdi: T; tekst: string; ikon?: string }[]; verdi: T; endre: (v: T) => void; full?: boolean; etikett: string;
}) {
  return (
    <div className={`segment${full ? ' full' : ''}`} role="group" aria-label={etikett}>
      {valg.map((v) => (
        <button key={v.verdi} type="button" aria-pressed={v.verdi === verdi} onClick={() => endre(v.verdi)}>{v.ikon && <Ikon navn={v.ikon} storrelse={15} />}{v.tekst}</button>
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
