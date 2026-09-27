// Revisjoner av fellesbudsjettet: liste, ny (kopi), rediger og sammenligning.
import { useState } from 'react';
import type { Revisjon } from '../data/modell';
import { useTilstand } from '../data/tilstand';
import { aktivRevisjon, iDag, kopierRevisjon, oppsummerFelles, sammenlign, sorterRevisjoner } from '../logikk/beregning';
import { Endring, Ikon, Prikk, datoTekst, kr } from '../ui/felles';
import { RevisjonSkjema } from '../ui/skjemaer';

export function Revisjoner({ gaaTil }: { gaaTil: (r: string) => void }) {
  const { felles, rev, velgRev, endreFelles } = useTilstand();
  const [redigerer, setRedigerer] = useState<Revisjon | 'ny' | null>(null);
  const sortert = felles ? sorterRevisjoner(felles.revisjoner) : [];
  const [fraId, setFraId] = useState(sortert[1]?.id ?? sortert[0]?.id ?? '');
  const [tilId, setTilId] = useState(sortert[0]?.id ?? '');
  if (!felles) return null;

  const gjeldende = aktivRevisjon(felles.revisjoner, iDag());
  const fra = felles.revisjoner.find((r) => r.id === fraId);
  const til = felles.revisjoner.find((r) => r.id === tilId);
  const diff = fra && til ? sammenlign(fra, til) : [];
  const endret = diff.filter((d) => d.endring !== 'lik');
  const oppFra = fra && oppsummerFelles(felles, fra);
  const oppTil = til && oppsummerFelles(felles, til);
  const kategori = (id: string) => felles.kategorier.find((k) => k.id === id);

  return (
    <>
      <section className="kort">
        <div className="kort-hode">
          <div className="tittel"><h2>Revisjoner</h2><span className="dempet liten">Budsjettet revideres typisk to ganger i året</span></div>
          <button className="knapp primar liten" onClick={() => setRedigerer('ny')} disabled={!rev}><Ikon navn="kopi" storrelse={18} />Ny revisjon</button>
        </div>
        <div className="liste">
          {sortert.map((r) => {
            const o = oppsummerFelles(felles, r);
            return (
              <div className="rad" key={r.id}>
                <span className="hoved">
                  <span className="navn">{r.navn} {r.id === gjeldende?.id && <span className="merkelapp bra" style={{ marginLeft: 6 }}>Gjelder nå</span>}{r.id === rev?.id && r.id !== gjeldende?.id && <span className="merkelapp aksent" style={{ marginLeft: 6 }}>Vises</span>}</span>
                  <span className="info">Fra {datoTekst(r.gjelderFra)} · {kr(o.total)}/mnd{r.notat ? ` · ${r.notat}` : ''}</span>
                </span>
                <button className="knapp liten flat" onClick={() => { velgRev(r.id); gaaTil('oversikt'); }}>Vis</button>
                <button className="knapp liten flat ikon" onClick={() => setRedigerer(r)} aria-label={`Endre ${r.navn}`}><Ikon navn="rediger" storrelse={18} /></button>
              </div>
            );
          })}
        </div>
      </section>

      {sortert.length > 1 && (
        <section className="kort">
          <div className="kort-hode"><h2>Sammenlign</h2></div>
          <div className="felt-rad" style={{ marginBottom: 16 }}>
            <label className="felt"><span>Fra</span>
              <select value={fraId} onChange={(e) => setFraId(e.target.value)}>{sortert.map((r) => <option key={r.id} value={r.id}>{r.navn}</option>)}</select>
            </label>
            <label className="felt"><span>Til</span>
              <select value={tilId} onChange={(e) => setTilId(e.target.value)}>{sortert.map((r) => <option key={r.id} value={r.id}>{r.navn}</option>)}</select>
            </label>
          </div>
          {oppFra && oppTil && (
            <div className="kpi-rad" style={{ marginBottom: 16 }}>
              <div className="kpi"><span className="etikett">Totalt per måned</span><span className="verdi">{kr(oppTil.total)}</span><span className="under"><Endring diff={oppTil.total - oppFra.total} /></span></div>
              <div className="kpi"><span className="etikett">Utgifter</span><span className="verdi">{kr(oppTil.utgifter)}</span><span className="under"><Endring diff={oppTil.utgifter - oppFra.utgifter} /></span></div>
              <div className="kpi"><span className="etikett">Sparing</span><span className="verdi">{kr(oppTil.sparing)}</span><span className="under"><Endring diff={oppTil.sparing - oppFra.sparing} invertert /></span></div>
              <div className="kpi"><span className="etikett">Per år</span><span className="verdi">{kr(oppTil.total * 12)}</span><span className="under"><Endring diff={(oppTil.total - oppFra.total) * 12} /></span></div>
            </div>
          )}
          {endret.length === 0 ? <p className="dempet">Ingen forskjeller i postene.</p> : (
            <div className="tabell-rull">
              <table className="tabell">
                <thead><tr><th>Post</th><th className="h">Før</th><th className="h">Etter</th><th className="h">Endring</th></tr></thead>
                <tbody>
                  {endret.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <Prikk farge={kategori(d.kategoriId)?.farge} />
                          <span className={d.endring === 'fjernet' ? 'diff-fjernet' : ''}>{d.navn}</span>
                          {d.endring === 'ny' && <span className="merkelapp bra">Ny</span>}
                          {d.endring === 'fjernet' && <span className="merkelapp feil">Fjernet</span>}
                        </span>
                      </td>
                      <td className="h">{d.endring === 'ny' ? '–' : kr(d.for)}</td>
                      <td className="h">{d.endring === 'fjernet' ? '–' : kr(d.etter)}</td>
                      <td className="h"><Endring diff={d.etter - d.for} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {redigerer && (
        redigerer === 'ny' ? (
          <RevisjonSkjema
            tittel="Ny revisjon" gjelderFra={iDag()}
            forklaring={`Kopierer alle poster, inntekter, overføringer og fordelingen fra «${rev!.navn}». Deretter endrer du det som er nytt.`}
            lukk={() => setRedigerer(null)}
            lagre={(v) => {
              const ny = kopierRevisjon(rev!, v.navn, v.gjelderFra);
              ny.notat = v.notat;
              endreFelles((d) => { d.revisjoner.push(ny); });
              velgRev(ny.id);
              setRedigerer(null);
              gaaTil('budsjett');
            }}
          />
        ) : (
          <RevisjonSkjema
            tittel="Endre revisjon" navn={redigerer.navn} gjelderFra={redigerer.gjelderFra} notat={redigerer.notat}
            lukk={() => setRedigerer(null)}
            lagre={(v) => { endreFelles((d) => { const r = d.revisjoner.find((x) => x.id === redigerer.id); if (r) Object.assign(r, v); }); setRedigerer(null); }}
            slett={felles.revisjoner.length > 1 ? () => {
              endreFelles((d) => { d.revisjoner = d.revisjoner.filter((x) => x.id !== redigerer.id); }, `Slettet «${redigerer.navn}»`);
              if (rev?.id === redigerer.id) velgRev('');
              setRedigerer(null);
            } : undefined}
          />
        )
      )}
    </>
  );
}
