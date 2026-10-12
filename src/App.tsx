import { useEffect, useState } from 'react';
import { IkkeMedlemFeil, lager, type Bruker } from './data/lager';
import { TilstandGiver, useTilstand, type LagreStatus } from './data/tilstand';
import { Avatar, Ikon } from './ui/felles';
import { RevisjonsVelger, VisningsBryter, type Visning } from './ui/deler';
import { Oversikt } from './sider/Oversikt';
import { Budsjett } from './sider/Budsjett';
import { NyPrivatRevisjon, PrivatBudsjett, PrivatOversikt } from './sider/Privat';
import { Lister } from './sider/Lister';
import { DeltSide } from './sider/Delt';
import { PLAN_IKON, planTittel, tilPlanType } from './logikk/gaveaar';
import { useLister } from './data/lister';
import { Sparing } from './sider/Sparing';
import { Revisjoner } from './sider/Revisjoner';
import { Data, Kategorier, Kontoer, Mer, Personer } from './sider/Oppsett';
import { Oppfolging } from './sider/Oppfolging';
import { UtgiftSkjema } from './ui/UtgiftSkjema';

const LOGO = `${import.meta.env.BASE_URL}favicon.svg`;

// ---------------------------------------------------------------- Ruting (hash, fungerer på GitHub Pages)

