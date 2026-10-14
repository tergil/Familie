// Varsler: hva som skal varsles i dag, ut fra listene og innstillingene til én bruker.
// Kjøres av Edge Function «varsler» (supabase/kilde/varsler.ts) hver time, men ligger her så den kan testes.
// Ren logikk uten React og uten nettleser.
import type { Hendelse, Liste, Punkt, VarselInnstillinger, VarselType } from '../data/modell';
import { STANDARD_VARSLER } from '../data/modell';
import { kalenderPoster, leggTilDager, minutter, paaDato } from './kalender';
import { anledningsNavn, ANLEDNING_IKON, forekomster } from './gaveaar';
import { dagerMellom, erBrukt, erFerdig, hageIMaaned, huskelapp } from './lister';

export interface Varsel {
  type: VarselType;
  /** Nøkkelen som sendes. Er den sendt før, sendes ikke varselet igjen. */
  nokkel: string;
  /** Alle nøkler som regnes som sendt etterpå (tidligere varseltrinn som ble hoppet over) */
  nokler: string[];
  tittel: string;
  tekst: string;
  /** Relativ adresse i appen, f.eks. «#/lister/<id>» */
  url: string;
}

const MAANEDER = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

/** «I dag», «I morgen», «Om 3 dager» */
export function naarTekst(dager: number): string {
  return dager === 0 ? 'i dag' : dager === 1 ? 'i morgen' : `om ${dager} dager`;
}

