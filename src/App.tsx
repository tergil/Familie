import { useEffect, useState } from 'react';
import { IkkeMedlemFeil, lager, type Bruker } from './data/lager';
import { TilstandGiver, useTilstand, type LagreStatus } from './data/tilstand';
import { Avatar, Ikon } from './ui/felles';
import { RevisjonsVelger } from './ui/deler';
import { Oversikt } from './sider/Oversikt';
import { Budsjett } from './sider/Budsjett';
import { Privat } from './sider/Privat';
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

// ---------------------------------------------------------------- Innlogging

function Innlogging({ feil }: { feil: string | null }) {
  const [venter, setVenter] = useState(false);
  return (
    <main className="innlogging">
      <div className="kort">
        <img src={LOGO} width={64} height={64} alt="" style={{ borderRadius: 16 }} />
        <h1>Familiebudsjett</h1>
        <p className="dempet">Logg inn for å se budsjettet deres.</p>
        {feil && <div className="banner feil" style={{ textAlign: 'left' }}><Ikon navn="advarsel" /><div>{feil}</div></div>}
        <button className="knapp full" disabled={venter} onClick={async () => { setVenter(true); await lager.loggInn(); }}>
          <Ikon navn="google" />{venter ? 'Sender deg til Google …' : 'Logg inn med Google'}
        </button>
        <p className="dempet liten"><Ikon navn="privat" storrelse={12} /> Kun for inviterte</p>
      </div>
    </main>
  );
}

export function App() {
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
  ['privat', 'privat', 'Privat'],
  ['sparing', 'sparing', 'Sparing'],
];
const BUNN = HOVED.filter(([r]) => r !== 'sparing');
/** Sider med «Før utgift»-knapp */
const MED_FAB = ['oversikt', 'oppfolging', 'privat', 'ny'];
const OPPSETT: [string, string, string][] = [
  ['revisjoner', 'revisjon', 'Revisjoner'],
  ['kontoer', 'konto', 'Kontoer'],
  ['kategorier', 'kategori', 'Kategorier'],
  ['personer', 'person', 'Personer'],
  ['data', 'lastned', 'Import/eksport'],
];
const TITLER: Record<string, string> = {
  oversikt: 'Oversikt', budsjett: 'Budsjett', oppfolging: 'Oppfølging', privat: 'Mitt budsjett', sparing: 'Sparemål', mer: 'Mer',
  revisjoner: 'Revisjoner', kontoer: 'Kontoer og banker', kategorier: 'Kategorier', personer: 'Personer og fordeling', data: 'Import og eksport',
};

function Lagring({ status }: { status: LagreStatus }) {
  const tekst = { lagret: 'Lagret', lagrer: 'Lagrer …', feil: 'Ikke lagret', konflikt: 'Konflikt' }[status];
  return <span className={`lagring ${status === 'lagrer' ? 'lagrer' : status === 'lagret' ? '' : 'feil'}`} role="status"><span className="punkt" />{tekst}</span>;
}

function Skall() {
  const [rute, gaaTil] = useRute();
  const [tema, byttTema] = useTema();
  const { felles, rev, velgRev, status, feilmelding, toast, visToast, bruker, meg, loggUt, lastPaaNytt } = useTilstand();
  const [rullet, setRullet] = useState(false);
  const [forerUtgift, setForerUtgift] = useState(() => location.hash.replace(/^#\/?/, '') === 'ny');
  const [side, underside] = rute.split('/');

  useEffect(() => {
    const f = () => setRullet(window.scrollY > 4);
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);

  const erAktiv = (r: string) => side === r || (r === 'mer' && (side === 'sparing' || OPPSETT.some(([o]) => o === side)));
  const visFab = MED_FAB.includes(side || 'oversikt');
  const privatFab = side === 'privat' || (side === 'oppfolging' && underside === 'privat');
  const visRevVelger = felles && ['oversikt', 'budsjett', 'personer'].includes(side);

  let innhold;
  switch (side) {
    case 'budsjett': innhold = <Budsjett fane={(underside as 'poster' | 'overforinger' | 'inntekter') ?? 'poster'} byttFane={(f) => gaaTil(`budsjett/${f}`)} />; break;
    case 'oppfolging': innhold = <Oppfolging key={rute} visning={underside === 'privat' ? 'privat' : 'felles'} maaned={rute.split('/')[2]} byttVisning={(v) => gaaTil(`oppfolging/${v}`)} />; break;
    case 'privat': innhold = <Privat gaaTil={gaaTil} />; break;
    case 'sparing': innhold = <Sparing />; break;
    case 'revisjoner': innhold = <Revisjoner gaaTil={gaaTil} />; break;
    case 'kontoer': innhold = <Kontoer />; break;
    case 'kategorier': innhold = <Kategorier />; break;
    case 'personer': innhold = <Personer />; break;
    case 'data': innhold = <Data />; break;
    case 'mer': innhold = <Mer gaaTil={gaaTil} tema={tema} byttTema={byttTema} />; break;
    default: innhold = <Oversikt gaaTil={gaaTil} />;
  }

  return (
    <div className="ramme">
      <nav className="sidebar" aria-label="Hovedmeny">
        <div className="merke">
          <img src={LOGO} width={28} height={28} alt="" />
          Familiebudsjett
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
          <h1>{TITLER[side] ?? 'Oversikt'}</h1>
          {visRevVelger && <RevisjonsVelger revisjoner={felles!.revisjoner} valgt={rev} velg={velgRev} nyRevisjon={() => gaaTil('revisjoner')} />}
          <Lagring status={status} />
        </header>

        <main className={`innhold${visFab ? ' med-fab' : ''}`}>
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
      {forerUtgift && <UtgiftSkjema privatStart={privatFab} lukk={() => { setForerUtgift(false); if (side === 'ny') gaaTil('oversikt'); }} />}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.tekst}</span>
          {toast.angre ? <button className="knapp liten" onClick={toast.angre}>Angre</button>
            : <button className="knapp liten ikon" onClick={() => visToast(null)} aria-label="Lukk"><Ikon navn="lukk" storrelse={16} /></button>}
        </div>
      )}
    </div>
  );
}
