// Huskelister: oversikt over listene, én liste, skjemaer, huskelapp (også på Oversikt) og hagesesong.
// Data ligger i egne tabeller (se supabase/lister.sql) og håndteres av data/lister.ts.
import { useState, type FormEvent, type ReactNode } from 'react';
import type { FellesDok, Konto, Liste, ListeType, Post, PrivatDok, Punkt } from '../data/modell';
import { nyId } from '../data/modell';
import { listeLager, useLister } from '../data/lister';
import { useTilstand } from '../data/tilstand';
import { aktivRevisjon, iDag, postMnd, sum, tilMnd } from '../logikk/beregning';
import {
  FORSLAG_DAGER, LISTETYPER, MALER, STANDARD_KATEGORIER, adventssondager, erBrukt, erFerdig, fremdrift, gavehistorikk,
  hageIMaaned, huskelapp, kalenderAar, kalenderLuker, kopierPunkter, lagTre, listeSum, medStatus, nesteRekkefolge,
  nesteStatus, nullstill, nyttPunkt, punkterFraMal, statusTekst, tidligereGaver, tolkHurtig, dagerMellom,
  type EgenDag, type HageOppgave, type KalenderModus, type Mal,
} from '../logikk/lister';
import { Ark, BelopFelt, Felt, Ikon, MAANEDER_KORT, Segment, Tom, dagerTekst, kortDato, kr, ukedagDato } from '../ui/felles';
import { UtgiftSkjema, type UtgiftForslag } from '../ui/UtgiftSkjema';

const EMOJI = ['📝', '🎁', '🎄', '🕯️', '🧳', '🏔️', '☀️', '🍽️', '📺', '🎬', '📚', '🌱', '🌷', '🔧', '⚡', '🏠', '🛋️', '🎉', '❤️', '⭐', '🚗', '👶', '🐶', '💡'];

/** «5. des.» slutter allerede på punktum */
const punktum = (t: string) => (t.endsWith('.') ? t : `${t}.`);

