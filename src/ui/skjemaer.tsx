// Redigeringsskjemaer. Alle vises i et Ark og kaller lagre()/slett() – de endrer ingenting selv.
import { useState, type FormEvent, type ReactNode } from 'react';
import type { Bank, Frekvens, Id, Inntekt, Kategori, Konto, KontoRolle, Overforing, Person, Post } from '../data/modell';
import { FREKVENS_NAVN, ROLLE_NAVN, nyId } from '../data/modell';
import { tilMnd } from '../logikk/beregning';
import { Ark, BelopFelt, Fargevalg, Felt, Ikon, Segment, kr } from './felles';

function Knapper({ slett, slettTekst = 'Slett', kanLagre = true, lukk }: { slett?: () => void; slettTekst?: string; kanLagre?: boolean; lukk: () => void }) {
  const [bekreft, setBekreft] = useState(false);
  return (
    <div className="knapperad slutt" style={{ marginTop: 8 }}>
      {slett && (
        bekreft
          ? <button type="button" className="knapp fare dytt" onClick={slett}><Ikon navn="slett" storrelse={18} />Bekreft sletting</button>
          : <button type="button" className="knapp flat fare dytt" onClick={() => setBekreft(true)}><Ikon navn="slett" storrelse={18} />{slettTekst}</button>
      )}
      <button type="button" className="knapp" onClick={lukk}>Avbryt</button>
      <button type="submit" className="knapp primar" disabled={!kanLagre}>Lagre</button>
    </div>
  );
}

function Skjema({ tittel, lukk, lagre, children }: { tittel: string; lukk: () => void; lagre: () => void; children: ReactNode }) {
  const send = (e: FormEvent) => { e.preventDefault(); lagre(); };
  return (
    <Ark tittel={tittel} lukk={lukk}>
      <form className="skjema" onSubmit={send}>{children}</form>
    </Ark>
  );
}

const FREKVENSER = (Object.keys(FREKVENS_NAVN) as Frekvens[]);

function KontoValg({ kontoer, banker, verdi, endre, tom }: { kontoer: Konto[]; banker: Bank[]; verdi: Id; endre: (id: Id) => void; tom?: string }) {
  const bank = (id: Id | null) => banker.find((b) => b.id === id)?.navn;
  // Private kontoer (eier satt, ikke lønnskonto) får egen gruppe
  const erPrivat = (k: Konto) => !!k.eierId && k.rolle !== 'avsender';
  const grupper: [string, Konto[]][] = [
    [ROLLE_NAVN.avsender, kontoer.filter((k) => k.rolle === 'avsender')],
    ['Mine kontoer', kontoer.filter(erPrivat)],
    [ROLLE_NAVN.felles, kontoer.filter((k) => k.rolle === 'felles' && !erPrivat(k))],
    [ROLLE_NAVN.sparing, kontoer.filter((k) => k.rolle === 'sparing' && !erPrivat(k))],
  ];
  return (
    <select value={verdi} onChange={(e) => endre(e.target.value)} required>
      {tom !== undefined && <option value="">{tom}</option>}
      {grupper.map(([navn, liste]) => liste.length ? (
        <optgroup key={navn} label={navn}>
          {liste.map((k) => <option key={k.id} value={k.id}>{k.navn}{bank(k.bankId) ? ` (${bank(k.bankId)})` : ''}</option>)}
        </optgroup>
      ) : null)}
    </select>
  );
}

// ---------------------------------------------------------------- Post

