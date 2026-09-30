// Oppsett: kontoer og banker, kategorier, personer og fordeling, data (import/eksport) og Mer-menyen.
import { useRef, useState } from 'react';
import type { Bank, FellesDok, Kategori, Konto, KontoRolle, Person, PrivatDok } from '../data/modell';
import { ROLLE_NAVN, nyId } from '../data/modell';
import { useTilstand } from '../data/tilstand';
import { lager } from '../data/lager';
import { Avatar, Ikon, Prikk, kr, pst } from '../ui/felles';
import { BankSkjema, KategoriSkjema, KontoSkjema, PersonSkjema } from '../ui/skjemaer';

// ---------------------------------------------------------------- Kontoer og banker

function kontoIBruk(d: FellesDok, id: string): number {
  let n = 0;
  for (const r of d.revisjoner) {
    n += r.poster.filter((p) => p.kontoId === id).length;
    n += r.inntekter.filter((i) => i.tilKontoId === id).length;
    n += r.overforinger.filter((o) => o.fraKontoId === id || o.tilKontoId === id).length;
  }
  return n;
}

function kontoIPrivat(d: PrivatDok | null, id: string): number {
  return d?.revisjoner.reduce((n, r) => n + r.poster.filter((p) => p.kontoId === id).length, 0) ?? 0;
}

