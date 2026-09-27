// Fellesbudsjettet: poster, overføringer og inntekter for valgt revisjon.
import { useState } from 'react';
import type { Inntekt, Overforing, Post, Revisjon } from '../data/modell';
import { useTilstand } from '../data/tilstand';
import { foreslaOverforinger, oppsummerFelles, tilMnd } from '../logikk/beregning';
import { Ikon, Segment, Tom, kr, pst } from '../ui/felles';
import { PostListe } from '../ui/deler';
import { InntektSkjema, OverforingSkjema, PostSkjema } from '../ui/skjemaer';

type Fane = 'poster' | 'overforinger' | 'inntekter';

export function Budsjett({ fane, byttFane }: { fane: Fane; byttFane: (f: Fane) => void }) {
  const { felles, rev } = useTilstand();
  if (!felles || !rev) return <Tom ikon="budsjett" tittel="Ingen revisjon valgt" />;
  return (
    <>
      <Segment etikett="Visning" full verdi={fane} endre={byttFane}
        valg={[{ verdi: 'poster', tekst: 'Poster' }, { verdi: 'overforinger', tekst: 'Overføringer' }, { verdi: 'inntekter', tekst: 'Inntekter' }]} />
      {fane === 'poster' && <Poster />}
      {fane === 'overforinger' && <Overforinger />}
      {fane === 'inntekter' && <Inntekter />}
    </>
  );
}

/** Endrer valgt revisjon i fellesdokumentet */
function useEndreRev() {
  const { endreFelles, rev } = useTilstand();
  return (endring: (r: Revisjon) => void, angre?: string) =>
    endreFelles((d) => { const r = d.revisjoner.find((x) => x.id === rev!.id); if (r) endring(r); }, angre);
}

// ---------------------------------------------------------------- Poster

