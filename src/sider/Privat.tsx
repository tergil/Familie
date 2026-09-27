// Privatbudsjettet – bare eieren kan lese dette (håndheves i databasen).
import { useState } from 'react';
import type { Post, PrivatRevisjon } from '../data/modell';
import { nyId } from '../data/modell';
import { useTilstand } from '../data/tilstand';
import { kopierRevisjon, oppsummerPrivat, iDag } from '../logikk/beregning';
import { privatFlyt } from '../logikk/flyt';
import { Ikon, Kpi, Segment, Tom, kr, pst, maanedTekst } from '../ui/felles';
import { FlytKort, PostListe, RevisjonsVelger } from '../ui/deler';
import { PostSkjema, RevisjonSkjema } from '../ui/skjemaer';

export function Privat({ gaaTil }: { gaaTil: (r: string) => void }) {
  const { felles, privat, meg, prev, velgPrev, revForPrivat, endrePrivat } = useTilstand();
  const [grupper, setGrupper] = useState<'kategori' | 'konto'>('kategori');
  const [redigerer, setRedigerer] = useState<Post | 'ny' | null>(null);
  const [nyRev, setNyRev] = useState(false);

  if (!felles) return null;
  if (!meg || !privat) {
    return (
      <Tom ikon="privat" tittel="Du er ikke koblet til en person" tekst="E-posten du logget inn med finnes ikke blant personene i budsjettet.">
        <button className="knapp" onClick={() => gaaTil('personer')}>Gå til Personer</button>
      </Tom>
    );
  }

  const minKonto = felles.kontoer.find((k) => k.rolle === 'avsender' && k.eierId === meg.id);
  const kontoer = [...(minKonto ? [minKonto] : []), ...privat.kontoer];
  const opp = oppsummerPrivat(felles, revForPrivat, prev, meg.id);

  function opprettRevisjon(v: { navn: string; gjelderFra: string; notat: string }) {
    endrePrivat((d) => {
      const kilde = d.revisjoner.find((r) => r.id === prev?.id);
      const ny: PrivatRevisjon = kilde ? kopierRevisjon(kilde, v.navn, v.gjelderFra) : { id: nyId(), navn: v.navn, gjelderFra: v.gjelderFra, notat: '', poster: [] };
      ny.notat = v.notat;
      d.revisjoner.push(ny);
      setTimeout(() => velgPrev(ny.id));
    });
    setNyRev(false);
  }

  const endrePrev = (f: (r: PrivatRevisjon) => void, angre?: string) =>
    endrePrivat((d) => { const r = d.revisjoner.find((x) => x.id === prev!.id); if (r) f(r); }, angre);

  return (
    <>
      <div className="banner info">
        <Ikon navn="privat" />
        <div><strong>Bare du ser denne siden.</strong> {felles.personer.filter((p) => p.id !== meg.id).map((p) => p.navn).join(' og ') || 'Andre'} ser kun hva du overfører til fellesbudsjettet.</div>
      </div>

      {!prev ? (
        <Tom ikon="privat" tittel="Ingen privatbudsjett ennå" tekst="Lag ditt eget budsjett for det som er igjen etter fellesoverføringene.">
          <button className="knapp primar" onClick={() => setNyRev(true)}><Ikon navn="pluss" storrelse={18} />Opprett privatbudsjett</button>
        </Tom>
      ) : (
        <>
          <div className="knapperad" style={{ alignItems: 'center' }}>
            <RevisjonsVelger revisjoner={privat.revisjoner} valgt={prev} velg={velgPrev} nyRevisjon={() => setNyRev(true)} />
            {revForPrivat && <span className="dempet liten">Bruker inntekt og overføringer fra «{revForPrivat.navn}»</span>}
          </div>

          <div className="kpi-rad">
            <Kpi hero etikett="Ikke budsjettert" verdi={kr(opp.ubudsjettert)}
              under={opp.ubudsjettert >= 0 ? 'Til overs hver måned' : 'Du budsjetterer mer enn du har'} />
            <Kpi etikett="Inntekt (netto)" verdi={kr(opp.inntekt)} />
            <Kpi etikett="Til fellesbudsjettet" verdi={kr(opp.tilFelles)} under={opp.inntekt ? `${pst((opp.tilFelles / opp.inntekt) * 100)} av inntekten` : undefined} />
            <Kpi etikett="Spareandel" verdi={pst(opp.spareandel * 100)} under={`Egen sparing ${kr(opp.sparing)} + din andel av felles`} />
          </div>

          <div className="rutenett to">
            <FlytKort
              tittel="Min pengeflyt" undertittel="Per måned"
              lagFlyt={(d) => privatFlyt(felles, revForPrivat, privat, prev, d)}
              poster={prev.poster} kategorier={felles.kategorier}
            />
            <section className="kort">
              <div className="kort-hode">
                <div className="tittel"><h2>Mine poster</h2><span className="dempet liten">{kr(opp.utgifter + opp.sparing)} per måned</span></div>
                <div className="knapperad">
                  <Segment etikett="Grupper etter" verdi={grupper} endre={setGrupper}
                    valg={[{ verdi: 'kategori', tekst: 'Kategori' }, { verdi: 'konto', tekst: 'Konto' }]} />
                  <button className="knapp primar liten" onClick={() => setRedigerer('ny')}><Ikon navn="pluss" storrelse={18} />Ny</button>
                </div>
              </div>
              <PostListe poster={prev.poster} kategorier={felles.kategorier} kontoer={kontoer} banker={felles.banker}
                grupper={grupper} velg={setRedigerer}
                tomTekst={<Tom ikon="budsjett" tittel="Ingen poster ennå" tekst="F.eks. bil, abonnementer, klær og egen sparing." />} />
            </section>
          </div>
        </>
      )}

      {redigerer && (
        <PostSkjema
          post={redigerer === 'ny' ? undefined : redigerer}
          kategorier={felles.kategorier} kontoer={kontoer} banker={felles.banker}
          lukk={() => setRedigerer(null)}
          lagre={(p) => { endrePrev((r) => { const i = r.poster.findIndex((x) => x.id === p.id); if (i >= 0) r.poster[i] = p; else r.poster.push(p); }); setRedigerer(null); }}
          slett={redigerer === 'ny' ? undefined : () => { endrePrev((r) => { r.poster = r.poster.filter((x) => x.id !== (redigerer as Post).id); }, `Slettet «${redigerer.navn}»`); setRedigerer(null); }}
        />
      )}
      {nyRev && (
        <RevisjonSkjema
          tittel={prev ? 'Ny privat revisjon' : 'Opprett privatbudsjett'}
          navn={`Privat ${maanedTekst(iDag()).toLowerCase()}`} gjelderFra={iDag()}
          forklaring={prev ? `Kopierer alle postene fra «${prev.navn}».` : undefined}
          lagre={opprettRevisjon} lukk={() => setNyRev(false)}
        />
      )}
    </>
  );
}
