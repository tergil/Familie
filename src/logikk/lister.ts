// Huskelister: listetyper, maler, adventskalender, budsjettkobling, huskelapp, hagesesong og gavehistorikk.
// Ren logikk uten React – testes i scripts/test-beregning.ts.
import type { Id, Liste, ListeType, Punkt } from '../data/modell';
import { nyId } from '../data/modell';

// ---------------------------------------------------------------- Listetyper

export interface StatusValg {
  id: string;
  tekst: string;
}

export type PunktFelt = 'belop' | 'lenke' | 'mottaker' | 'vurdering' | 'plassering' | 'maaneder' | 'dato';

export interface TypeInfo {
  navn: string;
  beskrivelse: string;
  ikon: string;
  /** Statusene i rekkefølge. Den siste betyr ferdig. To statuser vises som avkrysning. */
  statuser: StatusValg[];
  /** Statuser der pengene er brukt (teller som «kjøpt» mot budsjettet) */
  brukt: string[];
  felt: PunktFelt[];
}

export const LISTETYPER: Record<ListeType, TypeInfo> = {
  sjekk: {
    navn: 'Huskeliste', beskrivelse: 'Vanlig liste med avkrysning', ikon: '📝',
    statuser: [{ id: 'apen', tekst: 'Ikke gjort' }, { id: 'ferdig', tekst: 'Gjort' }], brukt: ['ferdig'],
    felt: ['dato', 'belop', 'lenke'],
  },
  gave: {
    navn: 'Gaveliste', beskrivelse: 'Idé → kjøpt → gitt, med mottaker og historikk', ikon: '🎁',
    statuser: [{ id: 'ide', tekst: 'Idé' }, { id: 'kjopt', tekst: 'Kjøpt' }, { id: 'gitt', tekst: 'Gitt' }], brukt: ['kjopt', 'gitt'],
    felt: ['mottaker', 'belop', 'lenke', 'dato'],
  },
  onske: {
    navn: 'Ønskeliste', beskrivelse: 'Ting dere ønsker eller trenger, med pris', ikon: '✨',
    statuser: [{ id: 'onske', tekst: 'Ønsker' }, { id: 'kjopt', tekst: 'Kjøpt' }], brukt: ['kjopt'],
    felt: ['belop', 'lenke', 'dato'],
  },
  oppgave: {
    navn: 'Oppgaver', beskrivelse: 'Ting som skal fikses, f.eks. av elektrikeren', ikon: '🔧',
    statuser: [{ id: 'apen', tekst: 'Må fikses' }, { id: 'bestilt', tekst: 'Bestilt' }, { id: 'ferdig', tekst: 'Ferdig' }], brukt: ['ferdig'],
    felt: ['belop', 'dato', 'lenke'],
  },
  opplevelse: {
    navn: 'Steder å besøke', beskrivelse: 'Restauranter og opplevelser, med vurdering', ikon: '🍽️',
    statuser: [{ id: 'vil', tekst: 'Vil prøve' }, { id: 'besokt', tekst: 'Besøkt' }], brukt: [],
    felt: ['vurdering', 'lenke', 'dato'],
  },
  serie: {
    navn: 'Serier og filmer', beskrivelse: 'Vil se → ser nå → sett, med vurdering', ikon: '📺',
    statuser: [{ id: 'vil', tekst: 'Vil se' }, { id: 'ser', tekst: 'Ser nå' }, { id: 'sett', tekst: 'Sett' }], brukt: [],
    felt: ['vurdering', 'lenke'],
  },
  hage: {
    navn: 'Hage', beskrivelse: 'Planter og ting, med stell per måned', ikon: '🌱',
    statuser: [{ id: 'apen', tekst: 'Aktiv' }], brukt: [],
    felt: ['plassering', 'maaneder'],
  },
  kalender: {
    navn: 'Kalender', beskrivelse: 'Luker med dato og idé, f.eks. adventskalender', ikon: '🕯️',
    statuser: [{ id: 'apen', tekst: 'Ikke klar' }, { id: 'klar', tekst: 'Klar' }], brukt: ['klar'],
    felt: ['dato', 'belop'],
  },
  gaveaar: {
    navn: 'Gaveår', beskrivelse: 'Faste mottakere med bursdag, jul og andre anledninger, idébank og budsjett per person', ikon: '🎂',
    statuser: [{ id: 'ide', tekst: 'Idé' }, { id: 'kjopt', tekst: 'Kjøpt' }, { id: 'gitt', tekst: 'Gitt' }], brukt: ['kjopt', 'gitt'],
    felt: ['belop', 'lenke'],
  },
};