function Poster() {
  const { felles, rev } = useTilstand();
  const endreRev = useEndreRev();
  const [grupper, setGrupper] = useState<'kategori' | 'konto'>('kategori');
  const [redigerer, setRedigerer] = useState<Post | 'ny' | null>(null);
  const opp = oppsummerFelles(felles!, rev!);

  return (
    <section className="kort">
      <div className="kort-hode">
        <div className="tittel">
          <h2>Felles poster</h2>
          <span className="dempet liten">{rev!.poster.length} poster · {kr(opp.total)} per måned</span>
        </div>
        <div className="knapperad">
          <Segment etikett="Grupper etter" verdi={grupper} endre={setGrupper}
            valg={[{ verdi: 'kategori', tekst: 'Kategori' }, { verdi: 'konto', tekst: 'Konto' }]} />
          <button className="knapp primar liten" onClick={() => setRedigerer('ny')}><Ikon navn="pluss" storrelse={18} />Ny post</button>
        </div>
      </div>
      <PostListe
        poster={rev!.poster} kategorier={felles!.kategorier} kontoer={felles!.kontoer} banker={felles!.banker}
        grupper={grupper} velg={setRedigerer}
        tomTekst={<Tom ikon="budsjett" tittel="Ingen poster ennå" tekst="Legg til faste kostnader som husleie, strøm og forsikring." />}
      />
      {redigerer && (
        <PostSkjema
          post={redigerer === 'ny' ? undefined : redigerer}
          kategorier={felles!.kategorier} kontoer={felles!.kontoer} banker={felles!.banker}
          lukk={() => setRedigerer(null)}
          lagre={(p) => {
            endreRev((r) => { const i = r.poster.findIndex((x) => x.id === p.id); if (i >= 0) r.poster[i] = p; else r.poster.push(p); });
            setRedigerer(null);
          }}
          slett={redigerer === 'ny' ? undefined : () => {
            endreRev((r) => { r.poster = r.poster.filter((x) => x.id !== (redigerer as Post).id); }, `Slettet «${redigerer.navn}»`);
            setRedigerer(null);
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Overføringer

function Overforinger() {
  const { felles, rev } = useTilstand();
  const endreRev = useEndreRev();
  const [redigerer, setRedigerer] = useState<Overforing | 'ny' | null>(null);
  const dok = felles!;
  const r = rev!;
  const opp = oppsummerFelles(dok, r);
  const konto = (id: string) => dok.kontoer.find((k) => k.id === id);
  const avsendere = dok.kontoer.filter((k) => k.rolle === 'avsender');

  return (
    <>
      <section className="kort">
        <div className="kort-hode">
          <div className="tittel">
            <h2>Månedlige overføringer</h2>
            <span className="dempet liten">Rundes opp til nærmeste {kr(r.avrundingSteg)}</span>
          </div>
          <div className="knapperad">
            <button className="knapp liten" onClick={() => endreRev((x) => { x.overforinger = foreslaOverforinger(dok, x); }, 'Overføringene er erstattet med forslaget')}>
              <Ikon navn="overforing" storrelse={18} />Foreslå runde beløp
            </button>
            <button className="knapp primar liten" onClick={() => setRedigerer('ny')} disabled={avsendere.length === 0}>
              <Ikon navn="pluss" storrelse={18} />Ny
            </button>
          </div>
        </div>

        {avsendere.length === 0 && (
          <div className="banner info"><Ikon navn="info" /><div>Legg til en <strong>lønnskonto</strong> per person under Kontoer for å sette opp overføringer.</div></div>
        )}

        {opp.personer.map((p) => {
          const mine = r.overforinger.filter((o) => konto(o.fraKontoId)?.eierId === p.person.id);
          const ok = Math.abs(p.avvik) < 0.5;
          return (
            <div key={p.person.id} style={{ marginTop: 8 }}>
              <div className="gruppe-hode">
                <span className="navn">{p.person.navn} <span className="dempet liten" style={{ fontWeight: 400 }}>· {pst(p.andel)}</span></span>
                <span className={`merkelapp ${ok ? 'bra' : 'varsel'}`}>
                  <Ikon navn={ok ? 'sjekk' : 'advarsel'} storrelse={12} />
                  {ok ? 'Stemmer' : p.avvik > 0 ? `${kr(p.avvik)} over mål` : `${kr(-p.avvik)} under mål`}
                </span>
              </div>
              <div className="liste">
                {mine.map((o) => (
                  <button className="rad" key={o.id} onClick={() => setRedigerer(o)}>
                    <Ikon navn="overforing" storrelse={18} />
                    <span className="hoved">
                      <span className="navn">{konto(o.tilKontoId)?.navn ?? 'Ukjent konto'}</span>
                      <span className="info">Fra {konto(o.fraKontoId)?.navn} · {konto(o.tilKontoId)?.kontonr}</span>
                    </span>
                    <span className="belop">{kr(o.belop)}</span>
                  </button>
                ))}
                {mine.length === 0 && <p className="dempet liten" style={{ padding: '8px 4px' }}>Ingen overføringer.</p>}
              </div>
              <div className="gruppe-hode" style={{ paddingTop: 4 }}>
                <span className="navn dempet liten">Mål {kr(p.maal)}</span>
                <span className="sum">{kr(p.overfort)}</span>
              </div>
            </div>
          );
        })}
      </section>

      <section className="kort">
        <div className="kort-hode"><div className="tittel"><h2>Status per konto</h2><span className="dempet liten">Kroner per måned. Behov = postene som trekkes fra kontoen.</span></div></div>
        <div className="tabell-rull">
          <table className="tabell">
            <thead><tr><th>Konto</th><th className="h">Behov</th><th className="h">Inn</th><th className="h">Balanse</th></tr></thead>
            <tbody>
              {opp.kontoer.map((k) => (
                <tr key={k.konto.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{k.konto.navn}</div>
                    <div className="dempet liten">{dok.banker.find((b) => b.id === k.konto.bankId)?.navn} {k.konto.kontonr}</div>
                  </td>
                  <td className="h">{kr(k.behov, false)}</td>
                  <td className="h">{kr(k.overfortInn + k.inntektInn, false)}</td>
                  <td className="h">
                    {Math.abs(k.balanse) < 0.5 ? <span className="dempet">0</span>
                      : k.balanse > 0 ? <span className="merkelapp bra">+{kr(k.balanse, false)}</span>
                      : <span className="merkelapp feil"><Ikon navn="advarsel" storrelse={12} />{kr(k.balanse, false)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Sum (kr)</td><td className="h">{kr(opp.total, false)}</td><td className="h">{kr(opp.overfortTotalt + opp.kontoer.reduce((s, k) => s + k.inntektInn, 0), false)}</td><td className="h">{kr(opp.buffer, false)}</td></tr>
            </tfoot>
          </table>
        </div>
        <div className="felt" style={{ marginTop: 16, maxWidth: 280 }}>
          <span>Avrund overføringer opp til nærmeste</span>
          <select value={r.avrundingSteg} onChange={(e) => endreRev((x) => { x.avrundingSteg = Number(e.target.value); })}>
            {[1, 10, 50, 100, 250, 500, 1000].map((s) => <option key={s} value={s}>{kr(s)}</option>)}
          </select>
        </div>
      </section>

      {redigerer && (
        <OverforingSkjema
          overforing={redigerer === 'ny' ? undefined : redigerer}
          kontoer={dok.kontoer} banker={dok.banker}
          lukk={() => setRedigerer(null)}
          lagre={(o) => {
            endreRev((x) => { const i = x.overforinger.findIndex((y) => y.id === o.id); if (i >= 0) x.overforinger[i] = o; else x.overforinger.push(o); });
            setRedigerer(null);
          }}
          slett={redigerer === 'ny' ? undefined : () => {
            endreRev((x) => { x.overforinger = x.overforinger.filter((y) => y.id !== (redigerer as Overforing).id); }, 'Overføring slettet');
            setRedigerer(null);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Inntekter

function Inntekter() {
  const { felles, rev } = useTilstand();
  const endreRev = useEndreRev();
  const [redigerer, setRedigerer] = useState<Inntekt | 'ny' | null>(null);
  const dok = felles!;
  const total = rev!.inntekter.reduce((s, i) => s + tilMnd(i.belop, i.frekvens), 0);

  return (
    <section className="kort">
      <div className="kort-hode">
        <div className="tittel"><h2>Inntekter</h2><span className="dempet liten">Netto, synlig for begge · {kr(total)} per måned</span></div>
        <button className="knapp primar liten" onClick={() => setRedigerer('ny')}><Ikon navn="pluss" storrelse={18} />Ny inntekt</button>
      </div>
      <div className="liste">
        {rev!.inntekter.map((i) => (
          <button className="rad" key={i.id} onClick={() => setRedigerer(i)}>
            <Ikon navn="inntekt" storrelse={18} />
            <span className="hoved">
              <span className="navn">{i.navn}</span>
              <span className="info">{dok.personer.find((p) => p.id === i.personId)?.navn ?? 'Ingen person'} → {dok.kontoer.find((k) => k.id === i.tilKontoId)?.navn}</span>
            </span>
            <span className="belop">{kr(tilMnd(i.belop, i.frekvens))}</span>
          </button>
        ))}
        {rev!.inntekter.length === 0 && <Tom ikon="inntekt" tittel="Ingen inntekter ennå" />}
      </div>
      {redigerer && (
        <InntektSkjema
          inntekt={redigerer === 'ny' ? undefined : redigerer}
          personer={dok.personer} kontoer={dok.kontoer} banker={dok.banker}
          lukk={() => setRedigerer(null)}
          lagre={(inn) => {
            endreRev((x) => { const i = x.inntekter.findIndex((y) => y.id === inn.id); if (i >= 0) x.inntekter[i] = inn; else x.inntekter.push(inn); });
            setRedigerer(null);
          }}
          slett={redigerer === 'ny' ? undefined : () => {
            endreRev((x) => { x.inntekter = x.inntekter.filter((y) => y.id !== (redigerer as Inntekt).id); }, `Slettet «${redigerer.navn}»`);
            setRedigerer(null);
          }}
        />
      )}
    </section>
  );
}
