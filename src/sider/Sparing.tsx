// Sparemål: fremdrift per sparekonto. Felles kontoer for begge, egne kontoer bare for eieren.
import { useState } from 'react';
import type { Konto } from '../data/modell';
import { nyId } from '../data/modell';
import { useTilstand } from '../data/tilstand';
import { postMnd, sum, tilMnd } from '../logikk/beregning';
import { Ikon, Kpi, Tom, datoTekst, kr, pst } from '../ui/felles';
import { KontoSkjema } from '../ui/skjemaer';

export function Sparing() {
  const { felles, privat, meg, rev, prev, endreFelles, endrePrivat } = useTilstand();
  const [redigerer, setRedigerer] = useState<{ konto?: Konto; privat: boolean } | null>(null);
  if (!felles) return null;

  const fellesMaal = felles.kontoer.filter((k) => k.sparemaal);
  const egneMaal = privat?.kontoer.filter((k) => k.sparemaal) ?? [];

  /** Månedlig innskudd. Felles: det som faktisk kommer inn (overføringer + inntekter), men minst
   *  summen av postene – ellers teller barnetrygd både som inntekt og som post. Privat: postene. */
  const perMnd = (k: Konto) => {
    const poster = sum(rev?.poster.filter((p) => p.kontoId === k.id) ?? [], postMnd);
    const inn = sum(rev?.overforinger.filter((o) => o.tilKontoId === k.id) ?? [], (o) => o.belop)
      + sum(rev?.inntekter.filter((i) => i.tilKontoId === k.id) ?? [], (i) => tilMnd(i.belop, i.frekvens));
    return Math.max(poster, inn) + sum(prev?.poster.filter((p) => p.kontoId === k.id) ?? [], postMnd);
  };

  const alle = [...fellesMaal, ...egneMaal];
  const totalSaldo = sum(alle, (k) => k.sparemaal!.saldo);
  const totalMaal = sum(alle, (k) => k.sparemaal!.maal);
  const totalMnd = sum(alle, perMnd);

  function lagre(k: Konto, erPrivat: boolean) {
    const oppdater = (liste: Konto[]) => { const i = liste.findIndex((x) => x.id === k.id); if (i >= 0) liste[i] = k; else liste.push(k); };
    if (erPrivat) endrePrivat((d) => oppdater(d.kontoer));
    else endreFelles((d) => oppdater(d.kontoer));
    setRedigerer(null);
  }

  function nyBank(navn: string) {
    const id = nyId();
    endreFelles((d) => { d.banker.push({ id, navn }); });
    return id;
  }

  const kort = (k: Konto, erPrivat: boolean) => {
    const m = k.sparemaal!;
    const andel = m.maal > 0 ? Math.min(1, m.saldo / m.maal) : 0;
    const mnd = perMnd(k);
    const rest = m.maal - m.saldo;
    const mndTil = rest > 0 && mnd > 0 ? Math.ceil(rest / mnd) : null;
    const naas = mndTil ? new Date(new Date().getFullYear(), new Date().getMonth() + mndTil, 1).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' }) : null;
    return (
      <button key={k.id} className="kort" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer' }}
        onClick={() => setRedigerer({ konto: k, privat: erPrivat })}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{k.navn}</div>
            <div className="dempet liten">{felles.banker.find((b) => b.id === k.bankId)?.navn ?? 'Ingen bank'} {k.kontonr} {m.rente ? `· ${pst(m.rente)} rente` : ''}</div>
          </div>
          {rest <= 0
            ? <span className="merkelapp bra"><Ikon navn="sjekk" storrelse={12} />Nådd</span>
            : <span className="merkelapp">{pst(andel * 100)}</span>}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
            <span className="tall" style={{ fontSize: 22, fontWeight: 600 }}>{kr(m.saldo)}</span>
            <span className="dempet liten">av {kr(m.maal)}</span>
          </div>
          <div className="stolpe" role="progressbar" aria-valuenow={Math.round(andel * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${andel * 100}%`, background: rest <= 0 ? 'var(--bra)' : 'var(--aksent)' }} />
          </div>
        </div>
        <div className="dempet liten" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span>{mnd > 0 ? `+${kr(mnd)} per måned` : 'Ingen fast sparing'}</span>
          <span>{rest <= 0 ? `${kr(-rest)} over målet` : naas ? `Nås ca. ${naas}` : `${kr(rest)} igjen`}</span>
        </div>
        <div className="dempet" style={{ fontSize: 11 }}>Saldo per {datoTekst(m.saldoDato)} · trykk for å oppdatere</div>
      </button>
    );
  };

  return (
    <>
      <div className="kpi-rad">
        <Kpi hero etikett="Spart totalt" verdi={kr(totalSaldo)} under={totalMaal ? `${pst((totalSaldo / totalMaal) * 100)} av samlet mål ${kr(totalMaal)}` : undefined} />
        <Kpi etikett="Spares per måned" verdi={kr(totalMnd)} />
        <Kpi etikett="Igjen til målene" verdi={kr(Math.max(0, totalMaal - totalSaldo))} />
        <Kpi etikett="Sparemål" verdi={alle.length} under={`${alle.filter((k) => k.sparemaal!.saldo >= k.sparemaal!.maal).length} nådd`} />
      </div>

      <section>
        <div className="kort-hode"><h2>Felles sparemål</h2></div>
        {fellesMaal.length === 0
          ? <div className="kort"><Tom ikon="sparing" tittel="Ingen felles sparemål" tekst="Slå på «Sparemål» på en konto under Kontoer." /></div>
          : <div className="rutenett to">{fellesMaal.map((k) => kort(k, false))}</div>}
      </section>

      {meg && privat && (
        <section>
          <div className="kort-hode">
            <div className="tittel"><h2>Mine sparemål</h2><span className="dempet liten"><Ikon navn="privat" storrelse={12} /> Bare synlig for deg</span></div>
            <button className="knapp liten" onClick={() => setRedigerer({ privat: true })}><Ikon navn="pluss" storrelse={18} />Ny sparekonto</button>
          </div>
          {egneMaal.length === 0
            ? <div className="kort"><Tom ikon="sparing" tittel="Ingen egne sparemål" tekst="F.eks. bufferkonto, fond eller BSU." /></div>
            : <div className="rutenett to">{egneMaal.map((k) => kort(k, true))}</div>}
        </section>
      )}

      {redigerer && (
        <KontoSkjema
          konto={redigerer.konto} banker={felles.banker} personer={felles.personer}
          bareSparing={redigerer.privat && meg ? { eierId: meg.id } : undefined}
          nyBank={nyBank}
          lukk={() => setRedigerer(null)}
          lagre={(k) => lagre(k, redigerer.privat)}
          slett={redigerer.privat && redigerer.konto ? () => {
            endrePrivat((d) => { d.kontoer = d.kontoer.filter((x) => x.id !== redigerer.konto!.id); }, `Slettet «${redigerer.konto!.navn}»`);
            setRedigerer(null);
          } : undefined}
        />
      )}
    </>
  );
}
