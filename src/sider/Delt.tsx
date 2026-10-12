// Delt liste (#/delt/<nøkkel>): vises uten innlogging, bare lesetilgang.
// Henter via databasefunksjonen hent_delt_liste, som bare svarer med riktig nøkkel (se supabase/lister.sql).
import { useEffect, useState } from 'react';
import type { DeltListe } from '../data/modell';
import { lager } from '../data/lager';
import { LISTETYPER, lagTre, punkterForDeling } from '../logikk/lister';
import { Ikon, Tom, kr } from '../ui/felles';

const LOGO = `${import.meta.env.BASE_URL}favicon.svg`;

export function DeltSide({ nokkel }: { nokkel: string }) {
  const [liste, setListe] = useState<DeltListe | null | undefined>(undefined);
  const [feil, setFeil] = useState<string | null>(null);

  useEffect(() => {
    lager.hentDeltListe(nokkel)
      .then((l) => { setListe(l); if (l) document.title = `${l.navn} – delt liste`; })
      .catch((e) => { console.error(e); setFeil(String((e as { message?: unknown })?.message ?? e)); setListe(null); });
  }, [nokkel]);

  if (liste === undefined) return <div className="laster"><div className="spinner" aria-label="Laster" /></div>;

  const tre = liste ? lagTre(punkterForDeling(liste.type, liste.punkter), liste.type) : [];
  return (
    <main className="delt">
      <div className="delt-innhold">
        {!liste ? (
          <section className="kort">
            <Tom ikon="lenke" tittel="Lenken virker ikke" tekst={feil ? 'Kunne ikke hente listen. Prøv igjen senere.' : 'Den kan være slått av, eller lenken er skrevet feil. Spør den som delte den om en ny.'} />
          </section>
        ) : (
          <>
            <header className="delt-hode">
              <span className="liste-ikon stor">{liste.ikon || LISTETYPER[liste.type].ikon}</span>
              <div>
                <h1>{liste.navn}</h1>
                <p className="dempet liten">{LISTETYPER[liste.type].navn} · oppdateres automatisk</p>
              </div>
            </header>
            <section className="kort">
              {tre.length === 0 && <Tom ikon="liste" tittel="Ingenting på listen akkurat nå" />}
              <div className="liste">
                {tre.map(({ punkt, barn }) => (
                  <div key={punkt.id} className={barn.length ? 'gruppe-punkt' : 'punkt'}>
                    <Rad tekst={punkt.tekst} notat={punkt.notat} belop={punkt.belop} lenke={punkt.lenke} hoved={barn.length > 0} />
                    {barn.length > 0 && (
                      <div className="gruppe-barn">
                        {barn.map((b) => <div className="punkt" key={b.id}><Rad tekst={b.tekst} notat={b.notat} belop={b.belop} lenke={b.lenke} /></div>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        <p className="delt-fot dempet liten"><img src={LOGO} width={16} height={16} alt="" /> Delt fra Familie-appen</p>
      </div>
    </main>
  );
}

function Rad({ tekst, notat, belop, lenke, hoved }: { tekst: string; notat: string; belop: number | null; lenke?: string; hoved?: boolean }) {
  const gyldigLenke = lenke && /^https?:\/\//.test(lenke) ? lenke : null;
  return (
    <div className={`rad${hoved ? ' gruppe-topp' : ''}`}>
      <span className="hoved">
        <span className="navn">{tekst}</span>
        {notat && <span className="info" style={{ whiteSpace: 'normal' }}>{notat}</span>}
        {gyldigLenke && <a className="delt-lenke" href={gyldigLenke} target="_blank" rel="noreferrer noopener"><Ikon navn="lenke" storrelse={13} />{new URL(gyldigLenke).hostname.replace(/^www\./, '')}</a>}
      </span>
      {belop ? <span className="belop">{kr(belop)}</span> : null}
    </div>
  );
}
