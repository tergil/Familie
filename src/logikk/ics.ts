// Kalenderabonnement (iCalendar/.ics) som iPhone, Google og Outlook kan abonnere på.
// Gjentakelser sendes som enkeltavtaler (allerede utvidet), så unntak blir riktige i alle kalenderapper.
// Brukes av Edge Function «kalender» (supabase/kilde/kalender.ts). Ren logikk – testes i scripts/test-beregning.ts.
import type { KalenderPost } from './kalender';
import { leggTilDager, minutter } from './kalender';

/** Norsk tid med sommertid, så klokkeslettene blir riktige på telefonen */
const TIDSSONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Oslo',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

/** Tekst i ICS: \ ; , og linjeskift må beskyttes */
export const icsTekst = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Linjer over 75 byte brytes (fortsettelse starter med mellomrom), uten å dele et tegn */
export function brett(linje: string): string {
  const koder = new TextEncoder();
  const deler: string[] = [];
  let naa = '';
  let lengde = 0;
  for (const tegn of linje) {
    const n = koder.encode(tegn).length;
    if (lengde + n > (deler.length ? 74 : 75)) { deler.push(naa); naa = ''; lengde = 0; }
    naa += tegn;
    lengde += n;
  }
  deler.push(naa);
  return deler.join('\r\n ');
}

const dato8 = (d: string) => d.replace(/-/g, '');
const tid6 = (t: string) => `${t.slice(0, 2)}${t.slice(3, 5)}00`;
const tilTid = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function lagIcs(poster: KalenderPost[], navn: (id: string) => string | undefined, naa = new Date(), kalendernavn = 'Familie'): string {
  const stempel = naa.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const linjer = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Familie//Kalender//NO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsTekst(kalendernavn)}`, 'X-WR-TIMEZONE:Europe/Oslo', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    ...TIDSSONE,
  ];
  for (const p of poster) {
    const hvem = p.hvem.map(navn).filter(Boolean) as string[];
    const ansvarlig = p.ansvarlig ? navn(p.ansvarlig) : undefined;
    const beskrivelse = [hvem.length ? `Gjelder: ${hvem.join(', ')}` : '', ansvarlig ? `Henter/leverer: ${ansvarlig}` : '', p.notat ?? ''].filter(Boolean).join('\n');
    linjer.push('BEGIN:VEVENT', `UID:${p.nokkel.replace(/[^A-Za-z0-9-]/g, '-')}@familie`, `DTSTAMP:${stempel}`);
    if (p.fra) {
      // Uten sluttid: én time. Slutt før start (over midnatt) flyttes til neste dag.
      const start = minutter(p.fra);
      const slutt = p.til ? minutter(p.til) : start + 60;
      const sluttDato = p.sluttDato ?? (slutt <= start ? leggTilDager(p.dato, 1) : p.dato);
      linjer.push(`DTSTART;TZID=Europe/Oslo:${dato8(p.dato)}T${tid6(p.fra)}`,
        `DTEND;TZID=Europe/Oslo:${dato8(sluttDato)}T${tid6(p.til ?? tilTid(Math.min(start + 60, 23 * 60 + 59)))}`);
    } else {
      linjer.push(`DTSTART;VALUE=DATE:${dato8(p.dato)}`, `DTEND;VALUE=DATE:${dato8(leggTilDager(p.sluttDato ?? p.dato, 1))}`, 'TRANSP:TRANSPARENT');
    }
    linjer.push(`SUMMARY:${icsTekst(`${p.tittel}${ansvarlig ? ` (${ansvarlig})` : ''}`)}`);
    if (p.sted) linjer.push(`LOCATION:${icsTekst(p.sted)}`);
    if (beskrivelse) linjer.push(`DESCRIPTION:${icsTekst(beskrivelse)}`);
    linjer.push('END:VEVENT');
  }
  linjer.push('END:VCALENDAR');
  return linjer.map(brett).join('\r\n') + '\r\n';
}