export const STANDARD_KATEGORIER = ['Hus', 'Hage', 'Jul', 'Gaver', 'Reise', 'Fritid', 'Annet'];

/** Statusen punktet har – ukjente statuser (f.eks. etter typebytte) regnes som den første */
export function gyldigStatus(type: ListeType, status: string): string {
  const s = LISTETYPER[type].statuser;
  return s.some((x) => x.id === status) ? status : s[0].id;
}

export function erFerdig(type: ListeType, status: string): boolean {
  const s = LISTETYPER[type].statuser;
  return s.length > 1 && gyldigStatus(type, status) === s[s.length - 1].id;
}

export function erBrukt(type: ListeType, status: string): boolean {
  return LISTETYPER[type].brukt.includes(gyldigStatus(type, status));
}

export function nesteStatus(type: ListeType, status: string): string {
  const s = LISTETYPER[type].statuser;
  const i = s.findIndex((x) => x.id === gyldigStatus(type, status));
  return s[(i + 1) % s.length].id;
}

export function statusTekst(type: ListeType, status: string): string {
  return LISTETYPER[type].statuser.find((x) => x.id === gyldigStatus(type, status))!.tekst;
}

/** Ny status. ferdigDato settes første gang punktet blir kjøpt/ferdig, og fjernes når det settes tilbake til start. */
export function medStatus(p: Punkt, type: ListeType, status: string, iDag: string): Punkt {
  const forste = LISTETYPER[type].statuser[0].id;
  const ferdig = erBrukt(type, status) || erFerdig(type, status);
  return {
    ...p, status,
    ferdigDato: status === forste ? undefined : ferdig ? p.ferdigDato ?? iDag : p.ferdigDato,
  };
}

// ---------------------------------------------------------------- Sortering og tre

/** Toppnivå med underpunkter. Kalendere sorteres på dato, ellers på rekkefølge. */
export function lagTre(punkter: Punkt[], type: ListeType): { punkt: Punkt; barn: Punkt[] }[] {
  const ider = new Set(punkter.map((p) => p.id));
  const sorter = (a: Punkt, b: Punkt) =>
    type === 'kalender' ? (a.dato ?? '9999').localeCompare(b.dato ?? '9999') || a.rekkefolge - b.rekkefolge : a.rekkefolge - b.rekkefolge;
  const topp = punkter.filter((p) => !p.forelderId || !ider.has(p.forelderId)).sort(sorter);
  return topp.map((punkt) => ({ punkt, barn: punkter.filter((b) => b.forelderId === punkt.id).sort(sorter) }));
}

export function nesteRekkefolge(punkter: Punkt[]): number {
  return punkter.reduce((m, p) => Math.max(m, p.rekkefolge), 0) + 1;
}

export function nyttPunkt(listeId: Id, type: ListeType, tekst: string, rekkefolge: number, ekstra: Partial<Punkt> = {}): Punkt {
  return {
    id: nyId(), listeId, forelderId: null, tekst, notat: '', status: LISTETYPER[type].statuser[0].id,
    belop: null, dato: null, rekkefolge, ...ekstra,
  };
}

/** Gavelister: «Mamma: skjerf» → mottaker «Mamma», tekst «skjerf» */
export function tolkHurtig(type: ListeType, tekst: string): Partial<Punkt> & { tekst: string } {
  const t = tekst.trim();
  if (type === 'gave') {
    const m = t.match(/^([^:]{1,40}):\s*(.+)$/);
    if (m) return { mottaker: m[1].trim(), tekst: m[2].trim() };
  }
  return { tekst: t };
}

// ---------------------------------------------------------------- Kopier, nullstill og maler

/** Kopierer punktene til en ny liste med nye id-er. Statusene settes tilbake til start. */
export function kopierPunkter(punkter: Punkt[], tilListeId: Id, type: ListeType): Punkt[] {
  const nye = new Map(punkter.map((p) => [p.id, nyId()]));
  return punkter.map((p) => ({
    ...p, id: nye.get(p.id)!, listeId: tilListeId,
    forelderId: p.forelderId ? nye.get(p.forelderId) ?? null : null,
    status: LISTETYPER[type].statuser[0].id, ferdigDato: undefined, sistGjort: undefined,
  }));
}

