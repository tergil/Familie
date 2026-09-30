// Bygger noder og lenker til sankey-diagrammet. Ren logikk, testbar uten nettleser.
import type { FellesDok, Id, PrivatDok, PrivatRevisjon, Revisjon } from '../data/modell';
import { eierAvKonto, oppsummerFelles, postMnd, sum, tilMnd } from './beregning';

export type NodeType = 'inntekt' | 'person' | 'konto' | 'felles' | 'kategori' | 'rest';

export interface FlytNode {
  id: string;
  navn: string;
  type: NodeType;
  /** Palettplass for kategorier, ellers undefined (nøytral) */
  farge?: number;
  kategoriId?: Id;
}

export interface FlytLenke {
  kilde: string;
  mal: string;
  verdi: number;
}

export interface Flyt {
  noder: FlytNode[];
  lenker: FlytLenke[];
}

export type Detalj = 'enkel' | 'kontoer';

class Bygger {
  noder = new Map<string, FlytNode>();
  lenker = new Map<string, FlytLenke>();

  node(n: FlytNode) {
    if (!this.noder.has(n.id)) this.noder.set(n.id, n);
    return n.id;
  }

  lenke(kilde: string, mal: string, verdi: number) {
    if (verdi <= 0.5 || kilde === mal) return;
    const nokkel = `${kilde}→${mal}`;
    const l = this.lenker.get(nokkel);
    if (l) l.verdi += verdi;
    else this.lenker.set(nokkel, { kilde, mal, verdi });
  }

  ferdig(): Flyt {
    const brukt = new Set<string>();
    for (const l of this.lenker.values()) { brukt.add(l.kilde); brukt.add(l.mal); }
    return {
      noder: [...this.noder.values()].filter((n) => brukt.has(n.id)),
      lenker: [...this.lenker.values()],
    };
  }
}

function kategoriNode(b: Bygger, dok: FellesDok, kategoriId: Id) {
  const k = dok.kategorier.find((x) => x.id === kategoriId);
  return b.node({ id: `kat:${kategoriId}`, navn: k?.navn ?? 'Uten kategori', type: 'kategori', farge: k?.farge, kategoriId });
}

/** Pengeflyten i fellesbudsjettet. */
export function fellesFlyt(dok: FellesDok, rev: Revisjon, detalj: Detalj): Flyt {
  const b = new Bygger();
  const opp = oppsummerFelles(dok, rev);
  const kontoNavn = (id: Id) => dok.kontoer.find((k) => k.id === id)?.navn ?? 'Ukjent konto';

  if (detalj === 'enkel') {
    // Person → Fellesbudsjett → Kategori
    const felles = b.node({ id: 'felles', navn: 'Fellesbudsjett', type: 'felles' });
    for (const p of opp.personer) {
      b.lenke(b.node({ id: `person:${p.person.id}`, navn: p.person.navn, type: 'person' }), felles, p.overfort);
    }
    for (const i of rev.inntekter.filter((i) => i.personId === null)) {
      b.lenke(b.node({ id: `inn:${i.id}`, navn: i.navn, type: 'inntekt' }), felles, tilMnd(i.belop, i.frekvens));
    }
    for (const p of rev.poster) b.lenke(felles, kategoriNode(b, dok, p.kategoriId), postMnd(p));
    if (opp.buffer > 0) b.lenke(felles, b.node({ id: 'buffer', navn: 'Buffer', type: 'rest' }), opp.buffer);
    return b.ferdig();
  }

  // Lønnskonto → Felleskonto → Kategori
  // Lønnskontoene er startpunktet. Bare inntekt som går rett til andre kontoer (f.eks. barnetrygd) får egen node.
  const lonnskontoer = new Set(dok.kontoer.filter((k) => k.rolle === 'avsender').map((k) => k.id));
  for (const i of rev.inntekter.filter((x) => !lonnskontoer.has(x.tilKontoId))) {
    const kilde = b.node({ id: `inn:${i.id}`, navn: i.navn, type: 'inntekt' });
    b.lenke(kilde, b.node({ id: `k:${i.tilKontoId}`, navn: kontoNavn(i.tilKontoId), type: 'konto' }), tilMnd(i.belop, i.frekvens));
  }
  for (const o of rev.overforinger) {
    b.lenke(
      b.node({ id: `k:${o.fraKontoId}`, navn: kontoNavn(o.fraKontoId), type: 'konto' }),
      b.node({ id: `k:${o.tilKontoId}`, navn: kontoNavn(o.tilKontoId), type: 'konto' }),
      o.belop,
    );
  }
  // Det som blir igjen på lønnskontoene = personens egen disposisjon
  for (const konto of dok.kontoer.filter((k) => k.rolle === 'avsender')) {
    const inn = sum(rev.inntekter.filter((i) => i.tilKontoId === konto.id), (i) => tilMnd(i.belop, i.frekvens));
    const ut = sum(rev.overforinger.filter((o) => o.fraKontoId === konto.id), (o) => o.belop);
    const person = dok.personer.find((p) => p.id === konto.eierId);
    b.lenke(`k:${konto.id}`, b.node({ id: `egen:${konto.id}`, navn: `Privat – ${person?.navn ?? konto.navn}`, type: 'rest' }), inn - ut);
  }
  for (const p of rev.poster) {
    b.lenke(b.node({ id: `k:${p.kontoId}`, navn: kontoNavn(p.kontoId), type: 'konto' }), kategoriNode(b, dok, p.kategoriId), postMnd(p));
  }
  const buffer = b.node({ id: 'buffer', navn: 'Buffer', type: 'rest' });
  for (const k of opp.kontoer) if (k.balanse > 0) b.lenke(`k:${k.konto.id}`, buffer, k.balanse);
  return b.ferdig();
}