export function PostSkjema({ post, kategorier, kontoer, banker, lagre, slett, lukk }: {
  post?: Post; kategorier: Kategori[]; kontoer: Konto[]; banker: Bank[];
  lagre: (p: Post) => void; slett?: () => void; lukk: () => void;
}) {
  const [p, setP] = useState<Post>(post ?? {
    id: nyId(), navn: '', belop: 0, frekvens: 'mnd', type: 'utgift',
    kategoriId: kategorier[0]?.id ?? '', kontoId: kontoer.find((k) => k.rolle !== 'avsender')?.id ?? kontoer[0]?.id ?? '',
  });
  const sett = (endring: Partial<Post>) => setP({ ...p, ...endring });
  return (
    <Skjema tittel={post ? 'Endre post' : 'Ny post'} lukk={lukk} lagre={() => lagre(p)}>
      <Felt etikett="Navn"><input value={p.navn} onChange={(e) => sett({ navn: e.target.value })} required placeholder="F.eks. Strøm" autoFocus={!post} /></Felt>
      <div className="felt-rad">
        <Felt etikett="Beløp"><BelopFelt verdi={p.belop} endre={(belop) => sett({ belop })} /></Felt>
        <Felt etikett="Hvor ofte">
          <select value={p.frekvens} onChange={(e) => sett({ frekvens: e.target.value as Frekvens })}>
            {FREKVENSER.map((f) => <option key={f} value={f}>{FREKVENS_NAVN[f]}</option>)}
          </select>
        </Felt>
      </div>
      {p.frekvens !== 'mnd' && <p className="dempet liten">Tilsvarer {kr(tilMnd(p.belop, p.frekvens))} per måned.</p>}
      <Felt etikett="Type">
        <Segment etikett="Type" full verdi={p.type} endre={(type) => sett({ type })}
          valg={[{ verdi: 'utgift', tekst: 'Utgift' }, { verdi: 'sparing', tekst: 'Sparing / avdrag' }]} />
      </Felt>
      <Felt etikett="Kategori">
        <select value={p.kategoriId} onChange={(e) => sett({ kategoriId: e.target.value })} required>
          {kategorier.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
        </select>
      </Felt>
      <Felt etikett="Trekkes fra konto">
        <KontoValg kontoer={kontoer} banker={banker} verdi={p.kontoId} endre={(kontoId) => sett({ kontoId })} />
      </Felt>
      <Felt etikett="Notat (valgfritt)"><input value={p.notat ?? ''} onChange={(e) => sett({ notat: e.target.value })} placeholder="F.eks. 221 + 288" /></Felt>
      {p.type === 'utgift' && (
        <label className="rad" style={{ cursor: 'pointer', minHeight: 44 }}>
          <span className="hoved"><span className="navn">Følg opp med utgifter</span><span className="info">For poster som varierer, f.eks. mat. Faste trekk kontrolleres via saldo.</span></span>
          <input type="checkbox" className="bryter" checked={!!p.folgOpp} onChange={(e) => sett({ folgOpp: e.target.checked })} />
        </label>
      )}
      <Knapper slett={slett} lukk={lukk} kanLagre={!!p.navn && !!p.kategoriId && !!p.kontoId} />
    </Skjema>
  );
}

// ---------------------------------------------------------------- Inntekt

export function InntektSkjema({ inntekt, personer, kontoer, banker, lagre, slett, lukk }: {
  inntekt?: Inntekt; personer: Person[]; kontoer: Konto[]; banker: Bank[];
  lagre: (i: Inntekt) => void; slett?: () => void; lukk: () => void;
}) {
  const [i, setI] = useState<Inntekt>(inntekt ?? {
    id: nyId(), navn: '', personId: personer[0]?.id ?? null, belop: 0, frekvens: 'mnd',
    tilKontoId: kontoer.find((k) => k.rolle === 'avsender' && k.eierId === personer[0]?.id)?.id ?? kontoer[0]?.id ?? '',
  });
  const sett = (e: Partial<Inntekt>) => setI({ ...i, ...e });
  return (
    <Skjema tittel={inntekt ? 'Endre inntekt' : 'Ny inntekt'} lukk={lukk} lagre={() => lagre(i)}>
      <Felt etikett="Navn"><input value={i.navn} onChange={(e) => sett({ navn: e.target.value })} required placeholder="F.eks. Lønn" /></Felt>
      <Felt etikett="Hvem" hjelp="Velg «Ingen» for f.eks. barnetrygd som går rett til en konto.">
        <select value={i.personId ?? ''} onChange={(e) => {
          const personId = e.target.value || null;
          const konto = kontoer.find((k) => k.rolle === 'avsender' && k.eierId === personId);
          sett({ personId, tilKontoId: konto?.id ?? i.tilKontoId });
        }}>
          {personer.map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}
          <option value="">Ingen</option>
        </select>
      </Felt>
      <div className="felt-rad">
        <Felt etikett="Beløp (netto)"><BelopFelt verdi={i.belop} endre={(belop) => sett({ belop })} /></Felt>
        <Felt etikett="Hvor ofte">
          <select value={i.frekvens} onChange={(e) => sett({ frekvens: e.target.value as Frekvens })}>
            {FREKVENSER.map((f) => <option key={f} value={f}>{FREKVENS_NAVN[f]}</option>)}
          </select>
        </Felt>
      </div>
      <Felt etikett="Går inn på konto"><KontoValg kontoer={kontoer} banker={banker} verdi={i.tilKontoId} endre={(tilKontoId) => sett({ tilKontoId })} /></Felt>
      <Knapper slett={slett} lukk={lukk} kanLagre={!!i.navn && !!i.tilKontoId} />
    </Skjema>
  );
}

// ---------------------------------------------------------------- Overføring

export function OverforingSkjema({ overforing, kontoer, banker, lagre, slett, lukk }: {
  overforing?: Overforing; kontoer: Konto[]; banker: Bank[];
  lagre: (o: Overforing) => void; slett?: () => void; lukk: () => void;
}) {
  const fra = kontoer.filter((k) => k.rolle === 'avsender');
  const til = kontoer.filter((k) => k.rolle !== 'avsender');
  const [o, setO] = useState<Overforing>(overforing ?? { id: nyId(), fraKontoId: fra[0]?.id ?? '', tilKontoId: til[0]?.id ?? '', belop: 0 });
  const sett = (e: Partial<Overforing>) => setO({ ...o, ...e });
  return (
    <Skjema tittel={overforing ? 'Endre overføring' : 'Ny overføring'} lukk={lukk} lagre={() => lagre(o)}>
      <Felt etikett="Fra (lønnskonto)"><KontoValg kontoer={fra} banker={banker} verdi={o.fraKontoId} endre={(fraKontoId) => sett({ fraKontoId })} /></Felt>
      <Felt etikett="Til"><KontoValg kontoer={til} banker={banker} verdi={o.tilKontoId} endre={(tilKontoId) => sett({ tilKontoId })} /></Felt>
      <Felt etikett="Beløp per måned"><BelopFelt verdi={o.belop} endre={(belop) => sett({ belop })} /></Felt>
      <Knapper slett={slett} lukk={lukk} kanLagre={!!o.fraKontoId && !!o.tilKontoId && o.belop > 0} />
    </Skjema>
  );
}

// ---------------------------------------------------------------- Konto

export function KontoSkjema({ konto, banker, personer, lagre, slett, lukk, nyBank, bareSparing, privat: privat0 = false, meg }: {
  konto?: Konto; banker: Bank[]; personer: Person[];
  lagre: (k: Konto, privat: boolean) => void; slett?: () => void; lukk: () => void;
  nyBank: (navn: string) => Id; bareSparing?: { eierId: Id };
  /** Kontoen ligger i privatbudsjettet */
  privat?: boolean;
  /** Innlogget person – gir valget «Privat konto» */
  meg?: Person;
}) {
  const [k, setK] = useState<Konto>(konto ?? {
    id: nyId(), navn: '', bankId: banker[0]?.id ?? null, kontonr: '',
    rolle: bareSparing ? 'sparing' : 'felles', eierId: bareSparing?.eierId ?? null,
  });
  const [erPrivat, setErPrivat] = useState(!!bareSparing || privat0);
  const [bankNavn, setBankNavn] = useState('');
  const [harMaal, setHarMaal] = useState(!!k.sparemaal);
  const sett = (e: Partial<Konto>) => setK({ ...k, ...e });
  const maal = k.sparemaal ?? { maal: 0, saldo: 0, saldoDato: new Date().toISOString().slice(0, 10), rente: 0 };

  function veksle(p: boolean) {
    setErPrivat(p);
    // Private kontoer kan ikke være lønnskonto (den må ligge i fellesbudsjettet)
    if (p) setK({ ...k, eierId: meg!.id, rolle: k.rolle === 'avsender' ? 'felles' : k.rolle });
    else setK({ ...k, eierId: k.rolle === 'avsender' ? k.eierId : null });
  }

  function lagreKonto() {
    let bankId = k.bankId;
    if (bankId === '__ny' && bankNavn.trim()) bankId = nyBank(bankNavn.trim());
    else if (bankId === '__ny') bankId = null;
    lagre({ ...k, bankId, kontonr: maskerKontonr(k.kontonr), sparemaal: harMaal ? maal : undefined }, erPrivat);
  }

  return (
    <Skjema tittel={konto ? 'Endre konto' : 'Ny konto'} lukk={lukk} lagre={lagreKonto}>
      <Felt etikett="Navn"><input value={k.navn} onChange={(e) => sett({ navn: e.target.value })} required placeholder={erPrivat ? 'F.eks. Brukskonto' : 'F.eks. Felles regning'} /></Felt>
      {!bareSparing && meg && (
        <label className="rad" style={{ cursor: 'pointer', minHeight: 44 }}>
          <Ikon navn="privat" storrelse={18} />
          <span className="hoved"><span className="navn">Privat konto</span><span className="info">Bare du ser den. Kan brukes i ditt privatbudsjett.</span></span>
          <input type="checkbox" className="bryter" checked={erPrivat} onChange={(e) => veksle(e.target.checked)} />
        </label>
      )}
      {!bareSparing && (
        <Felt etikett="Type konto">
          <select value={k.rolle} onChange={(e) => sett({ rolle: e.target.value as KontoRolle })}>
            {erPrivat ? (
              <>
                <option value="felles">Brukskonto – egne utgifter trekkes herfra</option>
                <option value="sparing">Sparekonto</option>
              </>
            ) : (
              <>
                <option value="felles">Felleskonto – dere overfører hit, regninger trekkes herfra</option>
                <option value="sparing">Sparekonto</option>
                <option value="avsender">Lønnskonto – der inntekten kommer inn</option>
              </>
            )}
          </select>
        </Felt>
      )}
      {!bareSparing && !erPrivat && k.rolle === 'avsender' && (
        <Felt etikett="Eier">
          <select value={k.eierId ?? ''} onChange={(e) => sett({ eierId: e.target.value || null })} required>
            <option value="">Velg person</option>
            {personer.map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}
          </select>
        </Felt>
      )}
      <div className="felt-rad">
        <Felt etikett="Bank">
          <select value={k.bankId ?? ''} onChange={(e) => sett({ bankId: e.target.value || null })}>
            <option value="">Ingen</option>
            {banker.map((b) => <option key={b.id} value={b.id}>{b.navn}</option>)}
            <option value="__ny">+ Ny bank …</option>
          </select>
        </Felt>
        <Felt etikett="Kontonummer" hjelp="Lagres maskert">
          <input value={k.kontonr} onChange={(e) => sett({ kontonr: e.target.value })} placeholder="1234 xx xx567" inputMode="numeric" />
        </Felt>
      </div>
      {k.bankId === '__ny' && <Felt etikett="Navn på ny bank"><input value={bankNavn} onChange={(e) => setBankNavn(e.target.value)} autoFocus /></Felt>}
      {k.rolle !== 'avsender' && (
        <label className="rad" style={{ cursor: 'pointer', minHeight: 44 }}>
          <input type="checkbox" checked={harMaal} onChange={(e) => setHarMaal(e.target.checked)} style={{ width: 20, height: 20 }} />
          <span className="hoved"><span className="navn">Sparemål for kontoen</span><span className="info">Vises under Sparing med fremdrift</span></span>
        </label>
      )}
      {harMaal && k.rolle !== 'avsender' && (
        <>
          <div className="felt-rad">
            <Felt etikett="Mål"><BelopFelt verdi={maal.maal} endre={(v) => sett({ sparemaal: { ...maal, maal: v } })} /></Felt>
            <Felt etikett="Rente (%)"><input inputMode="decimal" defaultValue={maal.rente || ''} onChange={(e) => sett({ sparemaal: { ...maal, rente: Number(e.target.value.replace(',', '.')) || 0 } })} /></Felt>
          </div>
          <div className="felt-rad">
            <Felt etikett="Saldo nå"><BelopFelt verdi={maal.saldo} endre={(v) => sett({ sparemaal: { ...maal, saldo: v } })} /></Felt>
            <Felt etikett="Per dato"><input type="date" value={maal.saldoDato} onChange={(e) => sett({ sparemaal: { ...maal, saldoDato: e.target.value } })} /></Felt>
          </div>
        </>
      )}
      <Knapper slett={slett} lukk={lukk} kanLagre={!!k.navn && (k.rolle !== 'avsender' || !!k.eierId)} />
    </Skjema>
  );
}

/** Beholder bare de 4 første og 3 siste sifrene, f.eks. "1234 xx xx901". */
export function maskerKontonr(s: string): string {
  const siffer = s.replace(/\D/g, '');
  if (siffer.length < 7) return s.trim();
  return `${siffer.slice(0, 4)} xx xx${siffer.slice(-3)}`;
}

// ---------------------------------------------------------------- Kategori

export function KategoriSkjema({ kategori, alle, antallPoster, lagre, slett, lukk }: {
  kategori?: Kategori; alle: Kategori[]; antallPoster: number;
  lagre: (k: Kategori) => void; slett?: (flyttTil: Id | null) => void; lukk: () => void;
}) {
  const [k, setK] = useState<Kategori>(kategori ?? { id: nyId(), navn: '', farge: alle.length % 8 });
  const andre = alle.filter((x) => x.id !== k.id);
  const [flyttTil, setFlyttTil] = useState<Id>(andre[0]?.id ?? '');
  const kanSlette = slett && (antallPoster === 0 || andre.length > 0);
  return (
    <Skjema tittel={kategori ? 'Endre kategori' : 'Ny kategori'} lukk={lukk} lagre={() => lagre(k)}>
      <Felt etikett="Navn"><input value={k.navn} onChange={(e) => setK({ ...k, navn: e.target.value })} required autoFocus={!kategori} /></Felt>
      <Felt etikett="Farge" hjelp="Fargene er valgt så de kan skilles fra hverandre også ved fargeblindhet."><Fargevalg verdi={k.farge} endre={(farge) => setK({ ...k, farge })} /></Felt>
      {kategori && antallPoster > 0 && slett && (
        <Felt etikett={`Ved sletting: flytt ${antallPoster} poster til`}>
          <select value={flyttTil} onChange={(e) => setFlyttTil(e.target.value)}>
            {andre.map((a) => <option key={a.id} value={a.id}>{a.navn}</option>)}
          </select>
        </Felt>
      )}
      <Knapper slett={kanSlette ? () => slett!(antallPoster ? flyttTil : null) : undefined} lukk={lukk} kanLagre={!!k.navn} />
    </Skjema>
  );
}

// ---------------------------------------------------------------- Bank og person

export function BankSkjema({ bank, lagre, slett, lukk }: { bank?: Bank; lagre: (b: Bank) => void; slett?: () => void; lukk: () => void }) {
  const [b, setB] = useState<Bank>(bank ?? { id: nyId(), navn: '' });
  return (
    <Skjema tittel={bank ? 'Endre bank' : 'Ny bank'} lukk={lukk} lagre={() => lagre(b)}>
      <Felt etikett="Navn"><input value={b.navn} onChange={(e) => setB({ ...b, navn: e.target.value })} required autoFocus /></Felt>
      <Knapper slett={slett} lukk={lukk} kanLagre={!!b.navn} />
    </Skjema>
  );
}

export function PersonSkjema({ person, lagre, slett, lukk }: { person?: Person; lagre: (p: Person) => void; slett?: () => void; lukk: () => void }) {
  const [p, setP] = useState<Person>(person ?? { id: nyId(), navn: '', epost: '' });
  return (
    <Skjema tittel={person ? 'Endre person' : 'Ny person'} lukk={lukk} lagre={() => lagre({ ...p, epost: p.epost.trim().toLowerCase() })}>
      <Felt etikett="Navn"><input value={p.navn} onChange={(e) => setP({ ...p, navn: e.target.value })} required /></Felt>
      <Felt etikett="Google-e-post" hjelp="Kobler innloggingen til personen. Må også stå i medlemslisten i Supabase.">
        <input type="email" value={p.epost} onChange={(e) => setP({ ...p, epost: e.target.value })} required />
      </Felt>
      <Knapper slett={slett} lukk={lukk} kanLagre={!!p.navn && !!p.epost} />
    </Skjema>
  );
}

// ---------------------------------------------------------------- Revisjon

export function RevisjonSkjema({ tittel, navn: n0 = '', gjelderFra: g0, notat: no0 = '', lagre, slett, lukk, forklaring }: {
  tittel: string; navn?: string; gjelderFra: string; notat?: string;
  lagre: (v: { navn: string; gjelderFra: string; notat: string }) => void; slett?: () => void; lukk: () => void; forklaring?: string;
}) {
  const [navn, setNavn] = useState(n0);
  const [gjelderFra, setGjelderFra] = useState(g0);
  const [notat, setNotat] = useState(no0);
  return (
    <Skjema tittel={tittel} lukk={lukk} lagre={() => lagre({ navn, gjelderFra, notat })}>
      {forklaring && <p className="dempet liten">{forklaring}</p>}
      <Felt etikett="Navn"><input value={navn} onChange={(e) => setNavn(e.target.value)} required placeholder="F.eks. Budsjett januar 2027" /></Felt>
      <Felt etikett="Gjelder fra"><input type="date" value={gjelderFra} onChange={(e) => setGjelderFra(e.target.value)} required /></Felt>
      <Felt etikett="Notat"><textarea value={notat} onChange={(e) => setNotat(e.target.value)} placeholder="Hva er endret, og hvorfor?" /></Felt>
      <Knapper slett={slett} slettTekst="Slett revisjon" lukk={lukk} kanLagre={!!navn && !!gjelderFra} />
    </Skjema>
  );
}