/** Punktene som må endres for å fjerne alle avkrysninger (f.eks. pakkeliste før neste tur) */
export function nullstill(punkter: Punkt[], type: ListeType): Punkt[] {
  const forste = LISTETYPER[type].statuser[0].id;
  return punkter.filter((p) => p.status !== forste).map((p) => ({ ...p, status: forste, ferdigDato: undefined }));
}

export type MalPunkt = string | { tekst: string; barn?: string[] };

export interface Mal {
  id: string;
  navn: string;
  ikon: string;
  kategori: string;
  type: ListeType;
  beskrivelse: string;
  privat?: boolean;
  punkter: MalPunkt[];
}

export const MALER: Mal[] = [
  {
    id: 'pakke-hytte', navn: 'Pakkeliste hyttetur', ikon: '🏔️', kategori: 'Reise', type: 'sjekk',
    beskrivelse: 'Klær, mat og det som alltid glemmes. Nullstill før neste tur.',
    punkter: [
      { tekst: 'Klær', barn: ['Ullundertøy', 'Sokker', 'Ytterklær', 'Lue og votter', 'Innesko'] },
      { tekst: 'Toalettsaker', barn: ['Tannbørste og tannkrem', 'Medisiner', 'Leppepomade og solkrem'] },
      { tekst: 'Mat', barn: ['Frokost første dag', 'Kaffe', 'Snacks'] },
      { tekst: 'Annet', barn: ['Ladere', 'Sengetøy og håndklær', 'Brettspill', 'Tennbriketter', 'Nøkkel til hytta'] },
    ],
  },
  {
    id: 'pakke-syden', navn: 'Pakkeliste sydentur', ikon: '☀️', kategori: 'Reise', type: 'sjekk',
    beskrivelse: 'Pass, badetøy og solkrem.',
    punkter: [
      { tekst: 'Reisedokumenter', barn: ['Pass', 'Reiseforsikringskort', 'Billetter', 'Bankkort og litt kontanter'] },
      { tekst: 'Klær', barn: ['Badetøy', 'Sommerklær', 'Sandaler', 'Solbriller', 'Caps'] },
      { tekst: 'Toalettsaker', barn: ['Solkrem', 'Aftersun', 'Medisiner', 'Tannbørste'] },
      { tekst: 'Annet', barn: ['Ladere og adapter', 'Hodetelefoner', 'Bok eller nettbrett'] },
    ],
  },
  {
    id: 'jul', navn: 'Juleforberedelser', ikon: '🎄', kategori: 'Jul', type: 'sjekk',
    beskrivelse: 'Det som må gjøres før jul. Kopier fra i fjor neste år.',
    punkter: ['Lage gaveliste', 'Sende julekort', 'Kjøpe juletre', 'Bake', 'Pynte', 'Handle julemat', 'Pakke inn gaver'],
  },
  {
    id: 'gaveaar', navn: 'Gaveår', ikon: '🎂', kategori: 'Gaver', type: 'gaveaar',
    beskrivelse: 'Faste mottakere med bursdag, jul, morsdag og farsdag. Ideer samles gjennom året og følger med til neste år.',
    punkter: [],
  },
  {
    id: 'gaver', navn: 'Gaver', ikon: '🎁', kategori: 'Gaver', type: 'gave', privat: true,
    beskrivelse: 'Privat som standard. Skriv «Mamma: skjerf» for å sette mottaker.',
    punkter: [],
  },
  {
    id: 'advent', navn: 'Adventskalender', ikon: '🕯️', kategori: 'Jul', type: 'kalender',
    beskrivelse: '24 luker eller bare søndagene i advent, pluss egne dager.',
    punkter: [],
  },
  {
    id: 'restauranter', navn: 'Restauranter vi vil prøve', ikon: '🍽️', kategori: 'Fritid', type: 'opplevelse',
    beskrivelse: 'Vil prøve → besøkt, med terningkast.', punkter: [],
  },
  {
    id: 'serier', navn: 'Serier og filmer', ikon: '📺', kategori: 'Fritid', type: 'serie',
    beskrivelse: 'Vil se → ser nå → sett.', punkter: [],
  },
  {
    id: 'hage', navn: 'Hagen', ikon: '🌱', kategori: 'Hage', type: 'hage',
    beskrivelse: 'Planter med plassering og stell per måned.', punkter: [],
  },
  {
    id: 'elektriker', navn: 'Til elektrikeren', ikon: '⚡', kategori: 'Hus', type: 'oppgave',
    beskrivelse: 'Samle oppdragene og anslått pris.', punkter: [],
  },
  {
    id: 'hus', navn: 'Ønsker til huset', ikon: '🏠', kategori: 'Hus', type: 'onske',
    beskrivelse: 'Koble til et sparemål og se hva som mangler.', punkter: [],
  },
];