export function Kontoer() {
  const { felles, privat, meg, endreFelles, endrePrivat, visToast } = useTilstand();
  const [konto, setKonto] = useState<{ k: Konto; privat: boolean } | 'ny' | null>(null);
  const [bank, setBank] = useState<Bank | 'ny' | null>(null);
  if (!felles) return null;
  const bankNavn = (id: string | null) => felles.banker.find((b) => b.id === id)?.navn;
  const roller: KontoRolle[] = ['avsender', 'sparing', 'felles'];
  // Den andres lønnskonto trengs i fellesbudsjettet, men skjules her
  const mine = (k: Konto) => !meg || !k.eierId || k.eierId === meg.id;
  const skjulte = felles.kontoer.filter((k) => !mine(k));
  const andreNavn = [...new Set(skjulte.map((k) => felles.personer.find((p) => p.id === k.eierId)?.navn).filter(Boolean))].join(' og ');
  const egne = privat?.kontoer ?? [];

  function nyBank(navn: string) {
    const id = nyId();
    endreFelles((d) => { d.banker.push({ id, navn }); });
    return id;
  }

  const oppdater = (liste: Konto[], k: Konto) => { const i = liste.findIndex((x) => x.id === k.id); if (i >= 0) liste[i] = k; else liste.push(k); };

  function lagre(k: Konto, tilPrivat: boolean) {
    const fraPrivat = konto !== 'ny' && konto?.privat;
    const flyttes = konto !== 'ny' && konto && fraPrivat !== tilPrivat;
    if (flyttes && tilPrivat) {
      const n = kontoIBruk(felles!, k.id);
      if (n > 0) { visToast({ tekst: `Kontoen brukes ${n} steder i fellesbudsjettet. Flytt postene og overføringene først.` }); return; }
      endreFelles((d) => { d.kontoer = d.kontoer.filter((x) => x.id !== k.id); });
    }
    if (flyttes && !tilPrivat) {
      const n = kontoIPrivat(privat, k.id);
      if (n > 0) { visToast({ tekst: `Kontoen brukes i ${n} private poster. Flytt dem først.` }); return; }
      endrePrivat((d) => { d.kontoer = d.kontoer.filter((x) => x.id !== k.id); });
    }
    if (tilPrivat) endrePrivat((d) => oppdater(d.kontoer, k));
    else endreFelles((d) => oppdater(d.kontoer, k));
    if (flyttes) visToast({ tekst: tilPrivat ? `«${k.navn}» er nå privat` : `«${k.navn}» er nå felles` });
    setKonto(null);
  }

  const rad = (k: Konto, erPrivat: boolean) => (
    <button className="rad" key={k.id} onClick={() => setKonto({ k, privat: erPrivat })}>
      <Ikon navn={erPrivat ? 'privat' : 'konto'} storrelse={18} />
      <span className="hoved">
        <span className="navn">{k.navn}</span>
        <span className="info">
          {[erPrivat ? ROLLE_NAVN[k.rolle] : null, bankNavn(k.bankId), k.kontonr, !erPrivat && k.rolle === 'avsender' ? felles.personer.find((p) => p.id === k.eierId)?.navn : null, k.sparemaal ? `Mål ${kr(k.sparemaal.maal)}` : null].filter(Boolean).join(' · ')}
        </span>
      </span>
      <Ikon navn="pilhoyre" storrelse={16} />
    </button>
  );

  return (
    <>
      <section className="kort">
        <div className="kort-hode">
          <div className="tittel"><h2>Kontoer</h2><span className="dempet liten">Kontonumre lagres maskert</span></div>
          <button className="knapp primar liten" onClick={() => setKonto('ny')}><Ikon navn="pluss" storrelse={18} />Ny konto</button>
        </div>
        {roller.map((rolle) => {
          const liste = felles.kontoer.filter((k) => k.rolle === rolle && mine(k));
          if (!liste.length) return null;
          return (
            <div key={rolle}>
              <div className="gruppe-hode"><span className="navn">{ROLLE_NAVN[rolle]}er</span></div>
              <div className="liste">{liste.map((k) => rad(k, false))}</div>
            </div>
          );
        })}
        {meg && egne.length > 0 && (
          <div>
            <div className="gruppe-hode"><span className="navn">Mine private kontoer</span><span className="dempet liten">Bare du ser disse</span></div>
            <div className="liste">{egne.map((k) => rad(k, true))}</div>
          </div>
        )}
        {skjulte.length > 0 && (
          <p className="dempet liten" style={{ padding: '12px 4px 0' }}>
            {skjulte.length === 1 ? 'Én konto' : `${skjulte.length} kontoer`} som tilhører {andreNavn || 'andre'} er skjult. De brukes fortsatt i fellesbudsjettet.
          </p>
        )}
      </section>

      <section className="kort">
        <div className="kort-hode">
          <h2>Banker</h2>
          <button className="knapp liten" onClick={() => setBank('ny')}><Ikon navn="pluss" storrelse={18} />Ny bank</button>
        </div>
        <div className="liste">
          {felles.banker.map((b) => (
            <button className="rad" key={b.id} onClick={() => setBank(b)}>
              <Ikon navn="bank" storrelse={18} />
              <span className="hoved"><span className="navn">{b.navn}</span><span className="info">{felles.kontoer.filter((k) => k.bankId === b.id).length} kontoer</span></span>
              <Ikon navn="pilhoyre" storrelse={16} />
            </button>
          ))}
        </div>
      </section>

      {konto && (
        <KontoSkjema
          konto={konto === 'ny' ? undefined : konto.k} privat={konto !== 'ny' && konto.privat}
          meg={privat ? meg ?? undefined : undefined}
          banker={felles.banker} personer={felles.personer} nyBank={nyBank}
          lukk={() => setKonto(null)}
          lagre={lagre}
          slett={konto === 'ny' ? undefined : () => {
            const { k, privat: erPrivat } = konto;
            const n = erPrivat ? kontoIPrivat(privat, k.id) : kontoIBruk(felles, k.id);
            if (n > 0) { visToast({ tekst: `Kontoen brukes ${n} steder. Flytt postene og overføringene først.` }); return; }
            if (erPrivat) endrePrivat((d) => { d.kontoer = d.kontoer.filter((x) => x.id !== k.id); }, `Slettet «${k.navn}»`);
            else endreFelles((d) => { d.kontoer = d.kontoer.filter((x) => x.id !== k.id); }, `Slettet «${k.navn}»`);
            setKonto(null);
          }}
        />
      )}
      {bank && (
        <BankSkjema
          bank={bank === 'ny' ? undefined : bank} lukk={() => setBank(null)}
          lagre={(b) => { endreFelles((d) => { const i = d.banker.findIndex((x) => x.id === b.id); if (i >= 0) d.banker[i] = b; else d.banker.push(b); }); setBank(null); }}
          slett={bank === 'ny' ? undefined : () => {
            endreFelles((d) => {
              d.banker = d.banker.filter((x) => x.id !== bank.id);
              for (const k of d.kontoer) if (k.bankId === bank.id) k.bankId = null;
            }, `Slettet «${bank.navn}»`);
            setBank(null);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Kategorier

export function Kategorier() {
  const { felles, privat, endreFelles } = useTilstand();
  const [valgt, setValgt] = useState<Kategori | 'ny' | null>(null);
  if (!felles) return null;
  const antall = (id: string) => felles.revisjoner.reduce((s, r) => s + r.poster.filter((p) => p.kategoriId === id).length, 0)
    + (privat?.revisjoner.reduce((s, r) => s + r.poster.filter((p) => p.kategoriId === id).length, 0) ?? 0);

  return (
    <section className="kort">
      <div className="kort-hode">
        <div className="tittel"><h2>Kategorier</h2><span className="dempet liten">Felles for begge – brukes også i privatbudsjettene</span></div>
        <button className="knapp primar liten" onClick={() => setValgt('ny')}><Ikon navn="pluss" storrelse={18} />Ny kategori</button>
      </div>
      <div className="liste">
        {felles.kategorier.map((k) => (
          <button className="rad" key={k.id} onClick={() => setValgt(k)}>
            <Prikk farge={k.farge} />
            <span className="hoved"><span className="navn">{k.navn}</span><span className="info">{antall(k.id)} poster</span></span>
            <Ikon navn="pilhoyre" storrelse={16} />
          </button>
        ))}
      </div>
      {felles.kategorier.length > 8 && (
        <div className="banner varsel" style={{ marginTop: 12 }}><Ikon navn="info" /><div>Mer enn 8 kategorier gjør at farger går igjen. Vurder å slå sammen noen.</div></div>
      )}
      {valgt && (
        <KategoriSkjema
          kategori={valgt === 'ny' ? undefined : valgt} alle={felles.kategorier}
          antallPoster={valgt === 'ny' ? 0 : antall(valgt.id)}
          lukk={() => setValgt(null)}
          lagre={(k) => { endreFelles((d) => { const i = d.kategorier.findIndex((x) => x.id === k.id); if (i >= 0) d.kategorier[i] = k; else d.kategorier.push(k); }); setValgt(null); }}
          slett={valgt === 'ny' ? undefined : (flyttTil) => {
            endreFelles((d) => {
              d.kategorier = d.kategorier.filter((x) => x.id !== valgt.id);
              if (flyttTil) for (const r of d.revisjoner) for (const p of r.poster) if (p.kategoriId === valgt.id) p.kategoriId = flyttTil;
            }, `Slettet «${valgt.navn}»`);
            // Merk: poster i den andres privatbudsjett kan vi ikke se – de vises som «Uten kategori» til de flyttes.
            setValgt(null);
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Personer og fordeling

export function Personer() {
  const { felles, rev, endreFelles, visToast } = useTilstand();
  const [valgt, setValgt] = useState<Person | 'ny' | null>(null);
  if (!felles) return null;
  const sumAndel = rev ? felles.personer.reduce((s, p) => s + (rev.andeler[p.id] ?? 0), 0) : 0;

  function settAndel(personId: string, verdi: number) {
    endreFelles((d) => {
      const r = d.revisjoner.find((x) => x.id === rev!.id)!;
      r.andeler[personId] = verdi;
      // Med to personer holdes summen automatisk på 100
      if (d.personer.length === 2) {
        const annen = d.personer.find((p) => p.id !== personId)!;
        r.andeler[annen.id] = Math.round((100 - verdi) * 10) / 10;
      }
    });
  }

  return (
    <>
      <section className="kort">
        <div className="kort-hode">
          <div className="tittel"><h2>Personer</h2><span className="dempet liten">Kobles til Google-innloggingen via e-post</span></div>
          <button className="knapp liten" onClick={() => setValgt('ny')}><Ikon navn="pluss" storrelse={18} />Ny person</button>
        </div>
        <div className="liste">
          {felles.personer.map((p) => (
            <button className="rad" key={p.id} onClick={() => setValgt(p)}>
              <Avatar navn={p.navn} />
              <span className="hoved"><span className="navn">{p.navn}</span><span className="info">{p.epost}</span></span>
              <Ikon navn="pilhoyre" storrelse={16} />
            </button>
          ))}
        </div>
      </section>

      {rev && (
        <section className="kort">
          <div className="kort-hode">
            <div className="tittel"><h2>Fordeling av felleskostnader</h2><span className="dempet liten">Gjelder «{rev.navn}»</span></div>
            {Math.abs(sumAndel - 100) > 0.05 && <span className="merkelapp feil"><Ikon navn="advarsel" storrelse={12} />Sum {pst(sumAndel)}</span>}
          </div>
          <div className="skjema">
            {felles.personer.map((p) => (
              <label className="felt" key={p.id}>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}>{p.navn}<span className="tall">{pst(rev.andeler[p.id] ?? 0)}</span></span>
                <input type="range" min={0} max={100} step={1} value={rev.andeler[p.id] ?? 0}
                  onChange={(e) => settAndel(p.id, Number(e.target.value))} style={{ minHeight: 32, accentColor: 'var(--aksent)', padding: 0, border: 0 }} />
              </label>
            ))}
            <p className="dempet liten">Hver persons mål = andel × sum av postene (rundet opp). Hvilke kontoer hver overfører til velger dere fritt under Budsjett → Overføringer.</p>
          </div>
        </section>
      )}

      {valgt && (
        <PersonSkjema
          person={valgt === 'ny' ? undefined : valgt} lukk={() => setValgt(null)}
          lagre={(p) => { endreFelles((d) => { const i = d.personer.findIndex((x) => x.id === p.id); if (i >= 0) d.personer[i] = p; else d.personer.push(p); }); setValgt(null); }}
          slett={valgt === 'ny' ? undefined : () => {
            if (felles.kontoer.some((k) => k.eierId === valgt.id) || felles.revisjoner.some((r) => r.inntekter.some((i) => i.personId === valgt.id))) {
              visToast({ tekst: 'Personen har kontoer eller inntekter. Fjern dem først.' });
              return;
            }
            endreFelles((d) => { d.personer = d.personer.filter((x) => x.id !== valgt.id); }, `Slettet «${valgt.navn}»`);
            setValgt(null);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Data: import og eksport

function lastNed(navn: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = navn;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Data() {
  const { felles, privat, meg, bruker, erstattFelles, erstattPrivat, visToast } = useTilstand();
  const fil = useRef<HTMLInputElement>(null);
  const [melding, setMelding] = useState<string | null>(null);

  async function importer(f: File) {
    try {
      const innhold = JSON.parse(await f.text()) as { felles?: FellesDok; privat?: PrivatDok };
      if (!innhold.felles && !innhold.privat) throw new Error('Fila inneholder verken «felles» eller «privat».');
      if (innhold.felles && felles?.revisjoner.length && !confirm('Dette erstatter hele fellesbudsjettet for dere begge. Fortsette?')) return;
      const ut: string[] = [];
      if (innhold.felles) { erstattFelles(innhold.felles); ut.push('fellesbudsjettet'); }
      if (innhold.privat) {
        const personer = innhold.felles?.personer ?? felles?.personer ?? [];
        const person = personer.find((p) => p.epost.toLowerCase() === bruker?.epost.toLowerCase());
        if (!person) throw new Error(`Fant ingen person med e-post ${bruker?.epost} – privatbudsjettet ble ikke importert.`);
        if (person.id !== innhold.privat.eierId) throw new Error('Privatbudsjettet i fila tilhører en annen person enn deg.');
        erstattPrivat(innhold.privat);
        ut.push('ditt privatbudsjett');
      }
      setMelding(`Importerte ${ut.join(' og ')}.`);
    } catch (e) {
      setMelding(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <section className="kort">
        <div className="kort-hode"><div className="tittel"><h2>Eksport</h2><span className="dempet liten">Sikkerhetskopi som JSON-fil</span></div></div>
        <div className="knapperad">
          <button className="knapp" onClick={() => lastNed(`familiebudsjett-felles-${new Date().toISOString().slice(0, 10)}.json`, { felles })}><Ikon navn="lastned" storrelse={18} />Fellesbudsjett</button>
          {privat && meg && <button className="knapp" onClick={() => lastNed(`familiebudsjett-privat-${meg.navn.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`, { privat })}><Ikon navn="lastned" storrelse={18} />Mitt privatbudsjett</button>}
        </div>
      </section>

      <section className="kort">
        <div className="kort-hode"><div className="tittel"><h2>Import</h2><span className="dempet liten">Fra eksportfil eller fra Excel-importen (npm run importer)</span></div></div>
        <input ref={fil} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importer(f); e.target.value = ''; }} />
        <button className="knapp" onClick={() => fil.current?.click()}><Ikon navn="lastopp" storrelse={18} />Velg fil …</button>
        {melding && <div className="banner info" style={{ marginTop: 12 }}><Ikon navn="info" /><div>{melding}</div></div>}
      </section>

      {lager.modus === 'lokal' && (
        <section className="kort">
          <div className="kort-hode"><div className="tittel"><h2>Demomodus</h2><span className="dempet liten">Data lagres bare i denne nettleseren</span></div></div>
          <div className="knapperad">
            {felles?.personer.map((p) => (
              <button key={p.id} className="knapp" disabled={p.id === meg?.id} onClick={async () => { await lager.loggInn(p.epost); location.reload(); }}>
                <Avatar navn={p.navn} />Se som {p.navn}
              </button>
            ))}
            <button className="knapp fare" onClick={() => {
              if (!confirm('Slette alle lokale data og starte på nytt med demodata?')) return;
              try { Object.keys(localStorage).filter((k) => k.startsWith('familie.')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignorer */ }
              location.reload();
            }}><Ikon navn="slett" storrelse={18} />Tilbakestill</button>
          </div>
        </section>
      )}
      {lager.modus === 'supabase' && !felles?.revisjoner.length && (
        <section className="kort">
          <div className="kort-hode"><h2>Start med tomt budsjett</h2></div>
          <p className="dempet" style={{ marginBottom: 12 }}>Oppretter et budsjett med deg som eneste person. Du kan legge til resten etterpå.</p>
          <button className="knapp primar" onClick={() => {
            const id = nyId();
            erstattFelles({
              skjema: 1, personer: [{ id, navn: bruker!.navn.split(' ')[0], epost: bruker!.epost.toLowerCase() }], banker: [], kontoer: [],
              kategorier: ['Bolig', 'Forsikring', 'Mat og husholdning', 'Barn', 'Abonnementer', 'Sparing', 'Transport', 'Personlig'].map((navn, i) => ({ id: nyId(), navn, farge: i })),
              revisjoner: [{ id: nyId(), navn: 'Første budsjett', gjelderFra: new Date().toISOString().slice(0, 10), notat: '', andeler: { [id]: 100 }, avrundingSteg: 500, inntekter: [], poster: [], overforinger: [] }],
            });
            visToast({ tekst: 'Budsjett opprettet' });
          }}>Opprett</button>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Mer (mobilmeny)

export function Mer({ gaaTil, tema, byttTema }: { gaaTil: (r: string) => void; tema: string; byttTema: () => void }) {
  const { bruker, loggUt } = useTilstand();
  const valg: [string, string, string][] = [
    ['sparing', 'sparing', 'Sparemål'],
    ['revisjoner', 'revisjon', 'Revisjoner'],
    ['kontoer', 'konto', 'Kontoer og banker'],
    ['kategorier', 'kategori', 'Kategorier'],
    ['personer', 'person', 'Personer og fordeling'],
    ['data', 'lastned', 'Import og eksport'],
  ];
  return (
    <>
      <section className="kort">
        <div className="rad" style={{ borderBottom: 0 }}>
          <Avatar navn={bruker?.navn ?? '?'} bilde={bruker?.bilde} />
          <span className="hoved"><span className="navn">{bruker?.navn}</span><span className="info">{bruker?.epost}</span></span>
        </div>
      </section>
      <section className="kort" style={{ padding: '4px 16px' }}>
        <div className="liste">
          {valg.map(([rute, ikon, tekst]) => (
            <button key={rute} className="rad" onClick={() => gaaTil(rute)}>
              <Ikon navn={ikon} /><span className="hoved"><span className="navn">{tekst}</span></span><Ikon navn="pilhoyre" storrelse={16} />
            </button>
          ))}
          <button className="rad" onClick={byttTema}>
            <Ikon navn={tema === 'mork' ? 'mane' : 'sol'} /><span className="hoved"><span className="navn">Tema</span><span className="info">{tema === 'auto' ? 'Følger telefonen' : tema === 'mork' ? 'Mørkt' : 'Lyst'}</span></span>
          </button>
          <button className="rad" onClick={() => void loggUt()}>
            <Ikon navn="loggut" /><span className="hoved"><span className="navn">Logg ut</span></span>
          </button>
        </div>
      </section>
    </>
  );
}
