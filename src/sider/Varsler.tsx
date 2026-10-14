// Varsler: slå på push-varsler på denne enheten, og velg hva og hvor tidlig du vil bli varslet.
// Varslene sendes av Edge Function «varsler» (supabase/kilde/varsler.ts) hver time. Logikk: logikk/varsler.ts.
// iPhone: virker bare når appen er lagt til på hjemskjermen (iOS 16.4+). Android: installert app eller Chrome.
import { useEffect, useRef, useState } from 'react';
import type { VarselEnhet, VarselInnstillinger, VarselType } from '../data/modell';
import { STANDARD_VARSLER } from '../data/modell';
import { lager } from '../data/lager';
import { useTilstand } from '../data/tilstand';
import { VAPID_OFFENTLIG } from '../data/varselnokkel';
import { Felt, IkonBoble, Ikon, Laster, datoTekst } from '../ui/felles';

const TYPER: { type: VarselType; ikon: string; navn: string; tekst: string; valg: number[] }[] = [
  { type: 'avtaler', ikon: 'kalender', navn: 'Avtaler i kalenderen', tekst: 'Oversikt over dagens avtaler på morgenen – eller morgendagens kvelden før.', valg: [0, 1] },
  { type: 'avtaleFor', ikon: 'klokke', navn: 'Før en avtale', tekst: 'Når avtalen har «varsel» (f.eks. 30 min før). Går til den/de avtalen gjelder eller som henter.', valg: [] },
  { type: 'bursdag', ikon: 'kake', navn: 'Bursdager', tekst: 'Fra gaveårene. Tidlig for å rekke å kjøpe gave, samme dag for å huske å gratulere.', valg: [0, 1, 3, 7, 14, 21, 28] },
  { type: 'jul', ikon: 'juletre', navn: 'Jul', tekst: 'Ett samlet varsel med hvor mange julegaver som er kjøpt.', valg: [1, 7, 14, 21, 28, 42] },
  { type: 'andre', ikon: 'fest', navn: 'Andre anledninger', tekst: 'Morsdag, farsdag, konfirmasjon, navnefest og lignende.', valg: [0, 1, 3, 7, 14, 21, 28] },
  { type: 'frist', ikon: 'liste', navn: 'Frister i lister', tekst: 'Punkter med «Husk innen»-dato som ikke er gjort.', valg: [0, 1, 2, 3, 7] },
  { type: 'kalender', ikon: 'lys', navn: 'Kalenderluker', tekst: 'F.eks. adventskalenderen – idéen for dagen.', valg: [0, 1] },
  { type: 'hage', ikon: 'spire', navn: 'Hagen', tekst: 'Den 1. i hver måned: hva som skal gjøres i hagen.', valg: [] },
];

const dagerNavn = (d: number) => (d === 0 ? 'Samme dag' : d === 1 ? '1 dag før' : d % 7 === 0 ? `${d / 7} ${d === 7 ? 'uke' : 'uker'} før` : `${d} dager før`);

const erIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const fraHjemskjerm = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const stottes = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function enhetsnavn(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'PC (Windows)';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Nettleser';
}

/** VAPID-nøkkelen som bytes (det PushManager vil ha) */
function tilBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const ut = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) ut[i] = s.charCodeAt(i);
  return ut;
}

const feiltekst = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e));

