// Felles kalender: uke- og månedsvisning, avtaler med gjentakelser og unntak («bare denne dagen»),
// bursdager fra gaveårene og frister fra listene. Abonnement for telefonens kalender (Edge Function «kalender»).
// Logikk: logikk/kalender.ts. Data: data/kalender.ts (tabellen «hendelse»).
import { useMemo, useState, type FormEvent } from 'react';
import type { Gjentak, KalenderKategori } from '../data/modell';
import { nyId } from '../data/modell';
import { endreKalender, lukkKalenderFeil, useKalender } from '../data/kalender';
import { useLister } from '../data/lister';
import { useTilstand } from '../data/tilstand';
import { lager } from '../data/lager';
import { iDag } from '../logikk/beregning';
import {
  KATEGORIER, UKEDAGER_KORT, angreEndring, endreForekomst, gjentakTekst, kalenderPoster, leggTilDager, mandagI, paaDato,
  slettForekomst, ukedag, type Avtale, type KalenderPost, type Modus,
} from '../logikk/kalender';
import { Ark, Felt, Ikon, Segment } from '../ui/felles';

// ---------------------------------------------------------------- Hjelpere

const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const somDato = (d: string) => { const [a, m, n] = d.split('-').map(Number); return new Date(a, m - 1, n); };
/** «Mandag 12. oktober» */
const dagTittel = (d: string) => stor(somDato(d).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }));
/** «12. okt.» */
const kortDag = (d: string) => somDato(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
const maanedNavn = (d: string) => stor(somDato(d).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' }));

/** ISO-ukenummer */
function ukenummer(d: string): number {
  const dato = somDato(leggTilDager(d, 4 - ukedag(d))); // torsdagen i samme uke
  const start = new Date(dato.getFullYear(), 0, 1);
  return Math.ceil(((dato.getTime() - start.getTime()) / 86_400_000 + 1) / 7);
}

function lesValg(nokkel: string): string | null {
  try { return localStorage.getItem(nokkel); } catch { return null; }
}
function lagreValg(nokkel: string, verdi: string) {
  try { localStorage.setItem(nokkel, verdi); } catch { /* ignorer */ }
}

/** Personer (Terje, Ingrid) og familiemedlemmer (barna) */
function useFolk() {
  const { felles, meg } = useTilstand();
  const voksne = felles?.personer ?? [];
  const barn = felles?.familie ?? [];
  const alle = [...voksne, ...barn];
  return { voksne, barn, alle, meg, navn: (id: string) => alle.find((p) => p.id === id)?.navn };
}

// ---------------------------------------------------------------- Én avtale i en liste

function PostRad({ post, navn, aapne }: { post: KalenderPost; navn: (id: string) => string | undefined; aapne: () => void }) {
  const hvem = post.hvem.map(navn).filter(Boolean).join(', ');
  const info = [
    post.ansvarlig && navn(post.ansvarlig) ? `🚗 ${navn(post.ansvarlig)}` : '',
    hvem,
    post.sted ?? '',
    post.sluttDato ? `til ${kortDag(post.sluttDato)}` : '',
  ].filter(Boolean).join(' · ');
  return (
    <button className="rad kal-post" onClick={aapne} style={{ ['--farge' as string]: `var(--k${post.farge})` }}>
      <span className="kal-tid tall">
        {post.fra ? <><strong>{post.fra}</strong>{post.til && <span>{post.til}</span>}</> : <span>Heldag</span>}
      </span>
      <span className="kal-strek" aria-hidden="true" />
      <span className="hoved">
        <span className="navn">{post.ikon} {post.tittel}</span>
        {info && <span className="info">{info}</span>}
      </span>
      {post.endret && <span className="merkelapp varsel" title="Endret for denne dagen">Endret</span>}
      {post.gjentar && !post.endret && <span className="dempet" title="Gjentas" aria-label="Gjentas"><Ikon navn="revisjon" storrelse={14} /></span>}
    </button>
  );
}

function DagListe({ dato, poster, navn, aapne, nyAvtale }: {
  dato: string; poster: KalenderPost[]; navn: (id: string) => string | undefined; aapne: (p: KalenderPost) => void; nyAvtale: () => void;
}) {
  const idag = iDag();
  return (
    <div className={`kal-dag${dato === idag ? ' i-dag' : ''}${dato < idag ? ' forbi' : ''}`}>
      <div className="kal-dag-hode">
        <span className="kal-dagnavn">{dagTittel(dato)}</span>
        {dato === idag && <span className="merkelapp aksent">I dag</span>}
        <button className="knapp flat ikon liten" onClick={nyAvtale} aria-label={`Ny avtale ${dagTittel(dato)}`}><Ikon navn="pluss" storrelse={16} /></button>
      </div>
      {poster.length
        ? <div className="liste">{poster.map((p) => <PostRad key={p.nokkel} post={p} navn={navn} aapne={() => aapne(p)} />)}</div>
        : <p className="dempet liten kal-tom">Ingen avtaler</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Siden

type Visning = 'uke' | 'maaned';

export function Kalender({ gaaTil }: { gaaTil: (r: string) => void }) {
  const { hendelser, lastet, feil } = useKalender();
  const { lister, punkter } = useLister();
  const { navn } = useFolk();
  const idag = iDag();
  const [visning, setVisningRaa] = useState<Visning>(() => (lesValg('familie.kalender.visning') as Visning) ?? (window.innerWidth < 640 ? 'uke' : 'maaned'));
  const setVisning = (v: Visning) => { setVisningRaa(v); lagreValg('familie.kalender.visning', v); };
  const [anker, setAnker] = useState(idag);
  const [valgt, setValgt] = useState(idag);
  const [ark, setArk] = useState<{ post?: KalenderPost; dato: string } | null>(null);
  const [abonner, setAbonner] = useState(false);

  const forsteIMnd = `${anker.slice(0, 7)}-01`;
  const fra = visning === 'uke' ? mandagI(anker) : mandagI(forsteIMnd);
  const sisteIMnd = leggTilDager(`${leggTilDager(forsteIMnd, 32).slice(0, 7)}-01`, -1);
  const til = visning === 'uke' ? leggTilDager(fra, 6) : leggTilDager(mandagI(sisteIMnd), 6);
  const dager = useMemo(() => { const ut: string[] = []; for (let d = fra; d <= til; d = leggTilDager(d, 1)) ut.push(d); return ut; }, [fra, til]);
  const poster = useMemo(() => kalenderPoster(hendelser, lister, punkter, fra, til), [hendelser, lister, punkter, fra, til]);
  const paa = (d: string) => poster.filter((p) => paaDato(p, d));

  const flytt = (retning: -1 | 1) => {
    if (visning === 'uke') setAnker(leggTilDager(anker, 7 * retning));
    else {
      const ny = `${leggTilDager(forsteIMnd, retning === 1 ? 32 : -1).slice(0, 7)}-01`;
      setAnker(ny);
      setValgt(ny.slice(0, 7) === idag.slice(0, 7) ? idag : ny);
    }
  };
  const tilIdag = () => { setAnker(idag); setValgt(idag); };
  const visesIdag = idag >= fra && idag <= til && (visning === 'uke' || idag.slice(0, 7) === anker.slice(0, 7));
  const aapne = (p: KalenderPost) => (p.kilde === 'avtale' ? setArk({ post: p, dato: p.dato }) : p.url && gaaTil(p.url.replace(/^#\//, '')));
  const nyDato = visning === 'maaned' ? valgt : visesIdag ? idag : fra;

  if (!lastet) return <div className="laster"><div className="spinner" aria-label="Laster" /></div>;

  return (
    <>
      {feil && (
        <div className="banner feil" role="alert">
          <Ikon navn="advarsel" />
          <div><strong>Kalenderen kunne ikke lagres eller hentes.</strong><p className="liten">{feil}{/hendelse/.test(feil) ? ' – er supabase/kalender.sql kjørt?' : ''}</p></div>
          <button className="knapp liten flat ikon" onClick={lukkKalenderFeil} aria-label="Lukk"><Ikon navn="lukk" storrelse={16} /></button>
        </div>
      )}

      <div className="verktoylinje">
        <div className="maanedsvelger" role="group" aria-label="Periode">
          <button className="knapp ikon flat liten" onClick={() => flytt(-1)} aria-label={visning === 'uke' ? 'Forrige uke' : 'Forrige måned'}><Ikon navn="pilvenstre" storrelse={18} /></button>
          <span className="tall">{visning === 'uke' ? `Uke ${ukenummer(fra)} · ${kortDag(fra)}–${kortDag(til)}` : maanedNavn(forsteIMnd)}</span>
          <button className="knapp ikon flat liten" onClick={() => flytt(1)} aria-label={visning === 'uke' ? 'Neste uke' : 'Neste måned'}><Ikon navn="pilhoyre" storrelse={18} /></button>
        </div>
        <div className="knapperad" style={{ alignItems: 'center' }}>
          {!visesIdag && <button className="knapp liten" onClick={tilIdag}>I dag</button>}
          <Segment etikett="Visning" verdi={visning} endre={setVisning} valg={[{ verdi: 'uke', tekst: 'Uke' }, { verdi: 'maaned', tekst: 'Måned' }]} />
          <button className="knapp liten flat" onClick={() => setAbonner(true)} title="Vis kalenderen i telefonens kalender"><Ikon navn="mobil" storrelse={16} />Abonner</button>
        </div>
      </div>

      {visning === 'uke' ? (
        <section className="kort kal-uke">
          {dager.map((d) => <DagListe key={d} dato={d} poster={paa(d)} navn={navn} aapne={aapne} nyAvtale={() => setArk({ dato: d })} />)}
        </section>
      ) : (
        <div className="rutenett to-en">
          <section className="kort">
            <div className="kal-maaned" role="grid" aria-label={maanedNavn(forsteIMnd)}>
              {UKEDAGER_KORT.map((u) => <div key={u} className="kal-ukedag" role="columnheader">{u}</div>)}
              {dager.map((d) => {
                const her = paa(d);
                const utenfor = d.slice(0, 7) !== forsteIMnd.slice(0, 7);
                return (
                  <button key={d} role="gridcell" aria-pressed={d === valgt} onClick={() => setValgt(d)}
                    className={`kal-celle${utenfor ? ' utenfor' : ''}${d === idag ? ' i-dag' : ''}`} aria-label={`${dagTittel(d)}: ${her.length} avtaler`}>
                    <span className="kal-nr">{Number(d.slice(8))}</span>
                    <span className="kal-biter">
                      {her.slice(0, 3).map((p) => <span key={p.nokkel} className="kal-bit" style={{ ['--farge' as string]: `var(--k${p.farge})` }}>{p.fra ? `${p.fra} ` : ''}{p.tittel}</span>)}
                      {her.length > 3 && <span className="kal-flere">+{her.length - 3}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="kort">
            <DagListe dato={valgt} poster={paa(valgt)} navn={navn} aapne={aapne} nyAvtale={() => setArk({ dato: valgt })} />
          </section>
        </div>
      )}

      <div className="forklaring" aria-label="Fargeforklaring">
        {(Object.keys(KATEGORIER) as KalenderKategori[]).map((k) => <span key={k}><span className="prikk" style={{ background: `var(--k${KATEGORIER[k].farge})` }} />{KATEGORIER[k].navn}</span>)}
        <span><span className="prikk" style={{ background: 'var(--k0)' }} />Bursdager</span>
        <span><span className="prikk" style={{ background: 'var(--k3)' }} />Frister</span>
      </div>

      <button className="fab" onClick={() => setArk({ dato: nyDato })}><Ikon navn="pluss" storrelse={22} />Ny avtale</button>
      {ark && <AvtaleArk post={ark.post} startDato={ark.dato} lukk={() => setArk(null)} />}
      {abonner && <AbonnerArk lukk={() => setAbonner(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- Ny/endre avtale

type GjentakValg = 'ingen' | 'dag' | 'hverdager' | 'uke' | 'uke2' | 'maaned' | 'aar';

function gjentakValg(g?: Gjentak): GjentakValg {
  if (!g) return 'ingen';
  if (g.frekvens === 'uke') {
    if ((g.intervall || 1) === 2) return 'uke2';
    return [...(g.ukedager ?? [])].sort().join() === '1,2,3,4,5' ? 'hverdager' : 'uke';
  }
  return g.frekvens === 'dag' ? 'dag' : g.frekvens === 'maaned' ? 'maaned' : 'aar';
}

function tilGjentak(v: GjentakValg, dato: string, ukedager: number[], til?: string): Gjentak | undefined {
  const t = til || undefined;
  switch (v) {
    case 'ingen': return undefined;
    case 'dag': return { frekvens: 'dag', intervall: 1, til: t };
    case 'hverdager': return { frekvens: 'uke', intervall: 1, ukedager: [1, 2, 3, 4, 5], til: t };
    case 'uke': case 'uke2': return { frekvens: 'uke', intervall: v === 'uke2' ? 2 : 1, ukedager: ukedager.length ? ukedager : [ukedag(dato)], til: t };
    case 'maaned': return { frekvens: 'maaned', intervall: 1, til: t };
    case 'aar': return { frekvens: 'aar', intervall: 1, til: t };
  }
}

const VARSEL_VALG: [string, string][] = [['', 'Ingen'], ['15', '15 min før'], ['30', '30 min før'], ['60', '1 time før'], ['120', '2 timer før'], ['1440', 'Dagen før']];

function AvtaleArk({ post, startDato, lukk }: { post?: KalenderPost; startDato: string; lukk: () => void }) {
  const { hendelser } = useKalender();
  const { visToast } = useTilstand();
  const { voksne, barn } = useFolk();
  const f = post?.forekomst;
  const h = f?.hendelse;
  const [tittel, setTittel] = useState(h?.tittel ?? '');
  const [kategori, setKategori] = useState<KalenderKategori>(h?.kategori ?? 'annet');
  const [dato, setDato] = useState(f?.dato ?? startDato);
  const [heldag, setHeldag] = useState(h ? !h.fra : false);
  const [fra, setFra] = useState(h?.fra ?? '16:00');
  const [til, setTil] = useState(h?.til ?? '');
  const [sluttDato, setSluttDato] = useState(h?.sluttDato ?? '');
  const [gjentak, setGjentak] = useState<GjentakValg>(gjentakValg(h?.gjentak));
  const [ukedager, setUkedager] = useState<number[]>(h?.gjentak?.ukedager ?? [ukedag(f?.dato ?? startDato)]);
  const [gjentakTil, setGjentakTil] = useState(h?.gjentak?.til ?? '');
  const [hvem, setHvem] = useState<string[]>(h?.hvem ?? []);
  const [ansvarlig, setAnsvarlig] = useState(h?.ansvarlig ?? '');
  const [sted, setSted] = useState(h?.sted ?? '');
  const [notat, setNotat] = useState(h?.notat ?? '');
  const [varsel, setVarsel] = useState(h?.varselMin ? String(h.varselMin) : '');
  const [modus, setModus] = useState<'lagre' | 'slett' | null>(null);
  const [bekreft, setBekreft] = useState(false);
  const erSerie = !!f?.serie.gjentak;

  const avtale = (): Avtale => ({
    tittel: tittel.trim(), kategori, dato,
    fra: heldag ? undefined : fra || undefined,
    til: heldag ? undefined : til || undefined,
    sluttDato: heldag && sluttDato > dato ? sluttDato : undefined,
    gjentak: tilGjentak(gjentak, dato, ukedager, gjentakTil),
    hvem, ansvarlig: ansvarlig || undefined, sted: sted.trim() || undefined, notat: notat.trim() || undefined,
    varselMin: !heldag && varsel ? Number(varsel) : undefined,
  });

  async function utfor(handling: 'lagre' | 'slett', m: Modus) {
    const foer = hendelser;
    const endring = handling === 'lagre'
      ? (f ? endreForekomst(hendelser, f, avtale(), m) : { lagre: [{ ...avtale(), id: nyId() }], slett: [] })
      : slettForekomst(hendelser, f!, m);
    lukk();
    const ok = await endreKalender(endring);
    if (ok && handling === 'slett') {
      visToast({ tekst: m === 'denne' && erSerie ? `«${tittel}» avlyst denne dagen` : `Slettet «${tittel}»`, angre: () => { void endreKalender(angreEndring(foer, endring)); visToast(null); } });
    }
  }

  function send(e: FormEvent) {
    e.preventDefault();
    if (!tittel.trim()) return;
    if (erSerie) setModus('lagre');
    else void utfor('lagre', 'alle');
  }

  const veksle = (liste: string[], id: string) => (liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id]);

  return (
    <Ark tittel={f ? 'Endre avtale' : 'Ny avtale'} lukk={lukk}>
      <form className="skjema" onSubmit={send}>
        {erSerie && (
          <div className="banner info">
            <Ikon navn="revisjon" />
            <div>Gjentas: {gjentakTekst(f!.serie.gjentak, f!.serie.dato).toLowerCase()}. {f!.unntak ? 'Denne dagen er endret fra serien.' : 'Du velger om endringen gjelder bare denne dagen eller flere når du lagrer.'}</div>
          </div>
        )}
        <Felt etikett="Hva"><input value={tittel} onChange={(e) => setTittel(e.target.value)} required placeholder="F.eks. Henting barnehagen" autoFocus={!f} /></Felt>

        <div className="felt">
          <span>Kategori</span>
          <div className="valgchips" role="radiogroup" aria-label="Kategori">
            {(Object.keys(KATEGORIER) as KalenderKategori[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={k === kategori} onClick={() => setKategori(k)}>
                <span className="prikk" style={{ background: `var(--k${KATEGORIER[k].farge})` }} />{KATEGORIER[k].navn}
              </button>
            ))}
          </div>
        </div>

        <label className="rad" style={{ cursor: 'pointer', minHeight: 44, borderBottom: 0 }}>
          <span className="hoved"><span className="navn">Hele dagen</span></span>
          <input type="checkbox" className="bryter" checked={heldag} onChange={(e) => setHeldag(e.target.checked)} />
        </label>
        <div className="felt-rad">
          <Felt etikett="Dato"><input type="date" value={dato} onChange={(e) => setDato(e.target.value)} required /></Felt>
          {heldag && <Felt etikett="Til og med (valgfritt)"><input type="date" value={sluttDato} min={dato} onChange={(e) => setSluttDato(e.target.value)} /></Felt>}
        </div>
        {!heldag && (
          <div className="felt-rad">
            <Felt etikett="Fra"><input type="time" value={fra} onChange={(e) => setFra(e.target.value)} required /></Felt>
            <Felt etikett="Til (valgfritt)"><input type="time" value={til} onChange={(e) => setTil(e.target.value)} /></Felt>
          </div>
        )}

        <div className="felt-rad">
          <Felt etikett="Gjentas">
            <select value={gjentak} onChange={(e) => setGjentak(e.target.value as GjentakValg)}>
              <option value="ingen">Gjentas ikke</option>
              <option value="hverdager">Hverdager</option>
              <option value="dag">Hver dag</option>
              <option value="uke">Hver uke</option>
              <option value="uke2">Annenhver uke</option>
              <option value="maaned">Hver måned</option>
              <option value="aar">Hvert år</option>
            </select>
          </Felt>
          {gjentak !== 'ingen' && <Felt etikett="Til og med (valgfritt)"><input type="date" value={gjentakTil} min={dato} onChange={(e) => setGjentakTil(e.target.value)} /></Felt>}
        </div>
        {(gjentak === 'uke' || gjentak === 'uke2') && (
          <div className="valgchips ukedag-valg" role="group" aria-label="Ukedager">
            {UKEDAGER_KORT.map((u, i) => (
              <button key={u} type="button" role="checkbox" aria-checked={ukedager.includes(i + 1)}
                onClick={() => { const ny = veksle(ukedager.map(String), String(i + 1)).map(Number); if (ny.length) setUkedager(ny.sort()); }}>{u}</button>
            ))}
          </div>
        )}

        {(voksne.length > 0 || barn.length > 0) && (
          <div className="felt">
            <span>Gjelder</span>
            <div className="valgchips" role="group" aria-label="Hvem avtalen gjelder">
              {[...voksne, ...barn].map((p) => (
                <button key={p.id} type="button" role="checkbox" aria-checked={hvem.includes(p.id)} onClick={() => setHvem(veksle(hvem, p.id))}>
                  {hvem.includes(p.id) && <Ikon navn="sjekk" storrelse={14} />}{p.navn}
                </button>
              ))}
            </div>
            {barn.length === 0 && <small>Legg til barna under Oppsett → Personer, så kan du velge dem her.</small>}
          </div>
        )}
        {voksne.length > 0 && (
          <div className="felt">
            <span>Henter, leverer eller følger</span>
            <div className="valgchips" role="radiogroup" aria-label="Hvem henter eller leverer">
              <button type="button" role="radio" aria-checked={!ansvarlig} onClick={() => setAnsvarlig('')}>Ingen</button>
              {voksne.map((p) => <button key={p.id} type="button" role="radio" aria-checked={ansvarlig === p.id} onClick={() => setAnsvarlig(p.id)}>🚗 {p.navn}</button>)}
            </div>
          </div>
        )}

        <Felt etikett="Sted (valgfritt)"><input value={sted} onChange={(e) => setSted(e.target.value)} placeholder="F.eks. Barnehagen" /></Felt>
        {!heldag && (
          <Felt etikett="Varsel" hjelp="Kommer som varsel på telefonen til den/de avtalen gjelder.">
            <select value={varsel} onChange={(e) => setVarsel(e.target.value)}>
              {VARSEL_VALG.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </Felt>
        )}
        <Felt etikett="Notat (valgfritt)"><textarea value={notat} onChange={(e) => setNotat(e.target.value)} /></Felt>

        {modus ? (
          <div className="modus-valg" role="group" aria-label="Hvilke dager">
            <p><strong>{modus === 'lagre' ? 'Endre' : 'Slette'} «{tittel}»</strong> – gjelder det</p>
            <button type="button" className="knapp primar full" onClick={() => void utfor(modus, 'denne')}>Bare {kortDag(f!.originalDato)}</button>
            <button type="button" className="knapp full" onClick={() => void utfor(modus, 'fremover')}>{kortDag(f!.originalDato)} og alle senere</button>
            <button type="button" className={`knapp full${modus === 'slett' ? ' fare' : ''}`} onClick={() => void utfor(modus, 'alle')}>Hele serien</button>
            <button type="button" className="knapp flat full" onClick={() => setModus(null)}>Avbryt</button>
          </div>
        ) : (
          <div className="knapperad slutt">
            {f && (erSerie
              ? <button type="button" className="knapp flat fare dytt" onClick={() => setModus('slett')}><Ikon navn="slett" storrelse={18} />Slett</button>
              : bekreft
                ? <button type="button" className="knapp fare dytt" onClick={() => void utfor('slett', 'alle')}><Ikon navn="slett" storrelse={18} />Bekreft sletting</button>
                : <button type="button" className="knapp flat fare dytt" onClick={() => setBekreft(true)}><Ikon navn="slett" storrelse={18} />Slett</button>)}
            <button type="button" className="knapp" onClick={lukk}>Avbryt</button>
            <button type="submit" className="knapp primar" disabled={!tittel.trim()}>Lagre</button>
          </div>
        )}
      </form>
    </Ark>
  );
}

// ---------------------------------------------------------------- Abonnement i telefonens kalender

function AbonnerArk({ lukk }: { lukk: () => void }) {
  const { felles, endreFelles, visToast } = useTilstand();
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const nokkel = felles?.kalenderNokkel;
  const https = url && nokkel ? `${url}/functions/v1/kalender?n=${nokkel}` : null;
  const webcal = https?.replace(/^https:/, 'webcal:');

  async function kopier() {
    if (!https) return;
    try { await navigator.clipboard.writeText(https); visToast({ tekst: 'Lenken er kopiert' }); } catch { visToast({ tekst: 'Kunne ikke kopiere' }); }
  }

  return (
    <Ark tittel="Vis i telefonens kalender" lukk={lukk}>
      <div className="skjema">
        <p className="dempet liten">Telefonens kalender (iPhone, Google, Outlook) kan abonnere på familiekalenderen. Den viser felles avtaler og bursdager,
          oppdateres av seg selv, og kan bare leses der – endringer gjør dere her i appen.</p>
        {lager.modus === 'lokal' && <div className="banner info"><Ikon navn="info" /><div>I demomodus finnes ingen server, så lenken virker bare i den innloggede appen.</div></div>}
        {!nokkel ? (
          <button className="knapp primar" onClick={() => endreFelles((d) => { d.kalenderNokkel = `${nyId()}${nyId()}`.replace(/-/g, ''); })}>
            <Ikon navn="lenke" storrelse={18} />Lag abonnementslenke
          </button>
        ) : (
          <>
            {webcal && <a className="knapp primar" href={webcal}><Ikon navn="kalender" storrelse={18} />Åpne i kalenderen (iPhone)</a>}
            <button className="knapp" onClick={() => void kopier()} disabled={!https}><Ikon navn="kopi" storrelse={18} />Kopier lenke (Google, Outlook)</button>
            <ul className="dempet liten veiledning">
              <li><strong>iPhone:</strong> trykk «Åpne i kalenderen» → Abonner. Avtalene dukker opp i Kalender-appen.</li>
              <li><strong>Google:</strong> på PC: calendar.google.com → «Andre kalendere» + → «Fra nettadresse» → lim inn lenken. Google oppdaterer bare noen ganger i døgnet.</li>
              <li>Alle som har lenken, kan se avtalene. Lag ny lenke hvis den kommer på avveie.</li>
            </ul>
            <div className="knapperad">
              <button className="knapp flat liten" onClick={() => endreFelles((d) => { d.kalenderNokkel = `${nyId()}${nyId()}`.replace(/-/g, ''); }, 'Ny lenke laget – den gamle virker ikke lenger')}>Lag ny lenke</button>
              <button className="knapp flat fare liten" onClick={() => endreFelles((d) => { delete d.kalenderNokkel; }, 'Abonnementet er slått av')}>Slå av</button>
            </div>
          </>
        )}
      </div>
    </Ark>
  );
}

// ---------------------------------------------------------------- Kort på Oversikt

/**
 * I dag og i morgen vises fullt. Resten av uka bare det som skiller seg ut: enkeltavtaler, bursdager og
 * endrede dager – ikke faste rutiner som henting hver dag (de står i kalenderen).
 */
export function KommendeKort({ gaaTil }: { gaaTil: (r: string) => void }) {
  const { hendelser, lastet } = useKalender();
  const { lister, punkter } = useLister();
  const { navn } = useFolk();
  const idag = iDag();
  const imorgen = leggTilDager(idag, 1);
  const til = leggTilDager(idag, 6);
  const poster = useMemo(() => kalenderPoster(hendelser, lister, punkter, idag, til, { anledninger: true, frister: false }), [hendelser, lister, punkter, idag, til]);
  if (!lastet) return null;

  const senere: { d: string; p: KalenderPost }[] = [];
  for (let d = leggTilDager(idag, 2); d <= til; d = leggTilDager(d, 1)) {
    for (const p of poster) if (paaDato(p, d) && (!p.gjentar || p.endret)) senere.push({ d, p });
  }
  const aapne = (p: KalenderPost) => gaaTil(p.url ? p.url.replace(/^#\//, '') : 'kalender');
  const dag = (d: string, tittel: string) => {
    const her = poster.filter((p) => paaDato(p, d));
    return (
      <div className="kal-mini">
        <div className={`kal-mini-dag${d === idag ? ' i-dag' : ''}`}>{tittel}</div>
        {her.length
          ? <div className="liste">{her.map((p) => <PostRad key={p.nokkel} post={p} navn={navn} aapne={() => aapne(p)} />)}</div>
          : <p className="dempet liten kal-tom">Ingen avtaler</p>}
      </div>
    );
  };

  return (
    <section className="kort">
      <div className="kort-hode">
        <div className="tittel"><h2>Kalender</h2><span className="dempet liten">I dag, i morgen og det som skjer senere i uka</span></div>
        <button className="knapp liten flat" onClick={() => gaaTil('kalender')}>Hele kalenderen<Ikon navn="pilhoyre" storrelse={16} /></button>
      </div>
      {dag(idag, `I dag · ${kortDag(idag)}`)}
      {dag(imorgen, `I morgen · ${kortDag(imorgen)}`)}
      {senere.length > 0 && (
        <div className="kal-mini">
          <div className="kal-mini-dag">Senere denne uka</div>
          <div className="liste">
            {senere.slice(0, 6).map(({ d, p }) => (
              <div key={p.nokkel + d} className="kal-senere">
                <span className="kal-senere-dag">{stor(somDato(d).toLocaleDateString('nb-NO', { weekday: 'short' }))} {Number(d.slice(8))}.</span>
                <PostRad post={p} navn={navn} aapne={() => aapne(p)} />
              </div>
            ))}
          </div>
          {senere.length > 6 && <p className="dempet liten" style={{ padding: '8px 4px 0' }}>+ {senere.length - 6} til i kalenderen</p>}
        </div>
      )}
    </section>
  );
}
