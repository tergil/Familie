// Forsiden: de viktigste tallene øverst, så hvem som betaler hva, pengeflyten og endringer.
// Prinsipp: oversikt først, detaljer ved behov (Shneiderman), 3–4 nøkkeltall på mobil (Few).
import { useTilstand } from '../data/tilstand';
import { oppsummerFelles, sammenlign, sorterRevisjoner } from '../logikk/beregning';
import { fellesFlyt } from '../logikk/flyt';
import { Endring, Ikon, Kpi, Prikk, Tom, kr, pst } from '../ui/felles';
import { FlytKort } from '../ui/deler';

export function Oversikt({ gaaTil }: { gaaTil: (rute: string) => void }) {
  const { felles, rev } = useTilstand();
  if (!felles || !rev) {
    return (
      <Tom ikon="budsjett" tittel="Ingen budsjett ennå" tekst="Importer fra Excel-filen eller start med et tomt budsjett.">
        <button className="knapp primar" onClick={() => gaaTil('data')}>Kom i gang</button>
      </Tom>
    );
  }
  const opp = oppsummerFelles(felles, rev);
  const sortert = sorterRevisjoner(felles.revisjoner);
  const forrige = sortert[sortert.findIndex((r) => r.id === rev.id) + 1];
  const forrigeOpp = forrige ? oppsummerFelles(felles, forrige) : undefined;
  const endringer = forrige ? sammenlign(forrige, rev).filter((d) => d.endring !== 'lik') : [];
  const kategori = (id: string) => felles.kategorier.find((k) => k.id === id);
  const maksKat = Math.max(1, ...opp.kategorier.map((k) => k.belop));
  const underdekning = opp.kontoer.filter((k) => k.balanse < -0.5);
  const spareandel = opp.total > 0 ? (opp.sparing / opp.total) * 100 : 0;

  return (
    <>
      {underdekning.length > 0 && (
        <div className="banner varsel" role="status">
          <Ikon navn="advarsel" />
          <div>
            <strong>{underdekning.length === 1 ? 'Én konto' : `${underdekning.length} kontoer`} får for lite</strong>
            <p>{underdekning.map((k) => `${k.konto.navn} mangler ${kr(-k.balanse)}`).join(' · ')}</p>
          </div>
          <button className="knapp liten" onClick={() => gaaTil('budsjett/overforinger')}>Fiks</button>
        </div>
      )}

      <div className="kpi-rad">
        <Kpi hero etikett="Felleskostnader per måned" verdi={kr(opp.total)}
          under={forrigeOpp ? <><Endring diff={opp.total - forrigeOpp.total} /> fra forrige revisjon</> : `${kr(opp.total * 12)} i året`} />
        <Kpi etikett="Utgifter" verdi={kr(opp.utgifter)}
          under={forrigeOpp ? <Endring diff={opp.utgifter - forrigeOpp.utgifter} /> : undefined} />
        <Kpi etikett="Sparing og avdrag" verdi={kr(opp.sparing)} under={`${pst(spareandel)} av felles`} />
        <Kpi etikett="Buffer etter avrunding" verdi={kr(opp.buffer)}
          under={opp.buffer >= 0
            ? <span className="merkelapp bra"><Ikon navn="sjekk" storrelse={12} />Dekket</span>
            : <span className="merkelapp feil"><Ikon navn="advarsel" storrelse={12} />Mangler</span>} />
      </div>

      <div className="rutenett to-en">
        <FlytKort
          tittel="Pengeflyt"
          undertittel="Per måned"
          lagFlyt={(d) => fellesFlyt(felles, rev, d)}
          poster={rev.poster}
          kategorier={felles.kategorier}
        />

        <div className="rutenett" style={{ alignContent: 'start' }}>
          <section className="kort">
            <div className="kort-hode">
              <div className="tittel"><h2>Hvem betaler hva</h2><span className="dempet liten">Fordeling {opp.personer.map((p) => p.andel).join(' / ')}</span></div>
              <button className="knapp liten flat" onClick={() => gaaTil('budsjett/overforinger')}>Detaljer<Ikon navn="pilhoyre" storrelse={16} /></button>
            </div>
            <div className="stabel" aria-hidden="true" style={{ marginBottom: 16 }}>
              {opp.personer.map((p, i) => (
                <span key={p.person.id} style={{ flex: Math.max(p.overfort, 1), background: i === 0 ? 'var(--blekk-2)' : 'var(--noytral-flyt)' }} />
              ))}
            </div>
            <div className="liste">
              {opp.personer.map((p, i) => (
                <div className="rad" key={p.person.id}>
                  <span className="prikk" style={{ background: i === 0 ? 'var(--blekk-2)' : 'var(--noytral-flyt)' }} />
                  <span className="hoved">
                    <span className="navn">{p.person.navn}</span>
                    <span className="info">{pst(p.andel)} · mål {kr(p.maal)}</span>
                  </span>
                  <span className="belop">
                    {kr(p.overfort)}
                    <small>
                      {Math.abs(p.avvik) < 0.5 ? 'Stemmer' : p.avvik > 0 ? `${kr(p.avvik)} over` : `${kr(-p.avvik)} under`}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="kort">
            <div className="kort-hode"><h2>Per kategori</h2></div>
            <div className="liste" style={{ gap: 12 }}>
              {opp.kategorier.map((k) => {
                const kat = kategori(k.kategoriId);
                return (
                  <div key={k.kategoriId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Prikk farge={kat?.farge} />
                      <span style={{ flex: 1, fontWeight: 500 }}>{kat?.navn ?? 'Uten kategori'}</span>
                      <span className="tall dempet liten">{pst((k.belop / opp.total) * 100)}</span>
                      <span className="tall" style={{ fontWeight: 600, minWidth: 84, textAlign: 'right' }}>{kr(k.belop)}</span>
                    </div>
                    <div className="stolpe"><span style={{ width: `${(k.belop / maksKat) * 100}%`, background: `var(--k${kat?.farge ?? 0})` }} /></div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {forrige && endringer.length > 0 && (
        <section className="kort">
          <div className="kort-hode">
            <div className="tittel"><h2>Endret siden {forrige.navn.toLowerCase()}</h2><span className="dempet liten">{endringer.length} endringer</span></div>
            <button className="knapp liten flat" onClick={() => gaaTil('revisjoner')}>Sammenlign<Ikon navn="pilhoyre" storrelse={16} /></button>
          </div>
          <div className="liste">
            {endringer.slice(0, 5).map((d) => (
              <div className="rad" key={d.id}>
                <Prikk farge={kategori(d.kategoriId)?.farge} />
                <span className="hoved">
                  <span className={`navn${d.endring === 'fjernet' ? ' diff-fjernet' : ''}`}>{d.navn}</span>
                  <span className="info">{d.endring === 'ny' ? 'Ny post' : d.endring === 'fjernet' ? 'Fjernet' : `${kr(d.for)} → ${kr(d.etter)}`}</span>
                </span>
                <span className="belop"><Endring diff={d.etter - d.for} /></span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
