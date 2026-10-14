// Privatbudsjettet – bare eieren kan lese dette (håndheves i databasen).
// Vises på Oversikt og Budsjett når bryteren står på «Privat».
import { useState } from 'react';
import type { Post, PrivatRevisjon } from '../data/modell';
import { ROLLE_NAVN, nyId } from '../data/modell';
import { useTilstand } from '../data/tilstand';
import { kopierRevisjon, oppsummerPrivat, iDag, postMnd, privateOverforinger, sum, type PrivatOverforing } from '../logikk/beregning';
import { privatFlyt } from '../logikk/flyt';
import { Ikon, Kpi, Segment, Tom, kr, pst, maanedTekst } from '../ui/felles';
import { FlytKort, KategoriFordeling, PostListe } from '../ui/deler';
import { PostSkjema, RevisjonSkjema } from '../ui/skjemaer';
import { DenneMaanedKort } from './Oppfolging';

type Fane = 'poster' | 'overforinger';

/** Felles sjekk for privatsidene: koblet til en person, og privatbudsjettet finnes */
function usePrivat() {
  const t = useTilstand();
  return { ...t, klar: !!t.felles && !!t.meg && !!t.privat };
}

function IkkeKoblet({ gaaTil }: { gaaTil: (r: string) => void }) {
  return (
    <Tom ikon="privat" tittel="Du er ikke koblet til en person" tekst="E-posten du logget inn med finnes ikke blant personene i budsjettet.">
      <button className="knapp" onClick={() => gaaTil('personer')}>Gå til Personer</button>
    </Tom>
  );
}

function IngenPrivat({ nyRevisjon }: { nyRevisjon: () => void }) {
  return (
    <Tom ikon="privat" tittel="Ingen privatbudsjett ennå" tekst="Lag ditt eget budsjett for det som er igjen etter fellesoverføringene. Bare du ser det.">
      <button className="knapp primar" onClick={nyRevisjon}><Ikon navn="pluss" storrelse={18} />Opprett privatbudsjett</button>
    </Tom>
  );
}

// ---------------------------------------------------------------- Oversikt (privat)