const MAANED_NAVN =['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

/** Sjekklister og kalendere har avkrysning. De andre typene viser statusen som en knapp. */
const medAvkryss = (type: ListeType) => type === 'sjekk' || type === 'kalender';

function Laster() {
  return <div className="laster"><div className="spinner" aria-label="Laster" /></div>;
}

function FeilBanner({ feil }: { feil: string | null }) {
  if (!feil) return null;
  return (
    <div className="banner feil" role="alert">
      <Ikon navn="advarsel" />
      <div><strong>Noe gikk galt med lagringen av listene.</strong><p className="liten">{feil}</p></div>
      <button className="knapp liten flat ikon" onClick={listeLager.lukkFeil} aria-label="Lukk"><Ikon navn="lukk" storrelse={16} /></button>
    </div>
  );
}

export function Lister({ listeId, gaaTil }: { listeId?: string; gaaTil: (r: string) => void }) {
  return listeId ? <ListeSide key={listeId} id={listeId} gaaTil={gaaTil} /> : <ListeOversikt gaaTil={gaaTil} />;
}

// ---------------------------------------------------------------- Små byggeklosser

function Avkryss({ pa, endre, etikett }: { pa: boolean; endre: () => void; etikett: string }) {
  return (
    <button type="button" className="avkryss" role="checkbox" aria-checked={pa} aria-label={etikett} onClick={endre}>
      <Ikon navn="sjekk" storrelse={15} />
    </button>
  );
}

function StatusKnapp({ type, status, endre }: { type: ListeType; status: string; endre: () => void }) {
  const statuser = LISTETYPER[type].statuser;
  const i = statuser.findIndex((s) => s.id === status);
  const klasse = erFerdig(type, status) ? 'bra' : i > 0 ? 'aksent' : '';
  return (
    <button type="button" className={`merkelapp status-knapp ${klasse}`} onClick={endre}
      aria-label={`Status: ${statusTekst(type, status)}. Trykk for «${statusTekst(type, nesteStatus(type, status))}»`}>
      {erFerdig(type, status) && <Ikon navn="sjekk" storrelse={12} />}{statusTekst(type, status)}
    </button>
  );
}

function Stjerner({ verdi, endre }: { verdi?: number; endre: (v: number | undefined) => void }) {
  return (
    <div className="stjerner" role="group" aria-label="Vurdering">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-pressed={(verdi ?? 0) >= n} aria-label={`${n} av 5`} onClick={() => endre(verdi === n ? undefined : n)}>
          <svg width={26} height={26} viewBox="0 0 24 24" fill={(verdi ?? 0) >= n ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

/** Overskrift for en seksjon i listen. Status: liten etikett. Person (gavemottaker): navn med bokstav. */
function SeksjonHode({ tittel, antall, sum: total, under, person, children }: {
  tittel: string; antall?: number; sum?: number; under?: string; person?: boolean; children?: ReactNode;
}) {
  return (
    <div className={`seksjon-hode${person ? ' person' : ''}`}>
      {person && <span className="avatar noytral" aria-hidden="true">{tittel.slice(0, 1).toUpperCase()}</span>}
      <span className="tittel">
        <span className="navn">{tittel}{antall !== undefined && !person && <span className="antall"> · {antall}</span>}</span>
        {under && <span className="under">{under}</span>}
      </span>
      {total ? <span className="sum">{kr(total)}</span> : null}
      {children}
    </div>
  );
}

const stjerneTekst = (v?: number) => (v ? '★'.repeat(v) + '☆'.repeat(5 - v) : '');
const maanederTekst = (m?: number[]) => (m?.length ? [...m].sort((a, b) => a - b).map((x) => MAANEDER_KORT[x - 1]).join(', ') : '');

/** Merkelapp for en frist: rød når den er passert, gul når den er nær */
function FristMerke({ dager }: { dager: number }) {
  const klasse = dager < 0 ? 'feil' : dager <= 2 ? 'varsel' : '';
  return <span className={`merkelapp ${klasse}`}>{dager < 0 && <Ikon navn="advarsel" storrelse={12} />}{dagerTekst(dager)}</span>;
}

// ---------------------------------------------------------------- Budsjettkobling

type Kobling = { type: 'post'; post: Post } | { type: 'konto'; konto: Konto; perMnd: number };

function finnKobling(liste: Liste, felles: FellesDok | null, privat: PrivatDok | null): Kobling | undefined {
  if (!felles) return undefined;
  const rev = aktivRevisjon(felles.revisjoner, iDag());
  const prev = privat ? aktivRevisjon(privat.revisjoner, iDag()) : undefined;
  if (liste.postId) {
    const post = rev?.poster.find((p) => p.id === liste.postId) ?? prev?.poster.find((p) => p.id === liste.postId);
    return post ? { type: 'post', post } : undefined;
  }
  if (liste.kontoId) {
    const konto = [...felles.kontoer, ...(privat?.kontoer ?? [])].find((k) => k.id === liste.kontoId);
    if (!konto) return undefined;
    const perMnd = sum([...(rev?.poster ?? []), ...(prev?.poster ?? [])].filter((p) => p.kontoId === konto.id), postMnd);
    return { type: 'konto', konto, perMnd };
  }
  return undefined;
}

/** Valgene i «Koble til budsjettet». Felles lister kan bare kobles til felles poster og kontoer. */
function koblingValg(felles: FellesDok | null, privat: PrivatDok | null, erPrivat: boolean) {
  if (!felles) return [];
  const rev = aktivRevisjon(felles.revisjoner, iDag());
  const prev = privat ? aktivRevisjon(privat.revisjoner, iDag()) : undefined;
  const poster = (liste: Post[]) => [...liste].sort((a, b) => a.navn.localeCompare(b.navn, 'nb'))
    .map((p) => ({ verdi: `post:${p.id}`, tekst: `${p.navn} (${kr(postMnd(p) * 12)} i året)` }));
  const kontoer = [...felles.kontoer, ...(erPrivat ? privat?.kontoer ?? [] : [])].filter((k) => k.sparemaal)
    .map((k) => ({ verdi: `konto:${k.id}`, tekst: `${k.navn} (mål ${kr(k.sparemaal!.maal)})` }));
  return [
    { gruppe: 'Felles poster', valg: poster(rev?.poster ?? []) },
    { gruppe: 'Mine poster', valg: erPrivat ? poster(prev?.poster ?? []) : [] },
    { gruppe: 'Sparemål', valg: kontoer },
  ].filter((g) => g.valg.length);
}

function BudsjettKort({ liste, punkter, endre }: { liste: Liste; punkter: Punkt[]; endre: () => void }) {
  const { felles, privat } = useTilstand();
  const s = listeSum(liste.type, punkter);
  const kobling = finnKobling(liste, felles, privat);
  if (!kobling && s.antallMedBelop === 0) return null;

  if (!kobling) {
    return (
      <section className="kort kompakt">
        <div className="budsjett-linje">
          <span><span className="dempet liten">Planlagt</span><strong className="tall">{kr(s.planlagt)}</strong></span>
          <span><span className="dempet liten">{liste.type === 'gave' || liste.type === 'onske' ? 'Kjøpt' : 'Ferdig'}</span><strong className="tall">{kr(s.brukt)}</strong></span>
          <button className="knapp liten flat" onClick={endre}><Ikon navn="budsjett" storrelse={16} />Koble til budsjettet</button>
        </div>
      </section>
    );
  }

  if (kobling.type === 'post') {
    const ramme = tilMnd(kobling.post.belop, kobling.post.frekvens) * 12;
    const totalt = s.brukt + s.planlagt;
    const skala = Math.max(ramme, totalt, 1);
    const over = totalt - ramme;
    return (
      <section className="kort">
        <div className="kort-hode">
          <div className="tittel"><h2>Mot budsjettet</h2><span className="dempet liten">Posten «{kobling.post.navn}» · {kr(ramme)} i året</span></div>
          {over > 0.5
            ? <span className="merkelapp feil"><Ikon navn="advarsel" storrelse={12} />{kr(over)} over</span>
            : <span className="merkelapp bra"><Ikon navn="sjekk" storrelse={12} />{kr(-over)} igjen</span>}
        </div>
        <div className="stolpe delt" aria-hidden="true">
          <span style={{ width: `${(s.brukt / skala) * 100}%`, background: over > 0.5 ? 'var(--feil)' : 'var(--aksent)' }} />
          <span className="planlagt" style={{ width: `${(s.planlagt / skala) * 100}%` }} />
        </div>
        <div className="forklaring">
          <span><span className="prikk" style={{ background: 'var(--aksent)' }} />{liste.type === 'gave' || liste.type === 'onske' ? 'Kjøpt' : 'Ferdig'} {kr(s.brukt)}</span>
          <span><span className="prikk planlagt" />Planlagt {kr(s.planlagt)}</span>
        </div>
      </section>
    );
  }

  const m = kobling.konto.sparemaal;
  const saldo = m?.saldo ?? 0;
  const mangler = s.planlagt - saldo;
  const mnd = mangler > 0 && kobling.perMnd > 0 ? Math.ceil(mangler / kobling.perMnd) : null;
  return (
    <section className="kort">
      <div className="kort-hode">
        <div className="tittel"><h2>Mot sparemålet</h2><span className="dempet liten">{kobling.konto.navn} · spart {kr(saldo)}</span></div>
        {mangler <= 0
          ? <span className="merkelapp bra"><Ikon navn="sjekk" storrelse={12} />Nok spart</span>
          : <span className="merkelapp varsel">Mangler {kr(mangler)}</span>}
      </div>
      <div className="stolpe" aria-hidden="true">
        <span style={{ width: `${Math.min(1, s.planlagt > 0 ? saldo / s.planlagt : 1) * 100}%`, background: mangler <= 0 ? 'var(--bra)' : 'var(--aksent)' }} />
      </div>
      <p className="dempet liten" style={{ marginTop: 8 }}>
        Ønsker for {kr(s.planlagt)}{s.brukt > 0 && ` (${kr(s.brukt)} allerede kjøpt)`}.{' '}
        {mangler <= 0 ? 'Saldoen dekker alt på listen.'
          : mnd ? `Med ${kr(kobling.perMnd)} i måneden tar det ca. ${mnd} ${mnd === 1 ? 'måned' : 'måneder'}.`
          : 'Ingen fast sparing til kontoen i budsjettet.'}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- Huskelapp (Oversikt og Lister)

export function HuskelappKort({ gaaTil, paaListesiden }: { gaaTil: (r: string) => void; paaListesiden?: boolean }) {
  const { lister, punkter } = useLister();
  const idag = iDag();
  const huske = huskelapp(lister, punkter, idag);
  // Hagen vises som egen boks på listesiden, og som én linje her
  const hage = paaListesiden ? [] : hageIMaaned(lister, punkter, idag).filter((h) => !h.gjort);
  if (!huske.length && !hage.length) return null;

  return (
    <section className="kort">
      <div className="kort-hode">
        <div className="tittel"><h2>Huskelapp</h2><span className="dempet liten">Frister de neste 14 dagene</span></div>
        {!paaListesiden && <button className="knapp liten flat" onClick={() => gaaTil('lister')}>Lister<Ikon navn="pilhoyre" storrelse={16} /></button>}
      </div>
      <div className="liste">
        {huske.slice(0, 6).map(({ punkt, liste, dager }) => (
          <div className="rad" key={punkt.id}>
            {medAvkryss(liste.type)
              ? <Avkryss pa={false} etikett={`Merk «${punkt.tekst}» som gjort`}
                  endre={() => void listeLager.lagrePunkter([medStatus(punkt, liste.type, nesteStatus(liste.type, punkt.status), idag)])} />
              : <span className="liste-ikon liten">{liste.ikon}</span>}
            <button className="rad-knapp" onClick={() => gaaTil(`lister/${liste.id}`)}>
              <span className="hoved">
                <span className="navn">{punkt.tekst}</span>
                <span className="info">{liste.ikon} {liste.navn} · {ukedagDato(punkt.dato!)}{!medAvkryss(liste.type) && ` · ${statusTekst(liste.type, punkt.status)}`}</span>
              </span>
              <FristMerke dager={dager} />
            </button>
          </div>
        ))}
        {hage.length > 0 && (
          <button className="rad" onClick={() => gaaTil(`lister/${hage[0].liste.id}`)}>
            <span className="liste-ikon liten">{hage[0].liste.ikon || '🌱'}</span>
            <span className="hoved">
              <span className="navn">I hagen i {MAANED_NAVN[Number(idag.slice(5, 7)) - 1]}</span>
              <span className="info">{hage.map((h) => (h.forelder ? `${h.forelder.tekst}: ${h.punkt.tekst.toLowerCase()}` : h.punkt.tekst)).join(' · ')}</span>
            </span>
            <span className="merkelapp">{hage.length}</span>
          </button>
        )}
      </div>
      {huske.length > 6 && <p className="dempet liten" style={{ padding: '8px 4px 0' }}>+ {huske.length - 6} til</p>}
    </section>
  );
}

function HageSesong({ oppgaver }: { oppgaver: HageOppgave[] }) {
  if (!oppgaver.length) return null;
  const idag = iDag();
  const gjort = oppgaver.filter((o) => o.gjort).length;
  return (
    <section className="kort">
      <div className="kort-hode">
        <div className="tittel">
          <h2>I hagen i {MAANED_NAVN[Number(idag.slice(5, 7)) - 1]}</h2>
          <span className="dempet liten">{gjort} av {oppgaver.length} gjort denne måneden</span>
        </div>
      </div>
      <div className="liste">
        {oppgaver.map((o) => (
          <div className={`rad${o.gjort ? ' gjort' : ''}`} key={o.punkt.id}>
            <Avkryss pa={o.gjort} etikett={`${o.punkt.tekst} gjort`}
              endre={() => void listeLager.lagrePunkter([{ ...o.punkt, sistGjort: o.gjort ? undefined : idag }])} />
            <span className="hoved">
              <span className="navn">{o.forelder ? `${o.forelder.tekst}: ${o.punkt.tekst.toLowerCase()}` : o.punkt.tekst}</span>
              <span className="info">{[o.forelder?.plassering ?? o.punkt.plassering, o.gjort && o.punkt.sistGjort ? `Gjort ${kortDato(o.punkt.sistGjort)}` : maanederTekst(o.punkt.maaneder)].filter(Boolean).join(' · ')}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Oversikt over listene

function ListeRad({ liste, punkter, aapne }: { liste: Liste; punkter: Punkt[]; aapne: () => void }) {
  const egne = punkter.filter((p) => p.listeId === liste.id);
  const f = fremdrift(liste.type, egne);
  const s = listeSum(liste.type, egne);
  const medStatus = LISTETYPER[liste.type].statuser.length > 1;
  const ferdigOrd = liste.type === 'kalender' ? 'klar' : 'ferdig';
  const info = [
    egne.length === 0 ? 'Tom' : medStatus ? `${f.ferdig} av ${f.totalt} ${ferdigOrd}` : `${egne.length} punkter`,
    s.antallMedBelop ? kr(s.planlagt + s.brukt) : null,
  ].filter(Boolean).join(' · ');
  return (
    <button className="rad" onClick={aapne}>
      <span className="liste-ikon">{liste.ikon || LISTETYPER[liste.type].ikon}</span>
      <span className="hoved">
        <span className="navn">{liste.navn}</span>
        <span className="info">{info}</span>
        {medStatus && f.totalt > 0 && <span className="stolpe tynn" aria-hidden="true"><span style={{ width: `${(f.ferdig / f.totalt) * 100}%` }} /></span>}
      </span>
      {liste.privat && <span className="merkelapp" title="Bare du ser listen"><Ikon navn="privat" storrelse={12} />Privat</span>}
      <Ikon navn="pilhoyre" storrelse={16} />
    </button>
  );
}

function sorterKategorier(kategorier: string[]): string[] {
  const rang = (k: string) => { const i = STANDARD_KATEGORIER.indexOf(k); return i < 0 ? 50 : i; };
  return [...new Set(kategorier)].sort((a, b) => (a === 'Annet' ? 1 : b === 'Annet' ? -1 : rang(a) - rang(b) || a.localeCompare(b, 'nb')));
}

function ListeOversikt({ gaaTil }: { gaaTil: (r: string) => void }) {
  const { lister, punkter, lastet, feil } = useLister();
  const [ny, setNy] = useState(false);
  const [filter, setFilter] = useState('alle');
  if (!lastet) return <Laster />;

  const vanlige = lister.filter((l) => !l.mal).sort((a, b) => a.rekkefolge - b.rekkefolge || a.navn.localeCompare(b.navn, 'nb'));
  const maler = lister.filter((l) => l.mal).sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
  const kat = (l: Liste) => l.kategori || 'Annet';
  const kategorier = sorterKategorier(vanlige.map(kat));
  const valgt = kategorier.includes(filter) ? filter : 'alle';
  const grupper = kategorier.filter((k) => valgt === 'alle' || k === valgt).map((k) => ({ kategori: k, lister: vanlige.filter((l) => kat(l) === k) }));

  return (
    <>
      <FeilBanner feil={feil} />
      <HuskelappKort gaaTil={gaaTil} paaListesiden />
      <HageSesong oppgaver={hageIMaaned(lister, punkter, iDag())} />

      {kategorier.length > 1 && (
        <div className="valgchips" role="radiogroup" aria-label="Kategori">
          {['alle', ...kategorier].map((k) => (
            <button key={k} type="button" role="radio" aria-checked={k === valgt} onClick={() => setFilter(k)}>
              {k === 'alle' ? 'Alle' : k}<span className="dempet tall">{k === 'alle' ? vanlige.length : vanlige.filter((l) => kat(l) === k).length}</span>
            </button>
          ))}
        </div>
      )}

      {vanlige.length === 0 ? (
        <section className="kort">
          <Tom ikon="liste" tittel="Ingen lister ennå" tekst="Lag en huskeliste, gaveliste, pakkeliste eller adventskalender – fra bunnen eller fra en mal.">
            <button className="knapp primar" onClick={() => setNy(true)}><Ikon navn="pluss" storrelse={18} />Lag første liste</button>
          </Tom>
        </section>
      ) : (
        <div className="rutenett to">
          {grupper.map((g) => (
            <section className="kort" key={g.kategori}>
              <div className="kort-hode"><div className="tittel"><h2>{g.kategori}</h2><span className="dempet liten">{g.lister.length} {g.lister.length === 1 ? 'liste' : 'lister'}</span></div></div>
              <div className="liste">
                {g.lister.map((l) => <ListeRad key={l.id} liste={l} punkter={punkter} aapne={() => gaaTil(`lister/${l.id}`)} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {maler.length > 0 && (
        <section className="kort">
          <div className="kort-hode"><div className="tittel"><h2>Mine maler</h2><span className="dempet liten">Velg dem under «Ny liste». Trykk for å endre innholdet.</span></div></div>
          <div className="liste">
            {maler.map((l) => <ListeRad key={l.id} liste={l} punkter={punkter} aapne={() => gaaTil(`lister/${l.id}`)} />)}
          </div>
        </section>
      )}

      <button className="fab" onClick={() => setNy(true)}><Ikon navn="pluss" storrelse={22} />Ny liste</button>
      {ny && <NyListeArk lukk={() => setNy(false)} opprettet={(id) => { setNy(false); gaaTil(`lister/${id}`); }} />}
    </>
  );
}

// ---------------------------------------------------------------- Liste-skjema (felles for ny og endre)

interface Utkast {
  navn: string;
  ikon: string;
  kategori: string;
  type: ListeType;
  privat: boolean;
  /** "post:<id>", "konto:<id>" eller "" */
  kobling: string;
}

const koblingAv = (l: Pick<Liste, 'postId' | 'kontoId'>) => (l.postId ? `post:${l.postId}` : l.kontoId ? `konto:${l.kontoId}` : '');
function medKobling<T extends object>(l: T, kobling: string): T & { postId?: string; kontoId?: string } {
  const [art, id] = kobling.split(':');
  return { ...l, postId: art === 'post' ? id : undefined, kontoId: art === 'konto' ? id : undefined };
}

function ListeFelt({ u, sett, visType }: { u: Utkast; sett: (e: Partial<Utkast>) => void; visType: boolean }) {
  const { lister } = useLister();
  const { felles, privat } = useTilstand();
  const kategorier = sorterKategorier([...STANDARD_KATEGORIER, ...lister.map((l) => l.kategori).filter(Boolean)]);
  const [nyKategori, setNyKategori] = useState(false);
  const valg = koblingValg(felles, privat, u.privat);
  // En felles liste kan ikke kobles til noe privat
  const gyldig = valg.some((g) => g.valg.some((v) => v.verdi === u.kobling));

  return (
    <>
      <Felt etikett="Navn"><input value={u.navn} onChange={(e) => sett({ navn: e.target.value })} required placeholder="F.eks. Pakkeliste hytta" /></Felt>
      <div className="felt">
        <span>Ikon</span>
        <div className="emoji-valg" role="group" aria-label="Ikon">
          {(EMOJI.includes(u.ikon) || !u.ikon ? EMOJI : [u.ikon, ...EMOJI]).map((e) => (
            <button key={e} type="button" aria-pressed={e === u.ikon} onClick={() => sett({ ikon: e })}>{e}</button>
          ))}
        </div>
      </div>
      {visType && (
        <Felt etikett="Type" hjelp={LISTETYPER[u.type].beskrivelse}>
          <select value={u.type} onChange={(e) => sett({ type: e.target.value as ListeType })}>
            {(Object.keys(LISTETYPER) as ListeType[]).map((t) => <option key={t} value={t}>{LISTETYPER[t].ikon} {LISTETYPER[t].navn}</option>)}
          </select>
        </Felt>
      )}
      <Felt etikett="Kategori">
        {nyKategori
          ? <input value={u.kategori} onChange={(e) => sett({ kategori: e.target.value })} placeholder="Navn på ny kategori" autoFocus />
          : (
            <select value={u.kategori} onChange={(e) => { if (e.target.value === '__ny') { setNyKategori(true); sett({ kategori: '' }); } else sett({ kategori: e.target.value }); }}>
              {kategorier.map((k) => <option key={k} value={k}>{k}</option>)}
              <option value="__ny">+ Ny kategori …</option>
            </select>
          )}
      </Felt>
      <label className="rad" style={{ cursor: 'pointer', minHeight: 44 }}>
        <Ikon navn="privat" storrelse={18} />
        <span className="hoved"><span className="navn">Privat liste</span><span className="info">På = bare du ser den. Fin til gavelister.</span></span>
        <input type="checkbox" className="bryter" checked={u.privat} onChange={(e) => sett({ privat: e.target.checked })} />
      </label>
      {valg.length > 0 && (
        <Felt etikett="Koble til budsjettet (valgfritt)" hjelp="Sammenligner beløpene på listen med en post i budsjettet eller et sparemål.">
          <select value={gyldig ? u.kobling : ''} onChange={(e) => sett({ kobling: e.target.value })}>
            <option value="">Ingen kobling</option>
            {valg.map((g) => <optgroup key={g.gruppe} label={g.gruppe}>{g.valg.map((v) => <option key={v.verdi} value={v.verdi}>{v.tekst}</option>)}</optgroup>)}
          </select>
        </Felt>
      )}
    </>
  );
}

function ListeSkjema({ liste, lukk }: { liste: Liste; lukk: () => void }) {
  const { felles, privat } = useTilstand();
  const [u, setU] = useState<Utkast>({ ...liste, kobling: koblingAv(liste) });
  const gyldigKobling = koblingValg(felles, privat, u.privat).some((g) => g.valg.some((v) => v.verdi === u.kobling)) ? u.kobling : '';
  function lagre(e: FormEvent) {
    e.preventDefault();
    const { kobling: _k, ...rest } = u;
    void listeLager.lagreListe(medKobling({ ...liste, ...rest, navn: u.navn.trim(), kategori: u.kategori.trim() || 'Annet' }, gyldigKobling));
    lukk();
  }
  return (
    <Ark tittel="Endre liste" lukk={lukk}>
      <form className="skjema" onSubmit={lagre}>
        <ListeFelt u={u} sett={(e) => setU({ ...u, ...e })} visType />
        {u.type !== liste.type && <p className="dempet liten">Statuser som ikke finnes i den nye typen vises som «{LISTETYPER[u.type].statuser[0].tekst}».</p>}
        <div className="knapperad slutt">
          <button type="button" className="knapp" onClick={lukk}>Avbryt</button>
          <button type="submit" className="knapp primar" disabled={!u.navn.trim()}>Lagre</button>
        </div>
      </form>
    </Ark>
  );
}

// ---------------------------------------------------------------- Ny liste (tom, innebygd mal eller egen mal)

function NyListeArk({ lukk, opprettet }: { lukk: () => void; opprettet: (id: string) => void }) {
  const { lister, punkter } = useLister();
  const egneMaler = lister.filter((l) => l.mal);
  const idag = iDag();
  const [kilde, setKilde] = useState('tom');
  const [u, setU] = useState<Utkast>({ navn: '', ikon: '📝', kategori: 'Annet', type: 'sjekk', privat: false, kobling: '' });
  const [aar, setAar] = useState(kalenderAar(idag));
  const [modus, setModus] = useState<KalenderModus>('sondager');
  const [egne, setEgne] = useState<EgenDag[]>([FORSLAG_DAGER[0]]);
  const [egenNavn, setEgenNavn] = useState('');
  const [egenDato, setEgenDato] = useState('');
  const [lagrer, setLagrer] = useState(false);

  const innebygd = MALER.find((m) => `mal:${m.id}` === kilde);
  const egen = egneMaler.find((m) => `egen:${m.id}` === kilde);
  const erAdvent = innebygd?.id === 'advent';
  const sett = (e: Partial<Utkast>) => setU({ ...u, ...e });

  function velg(k: string) {
    setKilde(k);
    const m: Mal | Liste | undefined = MALER.find((x) => `mal:${x.id}` === k) ?? egneMaler.find((x) => `egen:${x.id}` === k);
    if (!m) { setU({ navn: '', ikon: '📝', kategori: 'Annet', type: 'sjekk', privat: false, kobling: '' }); return; }
    const navn = m.id === 'advent' ? `Adventskalender ${kalenderAar(idag)}` : m.id === 'gaver' ? `Gaver jul ${kalenderAar(idag)}` : m.navn;
    setU({ navn, ikon: m.ikon, kategori: m.kategori, type: m.type, privat: !!m.privat, kobling: 'mal' in m ? koblingAv(m) : '' });
  }

  const luker = erAdvent ? kalenderLuker(aar, modus, egne) : [];
  const harDag = (d: EgenDag) => egne.some((e) => e.dag === d.dag);
  const veksleDag = (d: EgenDag) => setEgne(harDag(d) ? egne.filter((e) => e.dag !== d.dag) : [...egne, d]);

  async function opprett(e: FormEvent) {
    e.preventDefault();
    setLagrer(true);
    const liste: Liste = medKobling({
      id: nyId(), navn: u.navn.trim(), ikon: u.ikon, kategori: u.kategori.trim() || 'Annet', type: u.type, privat: u.privat, mal: false,
      rekkefolge: lister.reduce((m, l) => Math.max(m, l.rekkefolge), 0) + 1, opprettet: idag,
    }, u.kobling);
    let nye: Punkt[] = [];
    if (erAdvent) nye = luker.map((l, i) => nyttPunkt(liste.id, 'kalender', l.tekst, i + 1, { dato: l.dato }));
    else if (innebygd) nye = punkterFraMal(innebygd, liste.id);
    else if (egen) nye = kopierPunkter(punkter.filter((p) => p.listeId === egen.id), liste.id, u.type);
    if (await listeLager.opprett(liste, nye)) opprettet(liste.id);
    else setLagrer(false);
  }

  const valgt = innebygd?.beskrivelse ?? (egen ? `Din mal med ${punkter.filter((p) => p.listeId === egen.id).length} punkter.` : 'Start med en tom liste og velg type selv.');

  return (
    <Ark tittel="Ny liste" lukk={lukk} bred>
      <form className="skjema" onSubmit={opprett}>
        <div className="felt">
          <span>Start fra</span>
          <div className="valgchips" role="radiogroup" aria-label="Start fra">
            <button type="button" role="radio" aria-checked={kilde === 'tom'} onClick={() => velg('tom')}>Tom liste</button>
            {MALER.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={kilde === `mal:${m.id}`} onClick={() => velg(`mal:${m.id}`)}>{m.ikon} {m.navn}</button>
            ))}
            {egneMaler.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={kilde === `egen:${m.id}`} onClick={() => velg(`egen:${m.id}`)}><Ikon navn="kopi" storrelse={14} />{m.navn}</button>
            ))}
          </div>
          <small>{valgt}</small>
        </div>

        {erAdvent && (
          <div className="kort innfelt">
            <div className="felt-rad">
              <Felt etikett="År"><input type="number" inputMode="numeric" value={aar} onChange={(e) => setAar(Number(e.target.value) || aar)} /></Felt>
              <Felt etikett="Luker">
                <select value={modus} onChange={(e) => setModus(e.target.value as KalenderModus)}>
                  <option value="sondager">Søndager i advent</option>
                  <option value="alle">Alle 24 dager</option>
                </select>
              </Felt>
            </div>
            <div className="felt">
              <span>Egne dager i tillegg</span>
              <div className="valgchips" role="group" aria-label="Egne dager">
                {FORSLAG_DAGER.map((d) => (
                  <button key={d.dag} type="button" role="checkbox" aria-checked={harDag(d)} onClick={() => veksleDag(d)}>
                    {d.navn} <span className="dempet">{kortDato(`${aar}-${d.dag}`)}</span>
                  </button>
                ))}
                {egne.filter((e) => !FORSLAG_DAGER.some((f) => f.dag === e.dag)).map((d) => (
                  <button key={d.dag} type="button" role="checkbox" aria-checked onClick={() => veksleDag(d)} aria-label={`Fjern ${d.navn}`}>
                    {d.navn} <span className="dempet">{kortDato(`${aar}-${d.dag}`)}</span><Ikon navn="lukk" storrelse={14} />
                  </button>
                ))}
              </div>
              <div className="egen-dag">
                <input value={egenNavn} onChange={(e) => setEgenNavn(e.target.value)} placeholder="Egen dag, f.eks. Nissefest" aria-label="Navn på egen dag" />
                <input type="date" value={egenDato} onChange={(e) => setEgenDato(e.target.value)} aria-label="Dato" />
                <button type="button" className="knapp" disabled={!egenNavn.trim() || !egenDato}
                  onClick={() => { setEgne([...egne.filter((x) => x.dag !== egenDato.slice(5)), { navn: egenNavn.trim(), dag: egenDato.slice(5) }]); setEgenNavn(''); setEgenDato(''); }}>
                  Legg til
                </button>
              </div>
            </div>
            <p className="dempet liten">
              {punktum(`${luker.length} luker${modus === 'alle' ? ' (1.–24. des.)' : `: ${luker.map((l) => kortDato(l.dato)).join(', ')}`}`)}
              {egne.length > 0 && ` ${punktum(`Egne dager: ${[...egne].sort((a, b) => a.dag.localeCompare(b.dag)).map((d) => `${d.navn} ${kortDato(`${aar}-${d.dag}`)}`).join(', ')}`)}`}
              {' '}Du kan legge til flere dager senere.
            </p>
          </div>
        )}

        <ListeFelt u={u} sett={sett} visType={kilde === 'tom'} />

        <div className="knapperad slutt">
          <button type="button" className="knapp" onClick={lukk}>Avbryt</button>
          <button type="submit" className="knapp primar" disabled={!u.navn.trim() || lagrer}>{lagrer ? 'Lager …' : 'Lag liste'}</button>
        </div>
      </form>
    </Ark>
  );
}

// ---------------------------------------------------------------- Én liste

type Redigerer = { punkt: Punkt; ny: boolean } | null;

/** Hvilke hovedpunkter som er lukket, per liste (huskes i nettleseren). Alt er åpent som standard. */
function lesLukket(listeId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(`familie.lukket.${listeId}`) ?? '[]') as string[]); } catch { return new Set(); }
}
function lagreLukket(listeId: string, lukket: Set<string>) {
  try { localStorage.setItem(`familie.lukket.${listeId}`, JSON.stringify([...lukket])); } catch { /* ignorer */ }
}

function ListeSide({ id, gaaTil }: { id: string; gaaTil: (r: string) => void }) {
  const { lister, punkter, lastet, feil } = useLister();
  const tilstand = useTilstand();
  const { visToast } = tilstand;
  const [redigerer, setRedigerer] = useState<Redigerer>(null);
  const [endrer, setEndrer] = useState(false);
  const [valg, setValg] = useState(false);
  const [historikk, setHistorikk] = useState(false);
  const [utgift, setUtgift] = useState<UtgiftForslag | null>(null);
  const [visFerdige, setVisFerdige] = useState(true);
  const [hurtig, setHurtig] = useState('');
  /** Hovedpunktet nye punkter fra feltet øverst legges under ('' = eget punkt) */
  const [under, setUnder] = useState('');
  const [barnTekst, setBarnTekst] = useState<Record<string, string>>({});
  const [lukket, setLukketRaa] = useState(() => lesLukket(id));
  const setLukket = (l: Set<string>) => { setLukketRaa(l); lagreLukket(id, l); };
  if (!lastet) return <Laster />;
  const liste = lister.find((l) => l.id === id);
  if (!liste) {
    return (
      <Tom ikon="liste" tittel="Fant ikke listen" tekst="Den kan være slettet.">
        <button className="knapp" onClick={() => gaaTil('lister')}>Til listene</button>
      </Tom>
    );
  }

  const type = liste.type;
  const info = LISTETYPER[type];
  const mine = punkter.filter((p) => p.listeId === id);
  const tre = lagTre(mine, type);
  const idag = iDag();
  const kobling = finnKobling(liste, tilstand.felles, tilstand.privat);
  const historie = type === 'gave' ? gavehistorikk(lister, punkter) : [];

  /** Lagrer punktet. Når det blir kjøpt og har beløp, tilbys å føre det som utgift. */
  function lagre(foer: Punkt | undefined, etter: Punkt) {
    void listeLager.lagrePunkter([etter]);
    const bleKjopt = !liste!.mal && !!etter.belop && erBrukt(type, etter.status) && !(foer && erBrukt(type, foer.status));
    if (bleKjopt) {
      visToast({
        tekst: `«${etter.tekst}» ${statusTekst(type, etter.status).toLowerCase()}`,
        handling: {
          tekst: 'Før utgift',
          kjor: () => {
            setUtgift({ belop: etter.belop!, notat: etter.tekst, kategoriId: kobling?.type === 'post' ? kobling.post.kategoriId : undefined, privat: liste!.privat });
            visToast(null);
          },
        },
      });
    }
  }
  const settStatus = (p: Punkt, status: string) => lagre(p, medStatus(p, type, status, idag));
  const aapne = (p: Punkt) => setRedigerer({ punkt: p, ny: false });

  // Mulige hovedpunkter: punkter på toppnivå
  const toppnivaa = tre.map((t) => t.punkt);
  const forelder = toppnivaa.find((x) => x.id === under);
  const veksle = (pid: string) => { const l = new Set(lukket); if (l.has(pid)) l.delete(pid); else l.add(pid); setLukket(l); };
  const grupper = tre.filter((t) => t.barn.length > 0).map((t) => t.punkt.id);
  const alleLukket = grupper.length > 0 && grupper.every((g) => lukket.has(g));

  function leggTil(e: FormEvent) {
    e.preventDefault();
    if (!hurtig.trim()) return;
    const { tekst, ...ekstra } = tolkHurtig(type, hurtig);
    void listeLager.lagrePunkter([nyttPunkt(id, type, tekst, nesteRekkefolge(mine), { ...ekstra, forelderId: forelder?.id ?? null })]);
    // Åpne hovedpunktet så det nye underpunktet synes
    if (forelder && lukket.has(forelder.id)) veksle(forelder.id);
    setHurtig('');
  }

  function leggTilBarn(e: FormEvent, f: Punkt) {
    e.preventDefault();
    const tekst = barnTekst[f.id]?.trim();
    if (!tekst) return;
    void listeLager.lagrePunkter([nyttPunkt(id, type, tekst, nesteRekkefolge(mine), { forelderId: f.id })]);
    setBarnTekst({ ...barnTekst, [f.id]: '' });
  }

  const rad = (p: Punkt, barn: Punkt[]): ReactNode => {
    const ferdig = erFerdig(type, p.status);
    const dager = p.dato ? dagerMellom(idag, p.dato) : null;
    // Nær frist vises i farge i infolinjen (plass til beløp og status på mobil)
    const frist = dager !== null && !ferdig && type !== 'kalender' && dager <= 14 ? dager : null;
    const deler = [
      type === 'gave' ? null : p.mottaker,
      p.plassering,
      type === 'hage' ? maanederTekst(p.maaneder) : null,
      type === 'hage' && p.sistGjort ? `Stelt ${kortDato(p.sistGjort)}` : null,
      stjerneTekst(p.vurdering),
      p.dato && type !== 'kalender' && (ferdig || dager! > 14) ? kortDato(p.dato) : null,
      barn.length ? (medAvkryss(type) ? `${barn.filter((b) => erFerdig(type, b.status)).length} av ${barn.length} gjort` : `${barn.length} ${barn.length === 1 ? 'underpunkt' : 'underpunkter'}`) : null,
      p.lenke ? '🔗' : null,
      p.notat,
    ].filter(Boolean);
    const aapen = !lukket.has(p.id);
    const radInnhold = (
      <>
          {medAvkryss(type)
            ? <Avkryss pa={ferdig} etikett={p.tekst} endre={() => settStatus(p, nesteStatus(type, p.status))} />
            : info.statuser.length > 1 ? null : <span className="punkt-ikon"><Ikon navn="blad" storrelse={18} /></span>}
          <button className="rad-knapp" onClick={() => aapne(p)}>
            <span className="hoved">
              <span className="navn">{p.tekst || 'Uten navn'}</span>
              {(deler.length > 0 || frist !== null) && (
                <span className="info">
                  {frist !== null && <><span className={`frist ${frist < 0 ? 'feil' : frist <= 2 ? 'varsel' : ''}`}>{frist < 0 && <Ikon navn="advarsel" storrelse={11} />}{dagerTekst(frist)}</span>{deler.length ? ' · ' : ''}</>}
                  {deler.join(' · ')}
                </span>
              )}
            </span>
            {p.belop ? <span className="belop">{kr(p.belop)}</span> : null}
          </button>
          {!medAvkryss(type) && info.statuser.length > 1 && <StatusKnapp type={type} status={p.status} endre={() => settStatus(p, nesteStatus(type, p.status))} />}
      </>
    );
    const ferdigKlasse = ferdig && medAvkryss(type) ? ' ferdig' : '';
    if (!barn.length) return <div className={`punkt${ferdigKlasse}`} key={p.id}><div className="rad">{radInnhold}</div></div>;

    // Hovedpunkt: tonet topp med pil, underpunktene med innrykk og strek, og felt for nytt underpunkt nederst
    return (
      <div className={`gruppe-punkt${ferdigKlasse}${aapen ? '' : ' lukket'}`} key={p.id}>
        <div className="rad gruppe-topp">
          {radInnhold}
          <button type="button" className="knapp flat ikon liten gruppe-pil" aria-expanded={aapen}
            aria-label={`${aapen ? 'Skjul' : 'Vis'} underpunktene i ${p.tekst}`} onClick={() => veksle(p.id)}>
            <Ikon navn="pilned" storrelse={18} />
          </button>
        </div>
        {aapen && (
          <div className="gruppe-barn">
            {barn.map((b) => rad(b, []))}
            <form className="legg-til-barn" onSubmit={(e) => leggTilBarn(e, p)}>
              <Ikon navn="pluss" storrelse={16} />
              <input value={barnTekst[p.id] ?? ''} onChange={(e) => setBarnTekst({ ...barnTekst, [p.id]: e.target.value })}
                placeholder={`Legg til i ${p.tekst} …`} aria-label={`Nytt underpunkt i ${p.tekst}`} enterKeyHint="done" />
            </form>
          </div>
        )}
      </div>
    );
  };

  // Gruppering etter type
  let innhold: ReactNode;
  if (type === 'kalender') {
    const aar = mine.find((p) => p.dato)?.dato?.slice(0, 4) ?? String(kalenderAar(idag));
    innhold = (
      <>
        {tre.length === 0 && <Tom ikon="kalender" tittel="Ingen luker ennå" />}
        <div className="kalender">
          {tre.map(({ punkt: p }) => {
            const klar = erFerdig(type, p.status);
            return (
              <button key={p.id} className={`luke${klar ? ' klar' : ''}${p.dato === idag ? ' i-dag' : ''}`} onClick={() => aapne(p)}>
                <span className="luke-topp">
                  <span><span className="dag">{p.dato ? Number(p.dato.slice(8)) : '–'}</span> <span className="mnd">{p.dato ? MAANEDER_KORT[Number(p.dato.slice(5, 7)) - 1] : ''}</span></span>
                  {klar && <span className="merkelapp bra"><Ikon navn="sjekk" storrelse={12} />Klar</span>}
                </span>
                {!/^Luke \d+$/.test(p.tekst) && <span className="luke-navn">{p.tekst}</span>}
                <span className="ide">{p.notat || <span className="dempet">Legg inn idé</span>}</span>
                {p.belop ? <span className="dempet liten tall">{kr(p.belop)}</span> : null}
              </button>
            );
          })}
        </div>
        <button className="knapp" style={{ alignSelf: 'flex-start', marginTop: 12 }}
          onClick={() => setRedigerer({ punkt: nyttPunkt(id, type, '', nesteRekkefolge(mine), { dato: `${aar}-12-01` }), ny: true })}>
          <Ikon navn="pluss" storrelse={18} />Legg til dag
        </button>
      </>
    );
  } else if (type === 'gave') {
    const navn = [...new Set(tre.map(({ punkt }) => punkt.mottaker?.trim() || ''))].sort((a, b) => (a ? b ? a.localeCompare(b, 'nb') : -1 : 1));
    // Én boks per mottaker, så personene skilles tydelig fra hverandre
    innhold = navn.map((m) => {
      const gaver = tre.filter(({ punkt }) => (punkt.mottaker?.trim() || '') === m);
      const tidligere = m ? tidligereGaver(historie, m).filter((g) => g.liste.id !== id).slice(0, 3) : [];
      const under = [`${gaver.length} ${gaver.length === 1 ? 'gave' : 'gaver'}`, tidligere.length ? `Før: ${tidligere.map((g) => `${g.aar} ${g.punkt.tekst}`).join(', ')}` : null].filter(Boolean).join(' · ');
      return (
        <section className="seksjon boks" key={m || '-'}>
          <SeksjonHode person tittel={m || 'Uten mottaker'} under={under}
            sum={sum(gaver.flatMap(({ punkt, barn }) => [punkt, ...barn]), (x) => x.belop ?? 0)} />
          <div className="liste">{gaver.map(({ punkt, barn }) => rad(punkt, barn))}</div>
        </section>
      );
    });
  } else if (medAvkryss(type)) {
    const aapne_ = tre.filter(({ punkt }) => !erFerdig(type, punkt.status));
    const ferdige = tre.filter(({ punkt }) => erFerdig(type, punkt.status));
    innhold = (
      <>
        <div className="liste">{aapne_.map(({ punkt, barn }) => rad(punkt, barn))}</div>
        {aapne_.length === 0 && ferdige.length > 0 && <p className="dempet" style={{ padding: '12px 4px' }}>Alt er gjort! 🎉</p>}
        {ferdige.length > 0 && (
          <>
            <div className="seksjon">
              <button className="seksjon-knapp" onClick={() => setVisFerdige(!visFerdige)} aria-expanded={visFerdige}>
                <SeksjonHode tittel="Gjort" antall={ferdige.length}><Ikon navn={visFerdige ? 'pilned' : 'pilhoyre'} storrelse={16} /></SeksjonHode>
              </button>
              {visFerdige && <div className="liste">{ferdige.map(({ punkt, barn }) => rad(punkt, barn))}</div>}
            </div>
          </>
        )}
      </>
    );
  } else if (info.statuser.length > 1) {
    innhold = info.statuser.map((s) => {
      const her = tre.filter(({ punkt }) => (info.statuser.some((x) => x.id === punkt.status) ? punkt.status : info.statuser[0].id) === s.id);
      if (!her.length) return null;
      return (
        <div className="seksjon" key={s.id}>
          <SeksjonHode tittel={s.tekst} antall={her.length} sum={sum(her.flatMap(({ punkt, barn }) => [punkt, ...barn]), (x) => x.belop ?? 0)} />
          <div className="liste">{her.map(({ punkt, barn }) => rad(punkt, barn))}</div>
        </div>
      );
    });
  } else {
    innhold = <div className="liste">{tre.map(({ punkt, barn }) => rad(punkt, barn))}</div>;
  }

  const plassholder: Record<ListeType, string> = {
    sjekk: 'Legg til punkt …', gave: 'F.eks. Mamma: skjerf', onske: 'F.eks. Ny sofa', oppgave: 'F.eks. Ny stikkontakt på badet',
    opplevelse: 'Navn på restaurant eller sted', serie: 'Tittel', hage: 'Plante eller ting, f.eks. Roser', kalender: '',
  };
  const f = fremdrift(type, mine);

  return (
    <>
      <FeilBanner feil={feil} />
      <div className="verktoylinje">
        <button className="knapp flat liten" onClick={() => gaaTil('lister')}><Ikon navn="pilvenstre" storrelse={18} />Alle lister</button>
        <div className="knapperad">
          {type === 'gave' && <button className="knapp liten" onClick={() => setHistorikk(true)}><Ikon navn="gave" storrelse={16} />Historikk</button>}
          <button className="knapp liten" onClick={() => setValg(true)}><Ikon navn="mer" storrelse={16} />Valg</button>
        </div>
      </div>

      <div className="liste-meta">
        <span className="merkelapp">{info.ikon} {info.navn}</span>
        <span className="merkelapp">{liste.kategori || 'Annet'}</span>
        {liste.privat
          ? <span className="merkelapp aksent"><Ikon navn="privat" storrelse={12} />Bare du ser listen</span>
          : <span className="merkelapp"><Ikon navn="person" storrelse={12} />Felles</span>}
        {liste.mal && <span className="merkelapp varsel"><Ikon navn="kopi" storrelse={12} />Mal</span>}
        {info.statuser.length > 1 && f.totalt > 0 && <span className="dempet liten">{f.ferdig} av {f.totalt} {type === 'kalender' ? 'klar' : 'ferdig'}</span>}
        {grupper.length > 1 && (
          <button className="knapp flat liten" style={{ marginLeft: 'auto' }} onClick={() => setLukket(alleLukket ? new Set() : new Set(grupper))}>
            <Ikon navn={alleLukket ? 'pilned' : 'pilhoyre'} storrelse={16} />{alleLukket ? 'Vis alle' : 'Skjul underpunkter'}
          </button>
        )}
      </div>

      {!liste.mal && <BudsjettKort liste={liste} punkter={mine} endre={() => setEndrer(true)} />}
      {type === 'hage' && <HageSesong oppgaver={hageIMaaned([liste], mine, idag)} />}

      <section className="kort">
        {type !== 'kalender' && (
          <form className="hurtig-skjema" onSubmit={leggTil}>
            <div className="hurtig">
              <input value={hurtig} onChange={(e) => setHurtig(e.target.value)} enterKeyHint="done"
                placeholder={forelder ? `Nytt underpunkt i «${forelder.tekst}»` : plassholder[type]} aria-label="Nytt punkt" />
              <button type="submit" className="knapp primar ikon" aria-label="Legg til" disabled={!hurtig.trim()}><Ikon navn="pluss" /></button>
            </div>
            {toppnivaa.length > 0 && (
              <label className={`hurtig-under${forelder ? ' valgt' : ''}`}>
                <span>Legg til</span>
                <select value={forelder ? under : ''} onChange={(e) => setUnder(e.target.value)}>
                  <option value="">som eget punkt</option>
                  {toppnivaa.map((x) => <option key={x.id} value={x.id}>under «{x.tekst}»</option>)}
                </select>
              </label>
            )}
          </form>
        )}
        {mine.length === 0 && type !== 'kalender'
          ? <Tom ikon={type === 'hage' ? 'blad' : type === 'gave' ? 'gave' : 'liste'} tittel="Tom liste" tekst={type === 'hage' ? 'Legg til planter. Trykk på en plante for å legge inn stell per måned.' : 'Skriv inn over og trykk Enter. Velg «under …» for å lage underpunkter. Trykk på et punkt for flere detaljer.'} />
          : innhold}
      </section>

      {redigerer && (
        <PunktArk key={redigerer.punkt.id} liste={liste} start={redigerer.punkt} ny={redigerer.ny} alle={mine} historikk={historie}
          lagre={lagre} lukk={() => setRedigerer(null)} aapne={aapne}
          forUtgift={(p) => { setRedigerer(null); setUtgift({ belop: p.belop ?? 0, notat: p.tekst, kategoriId: kobling?.type === 'post' ? kobling.post.kategoriId : undefined, privat: liste.privat }); }} />
      )}
      {endrer && <ListeSkjema liste={liste} lukk={() => setEndrer(false)} />}
      {valg && <ValgArk liste={liste} punkter={mine} lukk={() => setValg(false)} endre={() => { setValg(false); setEndrer(true); }} gaaTil={gaaTil} />}
      {historikk && <GavehistorikkArk lukk={() => setHistorikk(false)} />}
      {utgift && <UtgiftSkjema forslag={utgift} privatStart={liste.privat} lukk={() => setUtgift(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- Ett punkt

function PunktArk({ liste, start, ny, alle, historikk, lagre, lukk, aapne, forUtgift }: {
  liste: Liste; start: Punkt; ny: boolean; alle: Punkt[]; historikk: ReturnType<typeof gavehistorikk>;
  lagre: (foer: Punkt | undefined, etter: Punkt) => void; lukk: () => void; aapne: (p: Punkt) => void; forUtgift: (p: Punkt) => void;
}) {
  const { visToast } = useTilstand();
  const type = liste.type;
  const info = LISTETYPER[type];
  const har = (f: (typeof info.felt)[number]) => info.felt.includes(f);
  const [p, setP] = useState<Punkt>(start);
  const [bekreft, setBekreft] = useState(false);
  const [nyttBarn, setNyttBarn] = useState('');
  const sett = (e: Partial<Punkt>) => setP({ ...p, ...e });
  const barn = alle.filter((b) => b.forelderId === p.id).sort((a, b) => a.rekkefolge - b.rekkefolge);
  const mulige = alle.filter((x) => !x.forelderId && x.id !== p.id);
  const tidligere = type === 'gave' && p.mottaker ? tidligereGaver(historikk, p.mottaker, p.id) : [];
  const mottakere = type === 'gave' ? [...new Set([...historikk.map((m) => m.navn), ...alle.map((x) => x.mottaker?.trim()).filter(Boolean) as string[]])] : [];
  const idag = iDag();

  const tekstEtikett: Record<ListeType, string> = {
    sjekk: 'Tekst', gave: 'Gave', onske: 'Hva', oppgave: 'Oppgave', opplevelse: 'Sted', serie: 'Tittel', hage: 'Plante, ting eller oppgave', kalender: 'Luke',
  };

  function send(e: FormEvent) {
    e.preventDefault();
    lagre(ny ? undefined : start, { ...p, tekst: p.tekst.trim() });
    lukk();
  }

  function slett() {
    const angre = listeLager.slettPunkt(start);
    visToast({ tekst: `Slettet «${start.tekst}»`, angre: () => { void angre(); visToast(null); } });
    lukk();
  }

  function leggTilBarn() {
    if (!nyttBarn.trim()) return;
    void listeLager.lagrePunkter([{ ...nyttPunkt(liste.id, type, nyttBarn.trim(), nesteRekkefolge(alle)), forelderId: p.id }]);
    setNyttBarn('');
  }

  return (
    <Ark tittel={ny ? (type === 'kalender' ? 'Ny dag' : 'Nytt punkt') : p.tekst || 'Punkt'} lukk={lukk}>
      <form className="skjema" onSubmit={send}>
        <Felt etikett={tekstEtikett[type]}>
          <input value={p.tekst} onChange={(e) => sett({ tekst: e.target.value })} required autoFocus={ny}
            placeholder={type === 'kalender' ? 'F.eks. Nissefest' : undefined} />
        </Felt>

        {info.statuser.length > 1 && (
          <div className="felt">
            <span>Status</span>
            <Segment etikett="Status" full verdi={p.status} endre={(s) => setP(medStatus(p, type, s, idag))}
              valg={info.statuser.map((s) => ({ verdi: s.id, tekst: s.tekst }))} />
          </div>
        )}

        {har('mottaker') && (
          <Felt etikett="Til">
            <input value={p.mottaker ?? ''} onChange={(e) => sett({ mottaker: e.target.value })} list="mottakere" placeholder="F.eks. Mamma" />
            <datalist id="mottakere">{mottakere.map((m) => <option key={m} value={m} />)}</datalist>
          </Felt>
        )}
        {tidligere.length > 0 && (
          <div className="banner info">
            <Ikon navn="gave" />
            <div><strong>Tidligere til {p.mottaker}</strong><p className="liten">{tidligere.slice(0, 5).map((g) => `${g.aar}: ${g.punkt.tekst}`).join(' · ')}</p></div>
          </div>
        )}

        {type === 'kalender' && (
          <Felt etikett="Idé"><textarea value={p.notat} onChange={(e) => sett({ notat: e.target.value })} placeholder="Hva skjer denne dagen? Gave, aktivitet, overraskelse …" /></Felt>
        )}

        {(har('belop') || har('dato')) && (
          <div className="felt-rad">
            {har('belop') && <Felt etikett={type === 'kalender' ? 'Kostnad' : 'Beløp'}><BelopFelt verdi={p.belop ?? 0} endre={(v) => sett({ belop: v || null })} /></Felt>}
            {har('dato') && (
              <Felt etikett={type === 'kalender' ? 'Dato' : type === 'opplevelse' ? 'Planlagt dato' : 'Husk innen'}>
                <input type="date" value={p.dato ?? ''} onChange={(e) => sett({ dato: e.target.value || null })} required={type === 'kalender'} />
              </Felt>
            )}
          </div>
        )}
        {har('dato') && type !== 'kalender' && <p className="dempet liten" style={{ marginTop: -8 }}>Med dato vises punktet på huskelappen de siste 14 dagene før.</p>}

        {har('vurdering') && <div className="felt"><span>Vurdering</span><Stjerner verdi={p.vurdering} endre={(v) => sett({ vurdering: v })} /></div>}

        {har('plassering') && !p.forelderId && <Felt etikett="Hvor"><input value={p.plassering ?? ''} onChange={(e) => sett({ plassering: e.target.value })} placeholder="F.eks. Sørveggen" /></Felt>}
        {har('maaneder') && (
          <div className="felt">
            <span>Stell disse månedene</span>
            <div className="maaned-valg" role="group" aria-label="Måneder">
              {MAANEDER_KORT.map((m, i) => {
                const pa = !!p.maaneder?.includes(i + 1);
                return (
                  <button key={m} type="button" aria-pressed={pa} className={i + 1 === Number(idag.slice(5, 7)) ? 'naa' : undefined}
                    onClick={() => sett({ maaneder: pa ? p.maaneder!.filter((x) => x !== i + 1) : [...(p.maaneder ?? []), i + 1] })}>{m}</button>
                );
              })}
            </div>
            <small>{barn.length ? 'Gjelder planten selv. Legg ulike oppgaver (beskjære, gjødsle) som underpunkter med egne måneder.' : 'Vises under «I hagen» de valgte månedene.'}</small>
          </div>
        )}

        {har('lenke') && (
          <Felt etikett="Lenke">
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="url" inputMode="url" value={p.lenke ?? ''} onChange={(e) => sett({ lenke: e.target.value })} placeholder="https://" style={{ flex: 1, minWidth: 0 }} />
              {p.lenke && /^https?:\/\//.test(p.lenke) && <a className="knapp ikon" href={p.lenke} target="_blank" rel="noreferrer" aria-label="Åpne lenken"><Ikon navn="lenke" storrelse={18} /></a>}
            </div>
          </Felt>
        )}

        {type !== 'kalender' && <Felt etikett="Notat"><textarea value={p.notat} onChange={(e) => sett({ notat: e.target.value })} /></Felt>}

        {type !== 'kalender' && barn.length === 0 && mulige.length > 0 && (
          <Felt etikett="Underpunkt av">
            <select value={p.forelderId ?? ''} onChange={(e) => sett({ forelderId: e.target.value || null })}>
              <option value="">Ingen (eget punkt)</option>
              {mulige.sort((a, b) => a.rekkefolge - b.rekkefolge).map((x) => <option key={x.id} value={x.id}>{x.tekst}</option>)}
            </select>
          </Felt>
        )}

        {!ny && !p.forelderId && type !== 'kalender' && (
          <div className="felt">
            <span>Underpunkter</span>
            {barn.length > 0 && (
              <div className="liste">
                {barn.map((b) => (
                  <button type="button" className="rad" key={b.id} onClick={() => aapne(b)} style={{ minHeight: 44 }}>
                    {erFerdig(type, b.status) && <Ikon navn="sjekk" storrelse={16} />}
                    <span className="hoved"><span className="navn">{b.tekst}</span>{b.maaneder?.length ? <span className="info">{maanederTekst(b.maaneder)}</span> : null}</span>
                    <Ikon navn="pilhoyre" storrelse={16} />
                  </button>
                ))}
              </div>
            )}
            <div className="hurtig">
              <input value={nyttBarn} onChange={(e) => setNyttBarn(e.target.value)} placeholder={type === 'hage' ? 'F.eks. Beskjære' : 'Nytt underpunkt'} aria-label="Nytt underpunkt"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); leggTilBarn(); } }} />
              <button type="button" className="knapp ikon" aria-label="Legg til underpunkt" disabled={!nyttBarn.trim()} onClick={leggTilBarn}><Ikon navn="pluss" /></button>
            </div>
          </div>
        )}

        {!ny && !liste.mal && !!p.belop && erBrukt(type, p.status) && (
          <button type="button" className="knapp flat" style={{ alignSelf: 'flex-start' }} onClick={() => forUtgift(p)}>
            <Ikon navn="inntekt" storrelse={18} />Før {kr(p.belop)} som utgift
          </button>
        )}

        <div className="knapperad slutt">
          {!ny && (bekreft
            ? <button type="button" className="knapp fare dytt" onClick={slett}><Ikon navn="slett" storrelse={18} />{barn.length ? `Slett med ${barn.length} underpunkter` : 'Bekreft sletting'}</button>
            : <button type="button" className="knapp flat fare dytt" onClick={() => setBekreft(true)}><Ikon navn="slett" storrelse={18} />Slett</button>)}
          <button type="button" className="knapp" onClick={lukk}>Avbryt</button>
          <button type="submit" className="knapp primar" disabled={!p.tekst.trim() || (type === 'kalender' && !p.dato)}>Lagre</button>
        </div>
      </form>
    </Ark>
  );
}

// ---------------------------------------------------------------- Valg for listen

/** «Gaver jul 2025» → «Gaver jul 2026». Uten årstall: «… (kopi)». */
function nyttNavn(navn: string): { navn: string; aarFlytt: number } {
  const m = navn.match(/\b(20\d\d)\b/);
  if (!m) return { navn: `${navn} (kopi)`, aarFlytt: 0 };
  return { navn: navn.replace(m[1], String(Number(m[1]) + 1)), aarFlytt: 1 };
}

function flyttAar(p: Punkt, aar: number): Punkt {
  if (!aar || !p.dato) return p;
  const nyttAar = Number(p.dato.slice(0, 4)) + aar;
  // Søndagene i advent faller på ulike datoer hvert år
  const sondag = p.tekst.match(/^(\d)\. søndag i advent/);
  return { ...p, dato: sondag ? adventssondager(nyttAar)[Number(sondag[1]) - 1] : `${nyttAar}${p.dato.slice(4)}` };
}

function ValgArk({ liste, punkter, lukk, endre, gaaTil }: { liste: Liste; punkter: Punkt[]; lukk: () => void; endre: () => void; gaaTil: (r: string) => void }) {
  const { lister } = useLister();
  const { visToast } = useTilstand();
  const [bekreft, setBekreft] = useState(false);
  const tilbake = nullstill(punkter, liste.type);
  const forste = LISTETYPER[liste.type].statuser[0].tekst;
  const rekkefolge = lister.reduce((m, l) => Math.max(m, l.rekkefolge), 0) + 1;

  async function kopier(somMal: boolean) {
    const { navn, aarFlytt } = somMal || liste.mal ? { navn: liste.navn, aarFlytt: 0 } : nyttNavn(liste.navn);
    const ny: Liste = { ...liste, id: nyId(), navn, mal: somMal, rekkefolge, opprettet: iDag() };
    const nye = kopierPunkter(punkter, ny.id, liste.type).map((p) => flyttAar(p, aarFlytt));
    if (await listeLager.opprett(ny, nye)) {
      lukk();
      visToast({ tekst: somMal ? `Lagret «${navn}» som mal` : `Laget «${navn}»` });
      if (!somMal) gaaTil(`lister/${ny.id}`);
    }
  }

  const valg: { ikon: string; tekst: string; info: string; gjor: () => void; fare?: boolean; skjul?: boolean }[] = [
    { ikon: 'rediger', tekst: 'Endre liste', info: 'Navn, ikon, kategori, privat og budsjettkobling', gjor: endre },
    {
      ikon: 'revisjon', tekst: 'Nullstill', skjul: !tilbake.length || LISTETYPER[liste.type].statuser.length < 2,
      info: `Setter ${tilbake.length} punkter tilbake til «${forste}» – f.eks. pakkelisten før neste tur`,
      gjor: () => {
        const foer = punkter.filter((p) => tilbake.some((t) => t.id === p.id));
        void listeLager.lagrePunkter(tilbake);
        visToast({ tekst: `Nullstilte ${tilbake.length} punkter`, angre: () => { void listeLager.lagrePunkter(foer); visToast(null); } });
        lukk();
      },
    },
    {
      ikon: 'kopi', tekst: liste.mal ? 'Lag liste fra malen' : 'Kopier til ny liste',
      info: liste.mal ? 'Ny liste med de samme punktene' : /\b20\d\d\b/.test(liste.navn) ? `Lager «${nyttNavn(liste.navn).navn}» med datoene flyttet ett år frem` : 'Samme punkter, alt satt tilbake til start',
      gjor: () => void kopier(false),
    },
    { ikon: 'liste', tekst: 'Lagre som mal', skjul: liste.mal, info: 'Gjenbruk listen – den dukker opp under «Ny liste»', gjor: () => void kopier(true) },
  ];

  return (
    <Ark tittel={liste.navn} lukk={lukk}>
      <div className="liste">
        {valg.filter((v) => !v.skjul).map((v) => (
          <button key={v.tekst} className="rad" onClick={v.gjor}>
            <Ikon navn={v.ikon} />
            <span className="hoved"><span className="navn">{v.tekst}</span><span className="info" style={{ whiteSpace: 'normal' }}>{v.info}</span></span>
          </button>
        ))}
        <button className="rad fare-rad" onClick={() => {
          if (!bekreft) { setBekreft(true); return; }
          const angre = listeLager.slettListe(liste);
          visToast({ tekst: `Slettet «${liste.navn}»`, angre: () => { void angre(); visToast(null); } });
          lukk();
          gaaTil('lister');
        }}>
          <Ikon navn="slett" />
          <span className="hoved"><span className="navn">{bekreft ? 'Trykk igjen for å slette' : 'Slett liste'}</span><span className="info">{punkter.length} punkter slettes også</span></span>
        </button>
      </div>
    </Ark>
  );
}

// ---------------------------------------------------------------- Gavehistorikk

function GavehistorikkArk({ lukk }: { lukk: () => void }) {
  const { lister, punkter } = useLister();
  const historikk = gavehistorikk(lister, punkter);
  return (
    <Ark tittel="Gavehistorikk" lukk={lukk}>
      <p className="dempet liten" style={{ marginBottom: 8 }}>Kjøpte og gitte gaver fra alle gavelistene du ser, så dere slipper å gi det samme to ganger.</p>
      {historikk.length === 0 && <Tom ikon="gave" tittel="Ingen gaver ennå" tekst="Gaver med mottaker som er kjøpt eller gitt havner her." />}
      {historikk.map((m) => (
        <div key={m.navn}>
          <div className="gruppe-hode"><span className="navn">{m.navn}</span><span className="dempet liten">{m.gaver.length} {m.gaver.length === 1 ? 'gave' : 'gaver'}</span></div>
          <div className="liste">
            {m.gaver.map((g) => (
              <div className="rad" key={g.punkt.id}>
                <span className="merkelapp tall">{g.aar}</span>
                <span className="hoved"><span className="navn">{g.punkt.tekst}</span><span className="info">{g.liste.navn} · {statusTekst('gave', g.punkt.status)}</span></span>
                {g.punkt.belop ? <span className="belop">{kr(g.punkt.belop)}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </Ark>
  );
}
