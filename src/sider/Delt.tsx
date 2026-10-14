// Delt liste (#/delt/<nøkkel>): vises uten innlogging, bare lesetilgang.
// Henter via databasefunksjonen hent_delt_liste, som bare svarer med riktig nøkkel (se supabase/lister.sql).
import { useEffect, useState } from 'react';
import type { DeltListe } from '../data/modell';
import { lager } from '../data/lager';
import { LISTETYPER, lagTre, punkterForDeling } from '../logikk/lister';
import { IkonBoble, Ikon, Laster, Logo, Tom, kr } from '../ui/felles';


export function DeltSide({ nokkel }: { nokkel: string }) {
  const [liste, setListe] = useState<DeltListe | null | undefined>(undefined);
  const [feil, setFeil] = useState<string | null>(null);

  useEffect(() => {
    lager.hentDeltListe(nokkel)
      .then((l) => { setListe(l); if (l) document.title = `${l.navn} – delt liste`; })
      .catch((e) => { console.error(e); setFeil(String((e as { message?: unknown })?.message ?? e)); setListe(null); });
  }, [nokkel]);

  if (liste === undefined) return <Laster />;

  const tre = liste ? lagTre(punkterForDeling(liste.type, liste.punkter), liste.type) : [];
  return (
    <main className="delt">
      <div className="delt-innhold">
        {!liste ? (
          <section className="kort">
            <Tom ikon="lenke" tittel="Lenken virker ikke" tekst={feil ? 'Lista ville ikke komme fram. Prøv igjen om litt.' : 'Den kan være slått av, eller så har lenken mistet en bokstav på veien. Spør den som delte den om en ny.'} />
          </section>
        ) : (
          <>
            <header className="delt-hode">
              <IkonBoble ikon={liste.ikon || LISTETYPER[liste.type].ikon} storrelse="stor" />
              <div>
                <h1>{liste.navn}</h1>
                <p className="dempet liten">{LISTETYPER[liste.type].navn} · oppdateres automatisk</p>
              </div>
            </header>
            <section className="kort">
              {tre.length === 0 && <Tom ikon="liste" tittel="Lista er tom akkurat nå" tekst="Alt er visst ordnet. Nyt følelsen mens den varer." />}
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
        <p className="delt-fot dempet liten"><Logo hoyde={14} mikro /> Delt fra Sulamitten</p>
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