export function Varsler() {
  const { visToast } = useTilstand();
  const [inn, setInn] = useState<VarselInnstillinger | null>(null);
  const [lagretFor, setLagretFor] = useState(false);
  const [lagring, setLagring] = useState<'lagret' | 'lagrer' | 'feil' | null>(null);
  const [enheter, setEnheter] = useState<VarselEnhet[]>([]);
  const [mitt, setMitt] = useState<string | null>(null);
  const [tillatelse, setTillatelse] = useState<NotificationPermission | 'mangler'>(stottes() ? Notification.permission : 'mangler');
  const [jobber, setJobber] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const tidtaker = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    lager.hentVarselInnstillinger()
      .then((v) => { setLagretFor(!!v); setInn(v ? { ...STANDARD_VARSLER, ...v, typer: { ...STANDARD_VARSLER.typer, ...v.typer } } : structuredClone(STANDARD_VARSLER)); })
      .catch((e) => { setFeil(feiltekst(e)); setInn(structuredClone(STANDARD_VARSLER)); });
    lager.hentVarselEnheter().then(setEnheter).catch((e) => setFeil(feiltekst(e)));
    if (stottes()) navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setMitt(s?.endpoint ?? null)).catch(() => {});
  }, []);

  /** Lagrer litt etter siste endring, så ikke hvert trykk blir en lagring */
  function endre(ny: VarselInnstillinger) {
    setInn(ny);
    setLagring('lagrer');
    clearTimeout(tidtaker.current);
    tidtaker.current = setTimeout(() => {
      lager.lagreVarselInnstillinger(ny).then(() => { setLagring('lagret'); setLagretFor(true); }).catch((e) => { setLagring('feil'); setFeil(feiltekst(e)); });
    }, 600);
  }

  async function slaaPa() {
    setJobber(true);
    setFeil(null);
    try {
      const svar = await Notification.requestPermission();
      setTillatelse(svar);
      if (svar !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: tilBytes(VAPID_OFFENTLIG) });
      await lager.lagreVarselEnhet(sub.toJSON(), enhetsnavn());
      // Uten lagrede innstillinger tar ikke timejobben med deg
      if (!lagretFor && inn) { await lager.lagreVarselInnstillinger(inn); setLagretFor(true); }
      setMitt(sub.endpoint);
      setEnheter(await lager.hentVarselEnheter());
      visToast({ tekst: 'Varsler er på. Nå husker vi for deg.' });
    } catch (e) {
      setFeil(feiltekst(e));
    } finally {
      setJobber(false);
    }
  }

  async function slaaAv(endpoint: string) {
    setFeil(null);
    try {
      if (endpoint === mitt) {
        const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
        await sub?.unsubscribe();
        setMitt(null);
      }
      await lager.slettVarselEnhet(endpoint);
      setEnheter(await lager.hentVarselEnheter());
    } catch (e) {
      setFeil(feiltekst(e));
    }
  }

  async function test() {
    setJobber(true);
    setFeil(null);
    try {
      const n = await lager.sendTestvarsel();
      visToast({ tekst: n ? `Testvarsel sendt til ${n} ${n === 1 ? 'enhet' : 'enheter'}` : 'Ingen enheter mottok varselet' });
    } catch (e) {
      setFeil(`Testvarselet kom ikke fram. Er funksjonen «varsler» satt opp i Supabase? (${feiltekst(e)})`);
    } finally {
      setJobber(false);
    }
  }

  if (!inn) return <Laster />;
  const sett = (type: VarselType, endring: Partial<VarselInnstillinger['typer'][VarselType]>) =>
    endre({ ...inn, typer: { ...inn.typer, [type]: { ...inn.typer[type], ...endring } } });

  let enhetsstatus;
  if (!stottes() && erIos() && !fraHjemskjerm()) {
    enhetsstatus = (
      <div className="banner info">
        <Ikon navn="info" />
        <div>
          <strong>Legg appen på hjemskjermen først</strong>
          <p>På iPhone virker varsler bare fra hjemskjermen: trykk på Del-knappen i Safari → «Legg til på Hjem-skjerm». Åpne appen derfra og kom tilbake hit. Krever iOS 16.4 eller nyere.</p>
        </div>
      </div>
    );
  } else if (!stottes()) {
    enhetsstatus = <div className="banner varsel"><Ikon navn="advarsel" /><div>Denne nettleseren støtter ikke varsler. På Android: bruk Chrome og installer appen.</div></div>;
  } else if (tillatelse === 'denied') {
    enhetsstatus = (
      <div className="banner varsel">
        <Ikon navn="advarsel" />
        <div><strong>Varsler er blokkert</strong><p>Slå dem på igjen i innstillingene: iPhone → Innstillinger → Varslinger → Sulamitten. Android → hold inne appikonet → Appinfo → Varsler.</p></div>
      </div>
    );
  } else {
    enhetsstatus = (
      <label className="rad" style={{ cursor: 'pointer', borderBottom: 0 }}>
        <Ikon navn="bjelle" />
        <span className="hoved"><span className="navn">Varsler på denne enheten</span><span className="info">{enhetsnavn()}{mitt ? ' · på' : ''}</span></span>
        <input type="checkbox" className="bryter" checked={!!mitt} disabled={jobber}
          onChange={(e) => void (e.target.checked ? slaaPa() : mitt && slaaAv(mitt))} />
      </label>
    );
  }

  return (
    <>
      {lager.modus === 'lokal' && (
        <div className="banner info"><Ikon navn="info" /><div><strong>Demomodus:</strong> ingen server sender varsler. Innstillingene lagres i nettleseren, og testvarselet vises bare her.</div></div>
      )}
      {feil && <div className="banner feil" role="alert"><Ikon navn="advarsel" /><div><strong>Varslene ville ikke helt som vi ville.</strong><p className="liten">{feil}</p></div></div>}

      <section className="kort">
        <div className="kort-hode">
          <div className="tittel"><h2>Enheter</h2><span className="dempet liten">Varslene kommer på alle enhetene der du har slått dem på</span></div>
          <button className="knapp liten" onClick={() => void test()} disabled={jobber || !enheter.length}><Ikon navn="bjelle" storrelse={16} />Send testvarsel</button>
        </div>
        {enhetsstatus}
        {enheter.length > 0 && (
          <div className="liste" style={{ marginTop: 8 }}>
            {enheter.map((e) => (
              <div className="rad" key={e.endpoint}>
                <Ikon navn={/iPhone|Android|iPad/.test(e.enhet) ? 'mobil' : 'skjerm'} storrelse={18} />
                <span className="hoved"><span className="navn">{e.enhet || 'Enhet'}</span><span className="info">Slått på {datoTekst(e.opprettet.slice(0, 10))}</span></span>
                {e.endpoint === mitt && <span className="merkelapp bra">Denne</span>}
                <button className="knapp flat ikon liten" onClick={() => void slaaAv(e.endpoint)} aria-label={`Slå av varsler på ${e.enhet}`}><Ikon navn="lukk" storrelse={16} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="kort">
        <div className="kort-hode">
          <div className="tittel"><h2>Hva du vil bli varslet om</h2><span className="dempet liten">Gjelder alle enhetene dine. Private lister varsles bare til deg.</span></div>
          {lagring && <span className={`lagring ${lagring === 'lagrer' ? 'lagrer' : lagring === 'feil' ? 'feil' : ''}`}><span className="punkt" />{lagring === 'lagrer' ? 'Lagrer …' : lagring === 'feil' ? 'Ikke lagret' : 'Lagret'}</span>}
        </div>

        <div className="felt-rad" style={{ marginBottom: 8 }}>
          <Felt etikett="Klokkeslett" hjelp="Daglige varsler kommer rundt dette tidspunktet. «Før en avtale» kommer når det er tid.">
            <select value={inn.time} onChange={(e) => endre({ ...inn, time: Number(e.target.value) })}>
              {Array.from({ length: 17 }, (_, i) => i + 6).map((t) => <option key={t} value={t}>{String(t).padStart(2, '0')}:00</option>)}
            </select>
          </Felt>
        </div>
        <label className="rad" style={{ cursor: 'pointer' }}>
          <span className="hoved"><span className="navn" style={{ whiteSpace: 'normal' }}>Tidlige gavevarsler bare hvis ingen gave er kjøpt</span><span className="info" style={{ whiteSpace: 'normal' }}>Varselet på selve dagen kommer uansett.</span></span>
          <input type="checkbox" className="bryter" checked={inn.bareUtenGave} onChange={(e) => endre({ ...inn, bareUtenGave: e.target.checked })} />
        </label>
        <label className="rad" style={{ cursor: 'pointer' }}>
          <Ikon navn={inn.skjulDetaljer ? 'oyeAv' : 'oye'} />
          <span className="hoved">
            <span className="navn" style={{ whiteSpace: 'normal' }}>Skjul detaljer på låseskjermen</span>
            <span className="info" style={{ whiteSpace: 'normal' }}>{inn.skjulDetaljer
              ? 'Varslene sier bare at det er noe nytt i Sulamitten – ingen navn, gaver eller avtaler. Åpne appen for å se hva.'
              : 'Varslene viser navn, gaver og avtaler. Slå på hvis andre ofte ser telefonen din.'}</span>
          </span>
          <input type="checkbox" className="bryter" checked={!!inn.skjulDetaljer} onChange={(e) => endre({ ...inn, skjulDetaljer: e.target.checked })} />
        </label>

        <div className="varseltyper">
          {TYPER.map((t) => {
            const v = inn.typer[t.type];
            return (
              <div className="varseltype" key={t.type}>
                <label className="rad" style={{ cursor: 'pointer', borderBottom: 0 }}>
                  <IkonBoble ikon={t.ikon} storrelse="liten" />
                  <span className="hoved"><span className="navn">{t.navn}</span><span className="info" style={{ whiteSpace: 'normal' }}>{t.tekst}</span></span>
                  <input type="checkbox" className="bryter" checked={v.pa} onChange={(e) => sett(t.type, { pa: e.target.checked })} />
                </label>
                {v.pa && t.valg.length > 0 && (
                  <div className="valgchips varsel-valg" role="group" aria-label={`Når for ${t.navn}`}>
                    {t.valg.map((d) => {
                      const pa = v.dager.includes(d);
                      return (
                        <button key={d} type="button" role="checkbox" aria-checked={pa}
                          // Minst ett tidspunkt må være valgt
                          onClick={() => !(pa && v.dager.length === 1) && sett(t.type, { dager: pa ? v.dager.filter((x) => x !== d) : [...v.dager, d].sort((a, b) => b - a) })}>
                          {pa && <Ikon navn="sjekk" storrelse={14} />}{dagerNavn(d)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