export function PrivatOversikt({ gaaTil, nyRevisjon }: { gaaTil: (r: string) => void; nyRevisjon: () => void }) {
  const { felles, privat, meg, prev, revForPrivat, klar } = usePrivat();
  if (!felles) return null;
  if (!klar) return <IkkeKoblet gaaTil={gaaTil} />;
  if (!prev) return <IngenPrivat nyRevisjon={nyRevisjon} />;

  const opp = oppsummerPrivat(felles, revForPrivat, prev, meg!.id);
  const perKategori = [...new Set(prev.poster.map((p) => p.kategoriId))]
    .map((kategoriId) => ({ kategoriId, belop: sum(prev.poster.filter((p) => p.kategoriId === kategoriId), postMnd) }))
    .sort((a, b) => b.belop - a.belop);

  return (
    <>
      <div className="banner info">
        <Ikon navn="privat" />
        <div>
          <strong>Bare du ser dette.</strong> {felles.personer.filter((p) => p.id !== meg!.id).map((p) => p.navn).join(' og ') || 'Andre'} ser kun hva du overfører til fellesbudsjettet.
          {revForPrivat && <p className="dempet liten">Inntekt og overføringer hentes fra «{revForPrivat.navn}».</p>}
        </div>
      </div>

      <div className="kpi-rad">
        <Kpi hero etikett="Ikke budsjettert" verdi={kr(opp.ubudsjettert)}
          under={opp.ubudsjettert >= 0 ? 'Til overs hver måned' : 'Du budsjetterer mer enn du har'} />
        <Kpi etikett="Inntekt (netto)" verdi={kr(opp.inntekt)} />
        <Kpi etikett="Til fellesbudsjettet" verdi={kr(opp.tilFelles)} under={opp.inntekt ? `${pst((opp.tilFelles / opp.inntekt) * 100)} av inntekten` : undefined} />
        <Kpi etikett="Spareandel" verdi={pst(opp.spareandel * 100)} under={`Egen sparing ${kr(opp.sparing)} + din andel av felles`} />
      </div>

      <DenneMaanedKort gaaTil={gaaTil} visning="privat" />

      <div className="rutenett to-en">
        <FlytKort
          tittel="Min pengeflyt" undertittel="Per måned"
          lagFlyt={(d) => privatFlyt(felles, revForPrivat, privat!, prev, d)}
          poster={prev.poster} kategorier={felles.kategorier}
        />
        {perKategori.length > 0 && <KategoriFordeling fordeling={perKategori} kategorier={felles.kategorier} />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Budsjett (privat)

export function PrivatBudsjett({ gaaTil, fane, byttFane, nyRevisjon }: {
  gaaTil: (r: string) => void; fane: Fane; byttFane: (f: Fane) => void; nyRevisjon: () => void;
}) {
  const { felles, privat, meg, prev, klar, endrePrivat } = usePrivat();
  const [grupper, setGrupper] = useState<'kategori' | 'konto'>('kategori');
  const [redigerer, setRedigerer] = useState<Post | 'ny' | null>(null);
  if (!felles) return null;
  if (!klar) return <IkkeKoblet gaaTil={gaaTil} />;
  if (!prev) return <IngenPrivat nyRevisjon={nyRevisjon} />;

  const minKonto = felles.kontoer.find((k) => k.rolle === 'avsender' && k.eierId === meg!.id);
  const kontoer = [...(minKonto ? [minKonto] : []), ...privat!.kontoer];
  const endrePrev = (f: (r: PrivatRevisjon) => void, angre?: string) =>
    endrePrivat((d) => { const r = d.revisjoner.find((x) => x.id === prev.id); if (r) f(r); }, angre);

  return (
    <>
      <Segment etikett="Visning" full verdi={fane} endre={byttFane}
        valg={[{ verdi: 'poster', tekst: 'Poster' }, { verdi: 'overforinger', tekst: 'Overføringer' }]} />

      {fane === 'overforinger' ? <Overforinger gaaTil={gaaTil} /> : (
        <section className="kort">
          <div className="kort-hode">
            <div className="tittel"><h2>Mine poster</h2><span className="dempet liten">{prev.poster.length} poster · {kr(sum(prev.poster, postMnd))} per måned</span></div>
            <div className="knapperad">
              <Segment etikett="Grupper etter" verdi={grupper} endre={setGrupper}
                valg={[{ verdi: 'kategori', tekst: 'Kategori' }, { verdi: 'konto', tekst: 'Konto' }]} />
              <button className="knapp primar liten" onClick={() => setRedigerer('ny')}><Ikon navn="pluss" storrelse={18} />Ny post</button>
            </div>
          </div>
          <PostListe poster={prev.poster} kategorier={felles.kategorier} kontoer={kontoer} banker={felles.banker}
            grupper={grupper} velg={setRedigerer}
            tomTekst={<Tom ikon="budsjett" tittel="Ingen poster ennå" tekst="F.eks. bil, abonnementer, klær og egen sparing. Og den ene strømmetjenesten ingen husker å si opp." />} />
        </section>
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
    </>
  );
}

// ---------------------------------------------------------------- Ny privat revisjon

export function NyPrivatRevisjon({ lukk }: { lukk: () => void }) {
  const { prev, velgPrev, endrePrivat } = useTilstand();
  function opprett(v: { navn: string; gjelderFra: string; notat: string }) {
    endrePrivat((d) => {
      const kilde = d.revisjoner.find((r) => r.id === prev?.id);
      const ny: PrivatRevisjon = kilde ? kopierRevisjon(kilde, v.navn, v.gjelderFra) : { id: nyId(), navn: v.navn, gjelderFra: v.gjelderFra, notat: '', poster: [] };
      ny.notat = v.notat;
      d.revisjoner.push(ny);
      setTimeout(() => velgPrev(ny.id));
    });
    lukk();
  }
  return (
    <RevisjonSkjema
      tittel={prev ? 'Ny privat revisjon' : 'Opprett privatbudsjett'}
      navn={`Privat ${maanedTekst(iDag()).toLowerCase()}`} gjelderFra={iDag()}
      forklaring={prev ? `Kopierer alle postene fra «${prev.navn}».` : undefined}
      lagre={opprett} lukk={lukk}
    />
  );
}

// ---------------------------------------------------------------- Overføringer fra lønnskontoen

function Overforinger({ gaaTil }: { gaaTil: (r: string) => void }) {
  const { felles, privat, revForPrivat, prev } = useTilstand();
  if (!felles || !privat) return null;
  const penger = privateOverforinger(felles, revForPrivat, privat, prev);
  const tilFelles = penger.overforinger.filter((o) => o.kilde === 'felles');
  const tilEgne = penger.overforinger.filter((o) => o.kilde === 'egen');
  const bank = (id: string | null) => felles.banker.find((b) => b.id === id)?.navn;
  const postNavn = (poster: Post[]) => [...poster].sort((a, b) => postMnd(b) - postMnd(a)).map((p) => p.navn).join(', ');

  const rad = (o: PrivatOverforing) => (
    <div className="rad" key={o.konto.id}>
      <Ikon navn={o.kilde === 'egen' ? 'privat' : 'overforing'} storrelse={18} />
      <span className="hoved">
        <span className="navn">{o.konto.navn}</span>
        <span className="info">
          {o.kilde === 'egen'
            ? [ROLLE_NAVN[o.konto.rolle], postNavn(o.poster)].join(' · ')
            : [bank(o.konto.bankId), o.konto.kontonr].filter(Boolean).join(' ') || 'Felleskonto'}
        </span>
      </span>
      <span className="belop">{kr(o.belop)}</span>
    </div>
  );

  return (
    <>
      <section className="kort">
        <div className="kort-hode">
          <div className="tittel">
            <h2>Fra {penger.lonnskonto?.navn ?? 'lønnskontoen'}</h2>
            <span className="dempet liten">Per måned · inntekt {kr(penger.inntekt)}</span>
          </div>
        </div>

        {!penger.lonnskonto && (
          <div className="banner info"><Ikon navn="info" /><div>Du har ingen lønnskonto. Legg den til under Kontoer, så vises overføringene her.</div></div>
        )}

        <div className="gruppe-hode">
          <span className="navn">Til fellesbudsjettet</span>
          <span className="sum">{kr(sum(tilFelles, (o) => o.belop))}</span>
        </div>
        <div className="liste">
          {tilFelles.map(rad)}
          {tilFelles.length === 0 && <p className="dempet liten" style={{ padding: '8px 4px' }}>Ingen overføringer til felles.</p>}
        </div>
        <button className="knapp liten flat" style={{ marginTop: 4 }} onClick={() => gaaTil('budsjett/overforinger')}>
          Endres under Budsjett → Overføringer<Ikon navn="pilhoyre" storrelse={16} />
        </button>

        <div className="gruppe-hode" style={{ marginTop: 8 }}>
          <span className="navn">Til mine kontoer</span>
          <span className="sum">{kr(sum(tilEgne, (o) => o.belop))}</span>
        </div>
        <div className="liste">
          {tilEgne.map(rad)}
          {tilEgne.length === 0 && (
            <p className="dempet liten" style={{ padding: '8px 4px' }}>
              Ingen poster på egne kontoer. Opprett en privat konto under Kontoer og velg den på postene som skal trekkes derfra.
            </p>
          )}
        </div>

        <div className="gruppe-hode" style={{ marginTop: 8 }}>
          <span className="navn">Trekkes rett fra lønnskontoen</span>
          <span className="sum">{kr(sum(penger.direkte, postMnd))}</span>
        </div>
        {penger.direkte.length > 0 && (
          <p className="dempet liten" style={{ padding: '0 4px 8px' }}>{penger.direkte.length} poster: {postNavn(penger.direkte)}</p>
        )}

        <div className="gruppe-hode" style={{ marginTop: 8, borderTop: '1px solid var(--linje)' }}>
          <span className="navn">Igjen på lønnskontoen</span>
          {penger.rest >= -0.5
            ? <span className="merkelapp bra">{kr(penger.rest)}</span>
            : <span className="merkelapp feil"><Ikon navn="advarsel" storrelse={12} />{kr(penger.rest)}</span>}
        </div>
      </section>

      <p className="dempet liten" style={{ padding: '0 4px' }}>
        Beløpet til hver egen konto er summen av postene som trekkes derfra. Sett opp en fast overføring i nettbanken med dette beløpet.
      </p>
    </>
  );
}