/** Punktene i en innebygd mal */
export function punkterFraMal(mal: Mal, listeId: Id): Punkt[] {
  const ut: Punkt[] = [];
  let n = 0;
  for (const mp of mal.punkter) {
    const p = nyttPunkt(listeId, mal.type, typeof mp === 'string' ? mp : mp.tekst, ++n);
    ut.push(p);
    if (typeof mp !== 'string') for (const b of mp.barn ?? []) ut.push({ ...nyttPunkt(listeId, mal.type, b, ++n), forelderId: p.id });
  }
  return ut;
}

// ---------------------------------------------------------------- Adventskalender

const DAG = 86_400_000;

function isoUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function utc(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

/** Dager fra a til b (b − a), uavhengig av sommertid */
export function dagerMellom(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAG);
}

/** De fire søndagene i advent. 4. søndag er siste søndag før eller på julaften. */
export function adventssondager(aar: number): string[] {
  const julaften = Date.UTC(aar, 11, 24);
  const fjerde = julaften - new Date(julaften).getUTCDay() * DAG;
  return [21, 14, 7, 0].map((d) => isoUtc(fjerde - d * DAG));
}

export type KalenderModus = 'alle' | 'sondager';

export interface EgenDag {
  navn: string;
  /** MM-DD */
  dag: string;
}

export const FORSLAG_DAGER: EgenDag[] = [
  { navn: 'St. Lucia', dag: '12-13' },
  { navn: 'Lillejulaften', dag: '12-23' },
  { navn: 'Julaften', dag: '12-24' },
];

/** Lukene i en adventskalender: 24 dager eller søndagene i advent, pluss egne dager. Sortert på dato. */
export function kalenderLuker(aar: number, modus: KalenderModus, egne: EgenDag[]): { tekst: string; dato: string }[] {
  const luker = modus === 'alle'
    ? Array.from({ length: 24 }, (_, i) => ({ tekst: `Luke ${i + 1}`, dato: `${aar}-12-${String(i + 1).padStart(2, '0')}` }))
    : adventssondager(aar).map((dato, i) => ({ tekst: `${i + 1}. søndag i advent`, dato }));
  for (const e of egne) {
    const dato = `${aar}-${e.dag}`;
    const finnes = luker.find((l) => l.dato === dato);
    if (finnes) finnes.tekst = finnes.tekst.startsWith('Luke ') ? e.navn : `${finnes.tekst} · ${e.navn}`;
    else luker.push({ tekst: e.navn, dato });
  }
  return luker.sort((a, b) => a.dato.localeCompare(b.dato));
}

/** Året kalenderen bør gjelde for: i år, eller neste år etter jul */
export function kalenderAar(iDag: string): number {
  const aar = Number(iDag.slice(0, 4));
  return iDag.slice(5) > '12-24' ? aar + 1 : aar;
}

// ---------------------------------------------------------------- Budsjett

export interface ListeSum {
  /** Beløp på punkter som ikke er kjøpt ennå */
  planlagt: number;
  /** Beløp på kjøpte/ferdige punkter */
  brukt: number;
  antallMedBelop: number;
}

export function listeSum(type: ListeType, punkter: Punkt[]): ListeSum {
  let planlagt = 0;
  let brukt = 0;
  let antallMedBelop = 0;
  for (const p of punkter) {
    if (!p.belop) continue;
    antallMedBelop++;
    if (erBrukt(type, p.status)) brukt += p.belop;
    else planlagt += p.belop;
  }
  return { planlagt, brukt, antallMedBelop };
}

