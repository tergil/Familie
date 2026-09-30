// Oppfølging: førte utgifter mot budsjett (per kategori) og månedlig saldokontroll (per konto).
import { useState, type ReactNode } from 'react';
import type { Konto, Post, Saldo, Utgift } from '../data/modell';
import { nyId } from '../data/modell';
import { lager, varsleOppfolgingEndret } from '../data/lager';
import { useOppfolging } from '../data/oppfolging';
import { useTilstand } from '../data/tilstand';
import { iDag, postMnd, sum } from '../logikk/beregning';
import {
  andelGaatt, avstem, flyttMaaned, kategoriStatus, kontoPlan, kontoerFor, maanedAv, muligeDubletter,
  revisjonForMaaned, type Avstemming, type KategoriStatus, type Tempo,
} from '../logikk/oppfolging';
import { Ark, BelopFelt, Ikon, Kpi, Prikk, Segment, Tom, datoTekst, kr, maanedTekst } from '../ui/felles';
import { UtgiftSkjema } from '../ui/UtgiftSkjema';

type Visning = 'felles' | 'privat';

const TEMPO: Record<Tempo, { tekst: string; klasse: string; ikon: string }> = {
  'i-rute': { tekst: 'I rute', klasse: 'bra', ikon: 'sjekk' },
  'over-tempo': { tekst: 'Over tempo', klasse: 'varsel', ikon: 'advarsel' },
  'over-budsjett': { tekst: 'Over budsjett', klasse: 'feil', ikon: 'advarsel' },
  'ikke-budsjettert': { tekst: 'Ikke budsjettert', klasse: '', ikon: 'info' },
};

/** Stolpe for én kategori: brukt mot budsjett, med markør for forventet forbruk så langt */
export function KategoriStolpe({ s, navn, farge, andel }: { s: KategoriStatus; navn: string; farge?: number; andel: number }) {
  // Avsluttet måned: «Innenfor budsjett» i stedet for «I rute»
  const t = s.tempo === 'i-rute' && andel >= 1 ? { ...TEMPO['i-rute'], tekst: 'Innenfor budsjett' } : TEMPO[s.tempo];
  const skala = Math.max(s.budsjett, s.brukt, 1);
  return (
    <div className="kat-stolpe">
      <div className="kat-topp">
        <Prikk farge={farge} />
        <span className="navn">{navn}</span>
        <span className={`merkelapp ${t.klasse}`}><Ikon navn={t.ikon} storrelse={12} />{t.tekst}</span>
      </div>
      <div className="stolpe med-markor" aria-hidden="true">
        <span style={{ width: `${(Math.min(s.brukt, skala) / skala) * 100}%`, background: s.tempo === 'over-budsjett' ? 'var(--feil)' : `var(--k${farge ?? 0})` }} />
        {s.budsjett > 0 && andel > 0 && andel < 1 && <i className="markor" style={{ left: `${((s.budsjett * andel) / skala) * 100}%` }} title="Forventet så langt" />}
      </div>
      <div className="kat-tall">
        <span><strong className="tall">{kr(s.brukt)}</strong>{s.budsjett > 0 && <span className="dempet"> av {kr(s.budsjett)}</span>}</span>
        <span className="dempet tall">{s.budsjett > 0 ? (s.budsjett - s.brukt >= 0 ? `${kr(s.budsjett - s.brukt)} igjen` : `${kr(s.brukt - s.budsjett)} over`) : `${s.antall} ført`}</span>
      </div>
    </div>
  );
}