/** Pengeflyten i en persons privatbudsjett. */
export function privatFlyt(
  felles: FellesDok, frev: Revisjon | undefined, privat: PrivatDok, prev: PrivatRevisjon | undefined, detalj: Detalj,
): Flyt {
  const b = new Bygger();
  const personId = privat.eierId;
  const person = felles.personer.find((p) => p.id === personId);
  const kontoer = [...felles.kontoer, ...privat.kontoer];
  const kontoNavn = (id: Id) => kontoer.find((k) => k.id === id)?.navn ?? 'Ukjent konto';
  const inntekter = frev?.inntekter.filter((i) => i.personId === personId) ?? [];
  const overforinger = frev?.overforinger.filter((o) => eierAvKonto(felles, o.fraKontoId) === personId) ?? [];
  const poster = prev?.poster ?? [];

  const minKonto = felles.kontoer.find((k) => k.rolle === 'avsender' && k.eierId === personId);
  const lonn = detalj === 'enkel' || !minKonto
    ? b.node({ id: 'meg', navn: person?.navn ?? 'Meg', type: 'person' })
    : b.node({ id: `k:${minKonto.id}`, navn: minKonto.navn, type: 'konto' });

  let inn = 0;
  // Personen (enkel) eller lønnskontoen (med kontoer) er startpunktet – inntekten er allerede der
  for (const i of inntekter) inn += tilMnd(i.belop, i.frekvens);
  const tilFelles = sum(overforinger, (o) => o.belop);
  b.lenke(lonn, b.node({ id: 'felles', navn: 'Fellesbudsjett', type: 'felles' }), tilFelles);

  for (const p of poster) {
    const v = postMnd(p);
    const kat = kategoriNode(b, felles, p.kategoriId);
    const erEgenKonto = p.kontoId !== minKonto?.id && privat.kontoer.some((k) => k.id === p.kontoId);
    if (detalj === 'kontoer' && erEgenKonto) {
      const k = b.node({ id: `k:${p.kontoId}`, navn: kontoNavn(p.kontoId), type: 'konto' });
      b.lenke(lonn, k, v);
      b.lenke(k, kat, v);
    } else {
      b.lenke(lonn, kat, v);
    }
  }
  const rest = inn - tilFelles - sum(poster, postMnd);
  b.lenke(lonn, b.node({ id: 'ubudsjettert', navn: 'Ikke budsjettert', type: 'rest' }), rest);
  return b.ferdig();
}
