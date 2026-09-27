// Større byggeklosser som brukes på flere sider.
import { useState, type ReactNode } from 'react';
import type { Bank, Kategori, Konto, Post } from '../data/modell';
import { FREKVENS_NAVN } from '../data/modell';
import type { Detalj, Flyt, FlytNode } from '../logikk/flyt';
import { postMnd, sorterRevisjoner, sum, iDag, aktivRevisjon } from '../logikk/beregning';
import { Ark, Ikon, Prikk, Segment, kr, datoTekst } from './felles';
import { FlytTabell, Sankey } from './Sankey';

// ---------------------------------------------------------------- Pengeflyt-kort

export function FlytKort({ tittel, undertittel, lagFlyt, poster, kategorier }: {
  tittel: string; undertittel?: string; lagFlyt: (d: Detalj) => Flyt; poster: Post[]; kategorier: Kategori[];
}) {
  const [detalj, setDetalj] = useState<Detalj>(() => (window.innerWidth < 640 ? 'enkel' : 'kontoer'));
  const [tabell, setTabell] = useState(false);
  const [valgt, setValgt] = useState<FlytNode | null>(null);
  const flyt = lagFlyt(detalj);
  const brukteKat = kategorier.filter((k) => flyt.noder.some((n) => n.kategoriId === k.id));
  const valgtePoster = valgt?.kategoriId ? poster.filter((p) => p.kategoriId === valgt.kategoriId) : [];

  return (
    <section className="kort">
      <div className="kort-hode">
        <div className="tittel">
          <h2>{tittel}</h2>
          {undertittel && <span className="dempet liten">{undertittel}</span>}
        </div>
        <div className="knapperad">
          <Segment etikett="Detaljnivå" verdi={detalj} endre={setDetalj}
            valg={[{ verdi: 'enkel', tekst: 'Enkel' }, { verdi: 'kontoer', tekst: 'Med kontoer' }]} />
          <button className="knapp ikon liten flat" onClick={() => setTabell(!tabell)} aria-pressed={tabell}
            aria-label={tabell ? 'Vis som diagram' : 'Vis som tabell'} title={tabell ? 'Vis som diagram' : 'Vis som tabell'}>
            <Ikon navn={tabell ? 'flyt' : 'tabell'} storrelse={18} />
          </button>
        </div>
      </div>
      {flyt.lenker.length === 0
        ? <p className="dempet">Ingen pengeflyt å vise ennå.</p>
        : tabell ? <FlytTabell flyt={flyt} /> : <Sankey flyt={flyt} velg={(n) => n.kategoriId && setValgt(n)} />}
      {!tabell && brukteKat.length > 0 && (
        <div className="forklaring" aria-label="Fargeforklaring">
          {brukteKat.map((k) => <span key={k.id}><Prikk farge={k.farge} />{k.navn}</span>)}
          <span className="dempet">Trykk på en kategori for detaljer</span>
        </div>
      )}
      {valgt && (
        <Ark tittel={valgt.navn} lukk={() => setValgt(null)}>
          <div className="liste">
            {valgtePoster.map((p) => (
              <div className="rad" key={p.id}>
                <div className="hoved"><span className="navn">{p.navn}</span><span className="info">{p.type === 'sparing' ? 'Sparing' : 'Utgift'}{p.frekvens !== 'mnd' ? ` · ${FREKVENS_NAVN[p.frekvens]} ${kr(p.belop)}` : ''}</span></div>
                <span className="belop">{kr(postMnd(p))}</span>
              </div>
            ))}
          </div>
          <div className="gruppe-hode"><span className="navn">Sum per måned</span><span className="sum">{kr(sum(valgtePoster, postMnd))}</span></div>
        </Ark>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Postliste gruppert

export function PostListe({ poster, kategorier, kontoer, banker, grupper, velg, tomTekst }: {
  poster: Post[]; kategorier: Kategori[]; kontoer: Konto[]; banker: Bank[];
  grupper: 'kategori' | 'konto'; velg: (p: Post) => void; tomTekst?: ReactNode;
}) {
  if (poster.length === 0) return <>{tomTekst}</>;
  const kontoNavn = (id: string) => kontoer.find((k) => k.id === id)?.navn ?? 'Ukjent konto';
  const kategori = (id: string) => kategorier.find((k) => k.id === id);
  const bank = (k?: Konto) => banker.find((b) => b.id === k?.bankId)?.navn;

  const nokler = grupper === 'kategori'
    ? kategorier.map((k) => k.id).concat([...new Set(poster.map((p) => p.kategoriId))].filter((id) => !kategori(id)))
    : [...new Set(poster.map((p) => p.kontoId))];
  const grupperte = nokler
    .map((n) => ({ nokkel: n, poster: poster.filter((p) => (grupper === 'kategori' ? p.kategoriId : p.kontoId) === n) }))
    .filter((g) => g.poster.length)
    .sort((a, b) => sum(b.poster, postMnd) - sum(a.poster, postMnd));

  return (
    <div>
      {grupperte.map((g) => {
        const k = grupper === 'kategori' ? kategori(g.nokkel) : undefined;
        const konto = grupper === 'konto' ? kontoer.find((x) => x.id === g.nokkel) : undefined;
        return (
          <div key={g.nokkel}>
            <div className="gruppe-hode">
              {grupper === 'kategori' ? <Prikk farge={k?.farge} /> : <Ikon navn="konto" storrelse={16} />}
              <span className="navn">{k?.navn ?? konto?.navn ?? (grupper === 'kategori' ? 'Uten kategori' : 'Ukjent konto')}
                {konto && bank(konto) && <span className="dempet liten" style={{ fontWeight: 400 }}> · {bank(konto)} {konto.kontonr}</span>}
              </span>
              <span className="sum">{kr(sum(g.poster, postMnd))}</span>
            </div>
            <div className="liste">
              {g.poster.sort((a, b) => postMnd(b) - postMnd(a)).map((p) => (
                <button className="rad" key={p.id} onClick={() => velg(p)}>
                  {grupper === 'konto' && <Prikk farge={kategori(p.kategoriId)?.farge} />}
                  <span className="hoved">
                    <span className="navn">{p.navn}</span>
                    <span className="info">
                      {grupper === 'kategori' ? kontoNavn(p.kontoId) : kategori(p.kategoriId)?.navn}
                      {p.type === 'sparing' && ' · Sparing'}
                      {p.notat && ` · ${p.notat}`}
                    </span>
                  </span>
                  <span className="belop">
                    {kr(postMnd(p))}
                    {p.frekvens !== 'mnd' && <small>{kr(p.belop)} {FREKVENS_NAVN[p.frekvens].toLowerCase()}</small>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Revisjonsvelger

export function RevisjonsVelger<R extends { id: string; navn: string; gjelderFra: string }>({ revisjoner, valgt, velg, nyRevisjon }: {
  revisjoner: R[]; valgt: R | undefined; velg: (id: string) => void; nyRevisjon?: () => void;
}) {
  const [aapen, setAapen] = useState(false);
  if (!valgt) return null;
  const gjeldende = aktivRevisjon(revisjoner, iDag());
  return (
    <>
      <button className="chip" onClick={() => setAapen(true)} aria-label={`Revisjon: ${valgt.navn}. Bytt revisjon`}>
        <Ikon navn="revisjon" storrelse={16} />
        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{valgt.navn}</span>
        <Ikon navn="pilned" storrelse={16} />
      </button>
      {aapen && (
        <Ark tittel="Velg revisjon" lukk={() => setAapen(false)}>
          <div className="liste">
            {sorterRevisjoner(revisjoner).map((r) => (
              <button key={r.id} className="rad" onClick={() => { velg(r.id); setAapen(false); }}>
                <span className="hoved">
                  <span className="navn">{r.navn}</span>
                  <span className="info">Gjelder fra {datoTekst(r.gjelderFra)}</span>
                </span>
                {r.id === gjeldende?.id && <span className="merkelapp bra">Gjelder nå</span>}
                {r.id === valgt.id && <Ikon navn="sjekk" />}
              </button>
            ))}
          </div>
          {nyRevisjon && (
            <button className="knapp full" style={{ marginTop: 16 }} onClick={() => { setAapen(false); nyRevisjon(); }}>
              <Ikon navn="kopi" storrelse={18} />Ny revisjon basert på denne
            </button>
          )}
        </Ark>
      )}
    </>
  );
}

/** Enkel tittel + handlinger over en seksjon */
export function SeksjonHode({ tittel, children }: { tittel: string; children?: ReactNode }) {
  return (
    <div className="kort-hode" style={{ marginBottom: 4 }}>
      <h2>{tittel}</h2>
      {children && <div className="knapperad">{children}</div>}
    </div>
  );
}