export function Oppfolging({ visning, byttVisning, maaned: startMaaned }: { visning: Visning; byttVisning: (v: Visning) => void; maaned?: string }) {
  const { felles, privat, meg } = useTilstand();
  const [maaned, setMaaned] = useState(startMaaned && /^\d{4}-\d{2}$/.test(startMaaned) ? startMaaned : maanedAv(iDag()));
  const data = useOppfolging(maaned);
  const [redigerer, setRedigerer] = useState<Utgift | 'ny' | null>(null);
  const [saldoArk, setSaldoArk] = useState(false);
  const [velgPoster, setVelgPoster] = useState(false);
  if (!felles) return null;

  const erPrivat = visning === 'privat';
  if (erPrivat && (!meg || !privat)) return <Tom ikon="privat" tittel="Du er ikke koblet til en person" />;

  const rev = revisjonForMaaned(felles.revisjoner, maaned);
  const prev = privat ? revisjonForMaaned(privat.revisjoner, maaned) : undefined;
  const poster: Post[] = (erPrivat ? prev?.poster : rev?.poster) ?? [];
  const andel = andelGaatt(maaned, iDag());
  const mnd = (u: Utgift) => maanedAv(u.dato) === maaned;
  const synlige = data.utgifter.filter((u) => u.privat === erPrivat);
  const denne = synlige.filter(mnd);
  const status = kategoriStatus(poster, denne, andel);
  const medBudsjett = status.filter((s) => s.budsjett > 0);
  const budsjett = sum(medBudsjett, (s) => s.budsjett);
  const brukt = sum(medBudsjett, (s) => s.brukt);
  const utenBudsjett = sum(status.filter((s) => s.budsjett <= 0), (s) => s.brukt);
  const kontoer = kontoerFor(felles, privat ?? undefined, visning);
  const saldoer = data.saldoer.filter((s) => s.privat === erPrivat);
  const avstemminger = kontoer.map((k) => avstem(k, kontoPlan(k, felles, rev, erPrivat ? privat ?? undefined : undefined, erPrivat ? prev : undefined), saldoer, synlige, maaned));
  const kategori = (id: string) => felles.kategorier.find((k) => k.id === id);
  const kontoNavn = (id: string) => kontoer.find((k) => k.id === id)?.navn ?? 'Ukjent konto';
  const personNavn = (epost: string) => felles.personer.find((p) => p.epost.toLowerCase() === epost.toLowerCase())?.navn ?? epost.split('@')[0];
  const erInnevaerende = maaned === maanedAv(iDag());
  const harFulgte = poster.some((p) => p.folgOpp);
  const medAvvik = avstemminger.filter((a) => a.avvik !== undefined);
  const totaltAvvik = sum(medAvvik, (a) => a.avvik!);

  // Gruppér utgifter per dato, nyeste først
  const perDato = new Map<string, Utgift[]>();
  for (const u of [...denne].sort((a, b) => b.dato.localeCompare(a.dato))) perDato.set(u.dato, [...(perDato.get(u.dato) ?? []), u]);

  const tempoTekst = budsjett <= 0 ? 'Ingen poster følges opp'
    : brukt > budsjett ? `${kr(brukt - budsjett)} over budsjett`
    : erInnevaerende ? `Forventet så langt: ${kr(budsjett * andel)}`
    : `${kr(budsjett - brukt)} under budsjett`;

  return (
    <>
      <div className="verktoylinje">
        <div className="maanedsvelger" role="group" aria-label="Måned">
          <button className="knapp ikon flat liten" onClick={() => setMaaned(flyttMaaned(maaned, -1))} aria-label="Forrige måned"><Ikon navn="pilvenstre" storrelse={18} /></button>
          <span className="tall">{maanedTekst(maaned)}</span>
          <button className="knapp ikon flat liten" onClick={() => setMaaned(flyttMaaned(maaned, 1))} aria-label="Neste måned" disabled={erInnevaerende}><Ikon navn="pilhoyre" storrelse={18} /></button>
        </div>
        {meg && <Segment etikett="Budsjett" verdi={visning} endre={byttVisning} valg={[{ verdi: 'felles', tekst: 'Felles' }, { verdi: 'privat', tekst: 'Privat' }]} />}
      </div>

      {erPrivat && <div className="banner info"><Ikon navn="privat" /><div>Private utgifter og saldoer ser bare du.</div></div>}
      {data.feil && <div className="banner feil" role="alert"><Ikon navn="advarsel" /><div><strong>Kunne ikke hente oppfølgingen.</strong><p className="liten">{data.feil}</p></div></div>}

      {!harFulgte && (
        <div className="banner varsel">
          <Ikon navn="info" />
          <div><strong>Ingen poster følges opp ennå.</strong><p>Velg hvilke poster som varierer fra måned til måned, f.eks. mat. Faste trekk kontrolleres via saldo.</p></div>
          <button className="knapp liten" onClick={() => setVelgPoster(true)}>Velg poster</button>
        </div>
      )}

      <div className="kpi-rad">
        <Kpi hero etikett={`Brukt av variabelt budsjett · ${maanedTekst(maaned).toLowerCase()}`}
          verdi={kr(brukt)} under={budsjett > 0 ? `av ${kr(budsjett)} · ${tempoTekst}` : tempoTekst} />
        <Kpi etikett="Igjen" verdi={kr(Math.max(0, budsjett - brukt))} under={erInnevaerende ? `${Math.round((1 - andel) * 100)} % av måneden igjen` : undefined} />
        <Kpi etikett="Ført" verdi={denne.length} under={utenBudsjett > 0 ? `${kr(utenBudsjett)} utenfor budsjett` : 'utgifter'} />
        <Kpi etikett="Saldoavvik" verdi={medAvvik.length ? kr(totaltAvvik) : '–'}
          under={medAvvik.length
            ? (totaltAvvik >= -0.5 ? <span className="merkelapp bra"><Ikon navn="sjekk" storrelse={12} />Innenfor</span> : <span className="merkelapp feil"><Ikon navn="advarsel" storrelse={12} />Brukt mer</span>)
            : 'Legg inn saldo'} />
      </div>

      <div className="rutenett to">
        <section className="kort">
          <div className="kort-hode">
            <div className="tittel"><h2>Per kategori</h2><span className="dempet liten">Streken viser hvor mye som burde vært brukt nå</span></div>
            <button className="knapp liten flat" onClick={() => setVelgPoster(true)}>Velg poster</button>
          </div>
          {status.length === 0
            ? <Tom ikon="budsjett" tittel="Ingenting å vise" tekst="Før en utgift med +-knappen." />
            : <div className="liste" style={{ gap: 16 }}>{status.map((s) => <KategoriStolpe key={s.kategoriId} s={s} navn={kategori(s.kategoriId)?.navn ?? 'Uten kategori'} farge={kategori(s.kategoriId)?.farge} andel={andel} />)}</div>}
        </section>

        <section className="kort">
          <div className="kort-hode">
            <div className="tittel"><h2>Saldokontroll</h2><span className="dempet liten">Saldo ved utgangen av {maanedTekst(maaned).toLowerCase()}</span></div>
            <button className="knapp primar liten" onClick={() => setSaldoArk(true)}><Ikon navn="rediger" storrelse={16} />Legg inn saldo</button>
          </div>
          {avstemminger.every((a) => a.saldo === undefined) ? (
            <div className="tom" style={{ padding: '16px 8px' }}>
              <Ikon navn="konto" storrelse={32} />
              <strong>Ingen saldoer for {maanedTekst(maaned).toLowerCase()}</strong>
              <p>{erInnevaerende ? 'Legg inn saldoene fra nettbanken ved månedsslutt – det tar et par minutter.' : 'Legg inn saldoene fra nettbanken for å se om kontoene gikk som budsjettert.'}</p>
            </div>
          ) : (
            <div className="liste">
              {avstemminger.map((a) => <AvstemmingRad key={a.konto.id} a={a} />)}
            </div>
          )}
        </section>
      </div>

      <section className="kort">
        <div className="kort-hode">
          <div className="tittel"><h2>Utgifter</h2><span className="dempet liten">{denne.length} ført · {kr(sum(denne, (u) => u.belop))}</span></div>
          <button className="knapp primar liten" onClick={() => setRedigerer('ny')}><Ikon navn="pluss" storrelse={18} />Før utgift</button>
        </div>
        {denne.length === 0 && <Tom ikon="budsjett" tittel="Ingen utgifter ført denne måneden" />}
        {[...perDato].map(([dato, liste]) => (
          <div key={dato}>
            <div className="gruppe-hode"><span className="navn dempet liten">{datoTekst(dato)}</span>{liste.length > 1 && <span className="sum dempet liten">{kr(sum(liste, (u) => u.belop))}</span>}</div>
            <div className="liste">
              {liste.map((u) => {
                const dobbel = muligeDubletter(u, synlige).length > 0;
                return (
                  <button className="rad" key={u.id} onClick={() => setRedigerer(u)}>
                    <Prikk farge={kategori(u.kategoriId)?.farge} />
                    <span className="hoved">
                      <span className="navn">{u.notat || kategori(u.kategoriId)?.navn}</span>
                      <span className="info">{kategori(u.kategoriId)?.navn} · {kontoNavn(u.kontoId)}{!erPrivat && ` · ${personNavn(u.fortAv)}`}</span>
                    </span>
                    {dobbel && <span className="merkelapp varsel"><Ikon navn="kopi" storrelse={12} />Mulig dobbel</span>}
                    <span className="belop">{kr(u.belop)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {redigerer && <UtgiftSkjema utgift={redigerer === 'ny' ? undefined : redigerer} privatStart={erPrivat} lukk={() => setRedigerer(null)} />}
      {saldoArk && <SaldoSkjema maaned={maaned} kontoer={kontoer} saldoer={saldoer} privat={erPrivat} lukk={() => setSaldoArk(false)} />}
      {velgPoster && <VelgPoster visning={visning} maaned={maaned} lukk={() => setVelgPoster(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- Én konto i saldokontrollen

function AvstemmingRad({ a }: { a: Avstemming }) {
  let tekst: ReactNode;
  if (a.saldo === undefined) tekst = <span className="dempet">Ingen saldo lagt inn</span>;
  else if (a.avvik === undefined) tekst = <span className="dempet">Trenger saldo fra forrige måned for å sammenligne</span>;
  else if (Math.abs(a.avvik) < 1) tekst = <span className="merkelapp bra"><Ikon navn="sjekk" storrelse={12} />Som budsjettert</span>;
  else if (a.avvik < 0) tekst = <span className="merkelapp feil"><Ikon navn="advarsel" storrelse={12} />{kr(-a.avvik)} mer brukt</span>;
  else tekst = <span className="merkelapp bra"><Ikon navn="sjekk" storrelse={12} />{kr(a.avvik)} bedre</span>;
  return (
    <div className="rad" style={{ alignItems: 'flex-start', paddingTop: 12, paddingBottom: 12 }}>
      <Ikon navn="konto" storrelse={18} />
      <span className="hoved" style={{ gap: 4 }}>
        <span className="navn">{a.konto.navn}</span>
        <span style={{ fontSize: 12 }}>{tekst}</span>
        {a.ikkeFort !== undefined && Math.abs(a.ikkeFort) >= 1 && (
          <span className="info" style={{ whiteSpace: 'normal' }}>{a.ikkeFort > 0 ? `${kr(a.ikkeFort)} brukt som ikke er ført` : `${kr(-a.ikkeFort)} mer ført enn saldoen viser`}</span>
        )}
      </span>
      <span className="belop">
        {a.saldo !== undefined ? kr(a.saldo) : '–'}
        {a.faktisk !== undefined && <small>{a.faktisk >= 0 ? '+' : ''}{kr(a.faktisk)} (plan {a.forventet >= 0 ? '+' : ''}{kr(a.forventet)})</small>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- Legg inn saldoer for måneden

function SaldoSkjema({ maaned, kontoer, saldoer, privat, lukk }: { maaned: string; kontoer: Konto[]; saldoer: Saldo[]; privat: boolean; lukk: () => void }) {
  const forrige = flyttMaaned(maaned, -1);
  const finn = (kontoId: string, m: string) => saldoer.find((s) => s.kontoId === kontoId && s.maaned === m);
  const [verdier, setVerdier] = useState<Record<string, number | undefined>>(() =>
    Object.fromEntries(kontoer.flatMap((k) => [[`${k.id}|${maaned}`, finn(k.id, maaned)?.belop], [`${k.id}|${forrige}`, finn(k.id, forrige)?.belop]])));
  const [lagrer, setLagrer] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const settVerdi = (nokkel: string, v: number) => setVerdier((x) => ({ ...x, [nokkel]: v }));

  async function lagre() {
    setLagrer(true);
    setFeil(null);
    try {
      for (const [nokkel, belop] of Object.entries(verdier)) {
        if (belop === undefined) continue;
        const [kontoId, m] = nokkel.split('|');
        const finnes = finn(kontoId, m);
        if (finnes && finnes.belop === belop) continue;
        await lager.lagreSaldo({ id: finnes?.id ?? nyId(), kontoId, maaned: m, belop, privat, fortAv: finnes?.fortAv ?? '' });
      }
      varsleOppfolgingEndret();
      lukk();
    } catch (e) {
      setFeil(String((e as { message?: unknown })?.message ?? e));
      setLagrer(false);
    }
  }

  return (
    <Ark tittel={`Saldo – ${maanedTekst(maaned).toLowerCase()}`} lukk={lukk}>
      <form className="skjema" onSubmit={(e) => { e.preventDefault(); void lagre(); }}>
        <p className="dempet liten">Saldo ved utgangen av måneden, fra nettbanken. Første gang trengs også saldoen fra måneden før, så appen har noe å sammenligne med.</p>
        {kontoer.map((k) => {
          const harForrige = finn(k.id, forrige) !== undefined;
          return (
            <div key={k.id} className="saldo-rad">
              <span className="navn">{k.navn}<span className="dempet liten">{k.kontonr}</span></span>
              <div className={harForrige ? '' : 'felt-rad'}>
                {!harForrige && (
                  <label className="felt"><span className="liten">Utgangen av {maanedTekst(forrige).toLowerCase().split(' ')[0]}</span>
                    <BelopFelt verdi={verdier[`${k.id}|${forrige}`] ?? 0} endre={(v) => settVerdi(`${k.id}|${forrige}`, v)} />
                  </label>
                )}
                <label className="felt"><span className="liten">Utgangen av {maanedTekst(maaned).toLowerCase().split(' ')[0]}</span>
                  <BelopFelt verdi={verdier[`${k.id}|${maaned}`] ?? 0} endre={(v) => settVerdi(`${k.id}|${maaned}`, v)} />
                </label>
              </div>
            </div>
          );
        })}
        {feil && <div className="banner feil" role="alert"><Ikon navn="advarsel" /><div><strong>Kunne ikke lagre.</strong><p className="liten">{feil}</p></div></div>}
        <div className="knapperad slutt">
          <button type="button" className="knapp" onClick={lukk}>Avbryt</button>
          <button type="submit" className="knapp primar" disabled={lagrer}>{lagrer ? 'Lagrer …' : 'Lagre'}</button>
        </div>
      </form>
    </Ark>
  );
}

// ---------------------------------------------------------------- Velg hvilke poster som følges opp

function VelgPoster({ visning, maaned, lukk }: { visning: Visning; maaned: string; lukk: () => void }) {
  const { felles, privat, endreFelles, endrePrivat } = useTilstand();
  if (!felles) return null;
  const erPrivat = visning === 'privat';
  const rev = erPrivat ? revisjonForMaaned(privat?.revisjoner ?? [], maaned) : revisjonForMaaned(felles.revisjoner, maaned);
  const kategori = (id: string) => felles.kategorier.find((k) => k.id === id);

  function veksle(postId: string, verdi: boolean) {
    const f = (r: { id: string; poster: Post[] } | undefined) => { const p = r?.poster.find((x) => x.id === postId); if (p) p.folgOpp = verdi; };
    if (erPrivat) endrePrivat((d) => f(d.revisjoner.find((r) => r.id === rev?.id)));
    else endreFelles((d) => f(d.revisjoner.find((r) => r.id === rev?.id)));
  }

  const utgiftsposter = (rev?.poster ?? []).filter((p) => p.type === 'utgift').sort((a, b) => postMnd(b) - postMnd(a));
  return (
    <Ark tittel="Hvilke poster følges opp?" lukk={lukk}>
      <p className="dempet liten" style={{ marginBottom: 12 }}>
        Slå på poster som varierer og som dere fører utgifter på (f.eks. mat, drivstoff). Faste trekk som lån og forsikring
        trenger ikke føres – de kontrolleres via saldo. Gjelder «{rev?.navn}».
      </p>
      <div className="liste">
        {utgiftsposter.map((p) => (
          <label key={p.id} className="rad" style={{ cursor: 'pointer' }}>
            <Prikk farge={kategori(p.kategoriId)?.farge} />
            <span className="hoved"><span className="navn">{p.navn}</span><span className="info">{kategori(p.kategoriId)?.navn} · {kr(postMnd(p))}/mnd</span></span>
            <input type="checkbox" className="bryter" checked={!!p.folgOpp} onChange={(e) => veksle(p.id, e.target.checked)} />
          </label>
        ))}
      </div>
      <div className="knapperad slutt" style={{ marginTop: 16 }}><button className="knapp primar" onClick={lukk}>Ferdig</button></div>
    </Ark>
  );
}

// ---------------------------------------------------------------- Kort på Oversikt

/** Kompakt status for felles- eller privatbudsjettet denne måneden. Vises bare når noe følges opp. */
export function DenneMaanedKort({ gaaTil, visning = 'felles' }: { gaaTil: (r: string) => void; visning?: Visning }) {
  const { felles, privat } = useTilstand();
  const maaned = maanedAv(iDag());
  const data = useOppfolging(maaned);
  if (!felles) return null;
  const erPrivat = visning === 'privat';
  const rev = erPrivat ? revisjonForMaaned(privat?.revisjoner ?? [], maaned) : revisjonForMaaned(felles.revisjoner, maaned);
  const status = kategoriStatus(rev?.poster ?? [], data.utgifter.filter((u) => u.privat === erPrivat && maanedAv(u.dato) === maaned), andelGaatt(maaned, iDag()))
    .filter((s) => s.budsjett > 0);
  if (status.length === 0) return null;
  const kategori = (id: string) => felles.kategorier.find((k) => k.id === id);
  return (
    <section className="kort">
      <div className="kort-hode">
        <div className="tittel"><h2>{maanedTekst(maaned)}</h2><span className="dempet liten">Førte {erPrivat ? 'private' : 'felles'} utgifter mot budsjett</span></div>
        <button className="knapp liten flat" onClick={() => gaaTil(erPrivat ? 'oppfolging/privat' : 'oppfolging')}>Oppfølging<Ikon navn="pilhoyre" storrelse={16} /></button>
      </div>
      <div className="rutenett to" style={{ gap: 16 }}>
        {status.slice(0, 4).map((s) => <KategoriStolpe key={s.kategoriId} s={s} navn={kategori(s.kategoriId)?.navn ?? 'Uten kategori'} farge={kategori(s.kategoriId)?.farge} andel={andelGaatt(maaned, iDag())} />)}
      </div>
    </section>
  );
}