/** Et hovedpunkt er gjort når det selv er krysset av, eller når alle underpunktene er det */
export function erGjort(type: ListeType, p: Punkt, barn: Punkt[]): boolean {
  return erFerdig(type, p.status) || (barn.length > 0 && barn.every((b) => erFerdig(type, b.status)));
}

/** Fremdrift: antall ferdige av alle. Hovedpunkter med underpunkter er overskrifter og telles ikke.
 *  Hage og lister uten ferdig-status har ingen fremdrift. */
export function fremdrift(type: ListeType, punkter: Punkt[]): { ferdig: number; totalt: number } {
  const foreldre = new Set(punkter.map((p) => p.forelderId).filter(Boolean));
  const telles = punkter.filter((p) => !foreldre.has(p.id));
  if (LISTETYPER[type].statuser.length < 2) return { ferdig: 0, totalt: telles.length };
  return { ferdig: telles.filter((p) => erFerdig(type, p.status)).length, totalt: telles.length };
}

// ---------------------------------------------------------------- Huskelapp og hagesesong

export interface Huske {
  punkt: Punkt;
  liste: Liste;
  /** Dager til datoen. Negativ = forfalt. */
  dager: number;
}

/** Punkter med dato innen horisonten (eller forfalt) som ikke er ferdige. Kalenderluker og maler er ikke med. */
export function huskelapp(lister: Liste[], punkter: Punkt[], iDag: string, horisont = 14): Huske[] {
  const aktuelle = new Map(lister.filter((l) => !l.mal && l.type !== 'kalender' && l.type !== 'hage').map((l) => [l.id, l]));
  const ut: Huske[] = [];
  for (const p of punkter) {
    const liste = aktuelle.get(p.listeId);
    if (!liste || !p.dato || erFerdig(liste.type, p.status) || erBrukt(liste.type, p.status)) continue;
    const dager = dagerMellom(iDag, p.dato);
    if (dager <= horisont) ut.push({ punkt: p, liste, dager });
  }
  return ut.sort((a, b) => a.dager - b.dager);
}

export interface HageOppgave {
  punkt: Punkt;
  liste: Liste;
  /** Planten oppgaven hører til, når oppgaven er et underpunkt */
  forelder?: Punkt;
  /** Gjort denne måneden */
  gjort: boolean;
}

/** Hagepunkter som skal gjøres i måneden til iDag */
export function hageIMaaned(lister: Liste[], punkter: Punkt[], iDag: string): HageOppgave[] {
  const maaned = Number(iDag.slice(5, 7));
  const hager = new Map(lister.filter((l) => !l.mal && l.type === 'hage').map((l) => [l.id, l]));
  return punkter
    .filter((p) => hager.has(p.listeId) && p.maaneder?.includes(maaned))
    .map((p) => ({
      punkt: p, liste: hager.get(p.listeId)!,
      forelder: p.forelderId ? punkter.find((f) => f.id === p.forelderId) : undefined,
      gjort: !!p.sistGjort && p.sistGjort.slice(0, 7) === iDag.slice(0, 7),
    }))
    .sort((a, b) => Number(a.gjort) - Number(b.gjort) || a.punkt.rekkefolge - b.punkt.rekkefolge);
}

// ---------------------------------------------------------------- Gavehistorikk

export interface Gave {
  punkt: Punkt;
  liste: Liste;
  aar: string;
}

export interface Mottaker {
  navn: string;
  gaver: Gave[];
}

/** Kjøpte og gitte gaver per mottaker, nyeste først. Mottakere skilles ikke på store/små bokstaver.
 *  Gavelister: mottaker-feltet. Gaveår: mottakeren er hovedpunktet, gavene underpunktene. */
export function gavehistorikk(lister: Liste[], punkter: Punkt[]): Mottaker[] {
  const gavelister = new Map(lister.filter((l) => !l.mal && (l.type === 'gave' || l.type === 'gaveaar')).map((l) => [l.id, l]));
  const navnPaa = new Map(punkter.map((p) => [p.id, p.tekst]));
  const per = new Map<string, Mottaker>();
  for (const p of punkter) {
    const liste = gavelister.get(p.listeId);
    if (!liste) continue;
    const navn = (liste.type === 'gaveaar' ? (p.forelderId ? navnPaa.get(p.forelderId) : undefined) : p.mottaker)?.trim();
    if (!navn || !erBrukt('gave', p.status)) continue;
    const nokkel = navn.toLocaleLowerCase('nb');
    if (!per.has(nokkel)) per.set(nokkel, { navn, gaver: [] });
    // Gaveår: året til anledningen gaven var til (f.eks. «jul:2025»), ellers når den ble kjøpt
    const aar = p.anledning?.split(':')[1] ?? (p.ferdigDato ?? liste.opprettet).slice(0, 4);
    per.get(nokkel)!.gaver.push({ punkt: p, liste, aar });
  }
  const ut = [...per.values()].sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  for (const m of ut) m.gaver.sort((a, b) => b.aar.localeCompare(a.aar) || a.punkt.tekst.localeCompare(b.punkt.tekst, 'nb'));
  return ut;
}

