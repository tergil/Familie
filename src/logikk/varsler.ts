// Varsler: hva som skal varsles i dag, ut fra listene og innstillingene til én bruker.
// Kjøres av Edge Function «varsler» (supabase/kilde/varsler.ts) hver time, men ligger her så den kan testes.
// Ren logikk uten React og uten nettleser.
import type { Liste, Punkt, VarselInnstillinger, VarselType } from '../data/modell';
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

/** Alle varsler som er aktuelle i dag for én bruker. Listene skal være de brukeren kan se. */
export function beregnVarsler(lister: Liste[], punkter: Punkt[], inn: VarselInnstillinger, iDag: string): Varsel[] {
  const ut: Varsel[] = [];
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

/** Dato og time akkurat nå i Norge (serveren går i UTC) */
export function norskTid(naa = new Date()): { dato: string; time: number } {
  const deler = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(naa).map((d) => [d.type, d.value]));
  return { dato: `${deler.year}-${deler.month}-${deler.day}`, time: Number(deler.hour) };
}