/** «fre. 30. okt.» */
function datoKort(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Hvilket varseltrinn gjelder i dag? Trinnene er dager før (f.eks. [21, 0]).
 * Det minste trinnet som er ≥ dagene som er igjen, sendes. Større trinn som ble hoppet over
 * (f.eks. når noe legges inn sent) merkes som sendt, så de ikke kommer etterpå.
 * Samme dag (0) gjelder bare på selve dagen.
 */
export function varseltrinn(dager: number, trinn: number[]): { trinn: number; alle: number[] } | null {
  if (dager < 0) return null;
  const aktuelle = [...new Set(trinn)].filter((t) => dager <= t).sort((a, b) => a - b);
  return aktuelle.length ? { trinn: aktuelle[0], alle: aktuelle } : null;
}

/** Lagrede innstillinger fylt ut med standardverdier (nye varseltyper mangler i eldre innstillinger) */
export function medStandard(inn: Partial<VarselInnstillinger> | null | undefined): VarselInnstillinger {
  // Tomme verdier (f.eks. en type som mangler) skal ikke overskrive standarden
  const typer = Object.fromEntries(Object.entries(inn?.typer ?? {}).filter(([, v]) => v && typeof v === 'object'));
  return { ...STANDARD_VARSLER, ...(inn ?? {}), typer: { ...STANDARD_VARSLER.typer, ...typer } };
}

export interface Kalenderdata {
  hendelser: Hendelse[];
  /** Navn på person eller familiemedlem */
  navn: (id: string) => string | undefined;
}

/** Linje i morgenoversikten: «16:00 Henting barnehagen – Ingrid» */
const avtaleLinje = (p: { fra?: string; tittel: string; ansvarlig?: string }, navn: Kalenderdata['navn']) =>
  `${p.fra ?? 'Hele dagen'} ${p.tittel}${p.ansvarlig && navn(p.ansvarlig) ? ` – ${navn(p.ansvarlig)}` : ''}`;

/** Alle varsler som er aktuelle i dag for én bruker. Listene skal være de brukeren kan se. */
export function beregnVarsler(lister: Liste[], punkter: Punkt[], innstillinger: VarselInnstillinger, iDag: string, kal?: Kalenderdata): Varsel[] {
  const ut: Varsel[] = [];
  const inn = medStandard(innstillinger);
  const t = inn.typer;
  const maksTrinn = Math.max(0, ...Object.values(t).filter((v) => v.pa).flatMap((v) => v.dager));
  const kjoptTekst = (gaver: Punkt[]) => gaver.filter((g) => erBrukt('gaveaar', g.status)).map((g) => g.tekst).join(', ');

  // Bursdager og andre anledninger (én per person og anledning)
  const alle = forekomster(lister, punkter, iDag, maksTrinn);
  for (const f of alle) {
    const type: VarselType = f.anledning.type === 'bursdag' ? 'bursdag' : f.anledning.type === 'jul' ? 'jul' : 'andre';
    if (type === 'jul' || !t[type].pa) continue;
    const valg = varseltrinn(f.dager, t[type].dager);
    if (!valg) continue;
    const kjopt = kjoptTekst(f.gaver);
    if (valg.trinn > 0 && inn.bareUtenGave && kjopt) continue;
    const base = `${type}:${f.mottaker.id}:${f.anledning.id}:${f.dato}`;
    const navn = f.mottaker.tekst;
    const ikon = ANLEDNING_IKON[f.anledning.type];
    const hva = type === 'bursdag'
      ? `${navn} har bursdag${f.alder !== undefined ? ` (fyller ${f.alder})` : ''}`
      : `${anledningsNavn(f.anledning)} – ${navn}`;
    ut.push({
      type, nokkel: `${base}:${valg.trinn}`, nokler: valg.alle.map((x) => `${base}:${x}`),
      tittel: `${ikon} ${hva} ${naarTekst(f.dager)}`,
      tekst: kjopt ? `Gave: ${kjopt}` : f.dager === 0 ? 'Ingen gave er registrert.'
        : `${datoKort(f.dato)}: ingen gave kjøpt ennå${f.ideer ? ` – ${f.ideer} ${f.ideer === 1 ? 'idé' : 'ideer'} i idébanken` : ''}.`,
      url: `#/lister/${f.liste.id}`,
    });
  }

  // Jul: ett samlet varsel
  if (t.jul.pa) {
    const jul = alle.filter((f) => f.anledning.type === 'jul');
    if (jul.length) {
      const { dato, dager, aar } = jul[0];
      const valg = varseltrinn(dager, t.jul.dager);
      const personer = [...new Set(jul.map((f) => f.mottaker.tekst.trim().toLowerCase()))];
      const medGave = new Set(jul.filter((f) => f.gaver.some((g) => erBrukt('gaveaar', g.status))).map((f) => f.mottaker.tekst.trim().toLowerCase()));
      const alleKjopt = medGave.size >= personer.length;
      if (valg && !(valg.trinn > 0 && inn.bareUtenGave && alleKjopt)) {
        const base = `jul:${dato}`;
        ut.push({
          type: 'jul', nokkel: `${base}:${valg.trinn}`, nokler: valg.alle.map((x) => `${base}:${x}`),
          tittel: dager === 0 ? '🎄 God jul!' : `🎄 Jul ${naarTekst(dager)}`,
          tekst: `Gave kjøpt til ${medGave.size} av ${personer.length}.`,
          url: `#/lister/plan/jul/${aar}`,
        });
      }
    }
  }

  // Frister i huskelister, oppgaver o.l.
  if (t.frist.pa) {
    for (const h of huskelapp(lister, punkter, iDag, maksTrinn)) {
      const valg = varseltrinn(h.dager, t.frist.dager);
      if (!valg) continue;
      const base = `frist:${h.punkt.id}:${h.punkt.dato}`;
      ut.push({
        type: 'frist', nokkel: `${base}:${valg.trinn}`, nokler: valg.alle.map((x) => `${base}:${x}`),
        tittel: `${h.liste.ikon} ${h.dager === 0 ? 'I dag' : h.dager === 1 ? 'I morgen' : `Om ${h.dager} dager`}: ${h.punkt.tekst}`,
        tekst: `${h.liste.navn} · frist ${datoKort(h.punkt.dato!)}`,
        url: `#/lister/${h.liste.id}`,
      });
    }
  }

  // Kalenderluker (f.eks. adventskalender)
  if (t.kalender.pa) {
    const kalendere = new Map(lister.filter((l) => !l.mal && l.type === 'kalender').map((l) => [l.id, l]));
    for (const p of punkter) {
      const liste = kalendere.get(p.listeId);
      if (!liste || !p.dato) continue;
      const dager = dagerMellom(iDag, p.dato);
      const valg = varseltrinn(dager, t.kalender.dager);
      if (!valg) continue;
      const base = `kalender:${p.id}:${p.dato}`;
      ut.push({
        type: 'kalender', nokkel: `${base}:${valg.trinn}`, nokler: valg.alle.map((x) => `${base}:${x}`),
        tittel: `${liste.ikon} ${dager === 0 ? 'Luke i dag' : `Luke ${naarTekst(dager)}`}: ${p.tekst}`,
        tekst: p.notat || (erFerdig('kalender', p.status) ? 'Klar.' : 'Ingen idé lagt inn ennå.'),
        url: `#/lister/${liste.id}`,
      });
    }
  }

  // Hagen: den 1. i måneden
  if (t.hage.pa && iDag.endsWith('-01')) {
    const oppgaver = hageIMaaned(lister, punkter, iDag).filter((o) => !o.gjort);
    if (oppgaver.length) {
      ut.push({
        type: 'hage', nokkel: `hage:${iDag.slice(0, 7)}`, nokler: [`hage:${iDag.slice(0, 7)}`],
        tittel: `🌱 I hagen i ${MAANEDER[Number(iDag.slice(5, 7)) - 1]}`,
        tekst: oppgaver.map((o) => (o.forelder ? `${o.forelder.tekst}: ${o.punkt.tekst.toLowerCase()}` : o.punkt.tekst)).join(', '),
        url: `#/lister/${oppgaver[0].liste.id}`,
      });
    }
  }
  // Morgenoversikt over avtalene i dag (0) og/eller i morgen (1)
  if (kal && t.avtaler.pa) {
    for (const d of [...new Set(t.avtaler.dager)].sort()) {
      const dato = leggTilDager(iDag, d);
      const poster = kalenderPoster(kal.hendelser, [], [], dato, dato, { anledninger: false, frister: false }).filter((x) => paaDato(x, dato));
      if (!poster.length) continue;
      const nokkel = `avtaler:${dato}:${d}`;
      ut.push({
        type: 'avtaler', nokkel, nokler: [nokkel],
        tittel: `${d === 0 ? 'I dag' : 'I morgen'}: ${poster.length} ${poster.length === 1 ? 'avtale' : 'avtaler'}`,
        tekst: poster.slice(0, 5).map((x) => avtaleLinje(x, kal.navn)).join('\n') + (poster.length > 5 ? `\n… og ${poster.length - 5} til` : ''),
        url: '#/kalender',
      });
    }
  }
  return ut;
}

/**
 * Varsel før avtaler som har «varsel før» (f.eks. 30 min). Sjekkes hvert kvarter: varselet sendes når tidspunktet
 * (start minus varseltid) er innenfor siste kvarter. Gjelder avtalen bestemte voksne (hvem/henter), får bare de varsel.
 */
export function forVarsler(hendelser: Hendelse[], naa: { dato: string; minutt: number }, kal: Kalenderdata & { personId?: string; voksne: Set<string> }, vindu = 15): Varsel[] {
  const ut: Varsel[] = [];
  const poster = kalenderPoster(hendelser, [], [], naa.dato, leggTilDager(naa.dato, 1), { anledninger: false, frister: false });
  for (const p of poster) {
    const varselMin = p.forekomst?.hendelse.varselMin;
    if (!p.fra || !varselMin) continue;
    const start = (p.dato === naa.dato ? 0 : 1440) + minutter(p.fra);
    const varselTid = start - varselMin;
    if (varselTid > naa.minutt || varselTid <= naa.minutt - vindu) continue;
    const involverte = [...p.hvem, ...(p.ansvarlig ? [p.ansvarlig] : [])].filter((id) => kal.voksne.has(id));
    if (involverte.length && kal.personId && !involverte.includes(kal.personId)) continue;
    const nokkel = `for:${p.nokkel}`;
    const ansvarlig = p.ansvarlig ? kal.navn(p.ansvarlig) : undefined;
    ut.push({
      type: 'avtaleFor', nokkel, nokler: [nokkel],
      tittel: `${p.tittel} ${p.dato === naa.dato ? 'kl.' : 'i morgen kl.'} ${p.fra}`,
      tekst: [ansvarlig ? (p.ansvarlig === kal.personId ? 'Det er du som henter/leverer' : `${ansvarlig} henter/leverer`) : '', p.sted ?? ''].filter(Boolean).join(' · ') || 'Påminnelse',
      url: '#/kalender',
    });
  }
  return ut;
}

/** Mange varsler samme dag blir ett samlet varsel, så telefonen ikke fylles opp */
export function slaaSammen(varsler: Varsel[], maks = 3): { tittel: string; tekst: string; url: string; nokler: string[] }[] {
  if (varsler.length <= maks) return varsler.map((v) => ({ tittel: v.tittel, tekst: v.tekst, url: v.url, nokler: v.nokler }));
  return [{
    tittel: `${varsler.length} påminnelser i dag`,
    tekst: varsler.slice(0, 4).map((v) => v.tittel).join('\n') + (varsler.length > 4 ? `\n… og ${varsler.length - 4} til` : ''),
    url: '#/oversikt',
    nokler: varsler.flatMap((v) => v.nokler),
  }];
}

/** Dato, time og minutt fra midnatt akkurat nå i Norge (serveren går i UTC) */
export function norskTid(naa = new Date()): { dato: string; time: number; minutt: number } {
  const deler = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(naa).map((d) => [d.type, d.value]));
  const time = Number(deler.hour);
  return { dato: `${deler.year}-${deler.month}-${deler.day}`, time, minutt: time * 60 + Number(deler.minute) };
}