/** Tidligere gaver til samme mottaker (unntatt punktet selv) */
export function tidligereGaver(historikk: Mottaker[], mottaker: string, unnta?: Id): Gave[] {
  const nokkel = mottaker.trim().toLocaleLowerCase('nb');
  if (!nokkel) return [];
  return historikk.find((m) => m.navn.toLocaleLowerCase('nb') === nokkel)?.gaver.filter((g) => g.punkt.id !== unnta) ?? [];
}

// ---------------------------------------------------------------- Rekkefølge (dra og slipp)

/**
 * Punktene som må lagres når søsken får ny rekkefølge (ider i ny rekkefølge).
 * Gjenbruker de samme rekkefølgetallene, så punkter i andre grupper ikke påvirkes.
 */
export function nyRekkefolge(punkter: Punkt[], ider: string[]): Punkt[] {
  const valgte = ider.map((id) => punkter.find((p) => p.id === id)).filter((p): p is Punkt => !!p);
  const tall = valgte.map((p) => p.rekkefolge).sort((a, b) => a - b);
  // Like tall (f.eks. etter import) gjøres unike
  for (let i = 1; i < tall.length; i++) if (tall[i] <= tall[i - 1]) tall[i] = tall[i - 1] + 0.001;
  return valgte.map((p, i) => ({ ...p, rekkefolge: tall[i] })).filter((p, i) => p.rekkefolge !== valgte[i].rekkefolge);
}

/** Flytter ett steg opp (-1) eller ned (1) – for tastatur */
export function flyttEtSteg(ider: string[], id: string, retning: -1 | 1): string[] {
  const i = ider.indexOf(id);
  const j = i + retning;
  if (i < 0 || j < 0 || j >= ider.length) return ider;
  const ut = [...ider];
  [ut[i], ut[j]] = [ut[j], ut[i]];
  return ut;
}

// ---------------------------------------------------------------- Deling

/** Det som deles: bare punkter som ikke er kjøpt eller gjort (og underpunkter av slike) */
export function punkterForDeling(type: ListeType, punkter: Punkt[]): Punkt[] {
  const aktive = (p: Punkt) => !erFerdig(type, p.status) && !erBrukt(type, p.status);
  const foreldre = new Set(punkter.filter((p) => !p.forelderId && aktive(p)).map((p) => p.id));
  return punkter.filter((p) => aktive(p) && (!p.forelderId || foreldre.has(p.forelderId)));
}

const krTekst = (n: number) => `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(n))} kr`;

/** Listen som ren tekst, klar til å lime inn i Messenger, SMS eller e-post */
export function delingsTekst(liste: Pick<Liste, 'navn' | 'ikon' | 'type'>, punkter: Punkt[]): string {
  const linjer = [`${liste.ikon} ${liste.navn}`.trim(), ''];
  const ekstra = (p: Punkt, innrykk: string) => {
    if (p.notat) linjer.push(`${innrykk}${p.notat}`);
    if (p.lenke) linjer.push(`${innrykk}${p.lenke}`);
  };
  for (const { punkt, barn } of lagTre(punkterForDeling(liste.type, punkter), liste.type)) {
    linjer.push(`• ${punkt.tekst}${punkt.belop ? ` – ${krTekst(punkt.belop)}` : ''}`);
    ekstra(punkt, '  ');
    for (const b of barn) {
      linjer.push(`   – ${b.tekst}${b.belop ? ` – ${krTekst(b.belop)}` : ''}`);
      ekstra(b, '     ');
    }
  }
  if (linjer.length === 2) linjer.push('(Ingenting på listen akkurat nå)');
  return linjer.join('\n');
}