function useRute(): [string, (r: string) => void] {
  const les = () => location.hash.replace(/^#\/?/, '') || 'oversikt';
  const [rute, setRute] = useState(les);
  useEffect(() => {
    const f = () => { setRute(les()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return [rute, (r) => { location.hash = `/${r}`; }];
}

// ---------------------------------------------------------------- Tema

type Tema = 'auto' | 'lys' | 'mork';

function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(() => {
    try { return (localStorage.getItem('familie.tema') as Tema) || 'auto'; } catch { return 'auto'; }
  });
  useEffect(() => {
    if (tema === 'auto') document.documentElement.removeAttribute('data-tema');
    else document.documentElement.setAttribute('data-tema', tema);
    try { localStorage.setItem('familie.tema', tema); } catch { /* ignorer */ }
  }, [tema]);
  return [tema, () => setTema(tema === 'auto' ? 'lys' : tema === 'lys' ? 'mork' : 'auto')];
}

// ---------------------------------------------------------------- Felles eller privat (huskes mellom sidene)

function useVisning(): [Visning, (v: Visning) => void] {
  const [visning, setVisning] = useState<Visning>(() => {
    try { return localStorage.getItem('familie.visning') === 'privat' ? 'privat' : 'felles'; } catch { return 'felles'; }
  });
  return [visning, (v) => {
    setVisning(v);
    try { localStorage.setItem('familie.visning', v); } catch { /* ignorer */ }
  }];
}

// ---------------------------------------------------------------- Innlogging

function Innlogging({ feil }: { feil: string | null }) {
  const [venter, setVenter] = useState(false);
  return (
    <main className="innlogging">
      <div className="kort">
        <img src={LOGO} width={64} height={64} alt="" style={{ borderRadius: 16 }} />
        <h1>Familie</h1>
        <p className="dempet">Logg inn for å se budsjett, lister og gaver.</p>
        {feil && <div className="banner feil" style={{ textAlign: 'left' }}><Ikon navn="advarsel" /><div>{feil}</div></div>}
        <button className="knapp full" disabled={venter} onClick={async () => { setVenter(true); await lager.loggInn(); }}>
          <Ikon navn="google" />{venter ? 'Sender deg til Google …' : 'Logg inn med Google'}
        </button>
        <p className="dempet liten"><Ikon navn="privat" storrelse={12} /> Kun for inviterte</p>
      </div>
    </main>
  );
}

const deltNokkel = () => location.hash.match(/^#\/delt\/([\w-]+)/)?.[1];

export function App() {
  // Delte lister (#/delt/<nøkkel>) vises uten innlogging – også når lenken åpnes i en fane der appen er åpen
  const [delt, setDelt] = useState(deltNokkel);
  useEffect(() => {
    const f = () => setDelt(deltNokkel());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return delt ? <DeltSide key={delt} nokkel={delt} /> : <MedInnlogging />;
}

function MedInnlogging() {
  const [bruker, setBruker] = useState<Bruker | null | undefined>(undefined);
  const [feil, setFeil] = useState<string | null>(null);

  useEffect(() => {
    lager.hentBruker()
      .then(async (b) => {
        // I demomodus logges man inn automatisk som første person
        if (!b && lager.modus === 'lokal') { await lager.loggInn(); b = await lager.hentBruker(); }
        setBruker(b);
      })
      .catch((e) => { setFeil(e instanceof IkkeMedlemFeil ? e.message : `Innlogging feilet: ${e.message ?? e}`); setBruker(null); });
  }, []);

  if (bruker === undefined) return <div className="laster"><div className="spinner" aria-label="Laster" /></div>;
  if (!bruker) return <Innlogging feil={feil} />;
  return <TilstandGiver bruker={bruker}><Skall /></TilstandGiver>;
}

// ---------------------------------------------------------------- Skall: meny, topp, innhold

// Sidemeny (PC): alle hovedsider. Bunnmeny (mobil): de fire mest brukte + Mer.
const HOVED: [string, string, string][] = [
  ['oversikt', 'oversikt', 'Oversikt'],
  ['budsjett', 'budsjett', 'Budsjett'],
  ['oppfolging', 'oppfolging', 'Oppfølging'],
  ['lister', 'liste', 'Lister'],
  ['sparing', 'sparing', 'Sparing'],
];
const BUNN = HOVED.filter(([r]) => r !== 'sparing');
/** Sider med felles/privat-bryter */
const MED_VISNING = ['oversikt', 'budsjett', 'oppfolging'];
/** Sider med «Før utgift»-knapp */
const MED_FAB = ['oversikt', 'oppfolging', 'ny'];
const OPPSETT: [string, string, string][] = [
  ['revisjoner', 'revisjon', 'Revisjoner'],
  ['kontoer', 'konto', 'Kontoer'],
  ['kategorier', 'kategori', 'Kategorier'],
  ['personer', 'person', 'Personer'],
  ['data', 'lastned', 'Import/eksport'],
];
const TITLER: Record<string, string> = {
  oversikt: 'Oversikt', budsjett: 'Budsjett', oppfolging: 'Oppfølging', lister: 'Lister', sparing: 'Sparemål', mer: 'Mer',
  revisjoner: 'Revisjoner', kontoer: 'Kontoer og banker', kategorier: 'Kategorier', personer: 'Personer og fordeling', data: 'Import og eksport',
};

function Lagring({ status }: { status: LagreStatus }) {
  const tekst = { lagret: 'Lagret', lagrer: 'Lagrer …', feil: 'Ikke lagret', konflikt: 'Konflikt' }[status];
  return <span className={`lagring ${status === 'lagrer' ? 'lagrer' : status === 'lagret' ? '' : 'feil'}`} role="status"><span className="punkt" />{tekst}</span>;
}

function Skall() {
  const [rute, gaaTil] = useRute();
  const [tema, byttTema] = useTema();
  const { felles, privat, rev, velgRev, prev, velgPrev, status, feilmelding, toast, visToast, bruker, meg, loggUt, lastPaaNytt } = useTilstand();
  const { lister } = useLister();
  const [valgtVisning, settVisning] = useVisning();
  const [nyPrivatRevisjon, setNyPrivatRevisjon] = useState(false);
  const [rullet, setRullet] = useState(false);
  const [forerUtgift, setForerUtgift] = useState(() => location.hash.replace(/^#\/?/, '') === 'ny');
  const [side, underside] = rute.split('/');

  useEffect(() => {
    const f = () => setRullet(window.scrollY > 4);
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);

  // Gamle lenker til den tidligere Privat-fanen
  useEffect(() => {
    if (side !== 'privat') return;
    settVisning('privat');
    gaaTil(underside === 'overforinger' ? 'budsjett/overforinger' : 'oversikt');
  }, [side]);

  const erAktiv = (r: string) => side === r || (r === 'mer' && (side === 'sparing' || OPPSETT.some(([o]) => o === side)));
  const medVisning = MED_VISNING.includes(side) && !!meg;
  const erPrivat = medVisning && valgtVisning === 'privat';
  const visFab = MED_FAB.includes(side);
  const fabPlass = visFab || (side === 'lister' && !underside);
  const visRevVelger = felles && ['oversikt', 'budsjett', 'personer'].includes(side);
  const aapenListe = side === 'lister' && underside ? lister.find((l) => l.id === underside) : undefined;
  const [, , planType, planAar] = rute.split('/');
  const tittel = side === 'lister' && underside === 'plan'
    ? `${PLAN_IKON[tilPlanType(planType)]} ${planTittel(tilPlanType(planType), planAar ?? '')}`
    : aapenListe ? `${aapenListe.ikon} ${aapenListe.navn}` : TITLER[side] ?? 'Oversikt';

  let innhold;
  switch (side) {
    case 'budsjett':
      innhold = erPrivat
        ? <PrivatBudsjett gaaTil={gaaTil} fane={underside === 'overforinger' ? 'overforinger' : 'poster'} byttFane={(f) => gaaTil(`budsjett/${f}`)} nyRevisjon={() => setNyPrivatRevisjon(true)} />
        : <Budsjett fane={(underside as 'poster' | 'overforinger' | 'inntekter') ?? 'poster'} byttFane={(f) => gaaTil(`budsjett/${f}`)} />;
      break;
    case 'oppfolging': innhold = <Oppfolging key={rute} visning={erPrivat ? 'privat' : 'felles'} maaned={rute.split('/').find((d) => /^\d{4}-\d{2}$/.test(d))} />; break;
    case 'lister': innhold = <Lister listeId={underside} rest={rute.split('/').slice(2)} gaaTil={gaaTil} />; break;
    case 'privat': innhold = null; break;
    case 'sparing': innhold = <Sparing />; break;
    case 'revisjoner': innhold = <Revisjoner gaaTil={gaaTil} />; break;
    case 'kontoer': innhold = <Kontoer />; break;
    case 'kategorier': innhold = <Kategorier />; break;
    case 'personer': innhold = <Personer />; break;
    case 'data': innhold = <Data />; break;
    case 'mer': innhold = <Mer gaaTil={gaaTil} tema={tema} byttTema={byttTema} />; break;
    default: innhold = erPrivat ? <PrivatOversikt gaaTil={gaaTil} nyRevisjon={() => setNyPrivatRevisjon(true)} /> : <Oversikt gaaTil={gaaTil} />;
  }

  return (
    <div className="ramme">
      <nav className="sidebar" aria-label="Hovedmeny">
        <div className="merke">
          <img src={LOGO} width={28} height={28} alt="" />
          Familie
        </div>
        {HOVED.map(([r, ikon, tekst]) => (
          <a key={r} href={`#/${r}`} aria-current={side === r ? 'page' : undefined}><Ikon navn={ikon} />{tekst}</a>
        ))}
        <div className="gruppe">Oppsett</div>
        {OPPSETT.map(([r, ikon, tekst]) => (
          <a key={r} href={`#/${r}`} aria-current={side === r ? 'page' : undefined}><Ikon navn={ikon} />{tekst}</a>
        ))}
        <div className="bunn">
          <a href="#" onClick={(e) => { e.preventDefault(); byttTema(); }}>
            <Ikon navn={tema === 'mork' ? 'mane' : 'sol'} />Tema: {tema === 'auto' ? 'automatisk' : tema === 'mork' ? 'mørkt' : 'lyst'}
          </a>
          <a href="#" onClick={(e) => { e.preventDefault(); void loggUt(); }}>
            <Avatar navn={meg?.navn ?? bruker?.navn ?? '?'} bilde={bruker?.bilde} />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>{meg?.navn ?? bruker?.navn}<span className="dempet liten">Logg ut</span></span>
          </a>
        </div>
      </nav>

      <div>
        <header className={`topp${rullet ? ' rullet' : ''}`}>
          <h1>{tittel}</h1>
          {visRevVelger && (erPrivat
            ? privat && <RevisjonsVelger revisjoner={privat.revisjoner} valgt={prev} velg={velgPrev} nyRevisjon={() => setNyPrivatRevisjon(true)} />
            : <RevisjonsVelger revisjoner={felles!.revisjoner} valgt={rev} velg={velgRev} nyRevisjon={() => gaaTil('revisjoner')} />)}
          <Lagring status={status} />
        </header>

        <main className={`innhold${fabPlass ? ' med-fab' : ''}`}>
          {status === 'konflikt' && (
            <div className="banner varsel" role="alert">
              <Ikon navn="advarsel" />
              <div><strong>Budsjettet er endret et annet sted.</strong><p>Din siste endring ble ikke lagret. Last inn på nytt for å se den nyeste versjonen.</p></div>
              <button className="knapp liten" onClick={() => void lastPaaNytt()}>Last inn</button>
            </div>
          )}
          {status === 'feil' && (
            <div className="banner feil" role="alert"><Ikon navn="advarsel" /><div><strong>Kunne ikke lagre.</strong> Endringen er ikke lagret i databasen. Prøv igjen, eller last inn siden på nytt.{feilmelding && <p className="liten" style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>Feil: {feilmelding}</p>}</div></div>
          )}
          {lager.modus === 'lokal' && side === 'oversikt' && (
            <div className="banner info"><Ikon navn="info" /><div><strong>Demomodus</strong> med oppdiktede tall. Du ser som {meg?.navn}. Bytt person under <a href="#/data">Import/eksport</a>.</div></div>
          )}
          {medVisning && <VisningsBryter verdi={erPrivat ? 'privat' : 'felles'} endre={settVisning} />}
          {innhold}
        </main>
      </div>

      <nav className="bunnmeny" aria-label="Hovedmeny">
        {[...BUNN, ['mer', 'mer', 'Mer'] as [string, string, string]].map(([r, ikon, tekst]) => (
          <a key={r} href={`#/${r}`} aria-current={erAktiv(r) ? 'page' : undefined}>
            <span className="ikon-boble"><Ikon navn={ikon} /></span>{tekst}
          </a>
        ))}
      </nav>

      {visFab && (
        <button className="fab" onClick={() => setForerUtgift(true)}><Ikon navn="pluss" storrelse={22} />Før utgift</button>
      )}
      {forerUtgift && <UtgiftSkjema privatStart={erPrivat} lukk={() => { setForerUtgift(false); if (side === 'ny') gaaTil('oversikt'); }} />}
      {nyPrivatRevisjon && <NyPrivatRevisjon lukk={() => setNyPrivatRevisjon(false)} />}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.tekst}</span>
          {toast.angre ? <button className="knapp liten" onClick={toast.angre}>Angre</button>
            : toast.handling ? <button className="knapp liten" onClick={toast.handling.kjor}>{toast.handling.tekst}</button>
            : <button className="knapp liten ikon" onClick={() => visToast(null)} aria-label="Lukk"><Ikon navn="lukk" storrelse={16} /></button>}
        </div>
      )}
    </div>
  );
}
