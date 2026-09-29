// Føre en utgift. Mål: under 5 sekunder – beløp, kategori, lagre.
// Varsler hvis samme beløp er ført på samme konto de siste 7 dagene (mulig dobbeltføring).
import { useMemo, useState, type FormEvent } from 'react';
import type { Utgift } from '../data/modell';
import { nyId } from '../data/modell';
import { lager, varsleOppfolgingEndret } from '../data/lager';
import { useTilstand } from '../data/tilstand';
import { iDag } from '../logikk/beregning';
import { kontoerFor, muligeDubletter, revisjonForMaaned, maanedAv } from '../logikk/oppfolging';
import { Ark, Felt, Ikon, Segment, datoTekst, kr, tolkTall } from './felles';

const SIST = 'familie.sist';

function husk(nokkel: string): string | null {
  try { return localStorage.getItem(`${SIST}.${nokkel}`); } catch { return null; }
}
function lagreSist(nokkel: string, verdi: string) {
  try { localStorage.setItem(`${SIST}.${nokkel}`, verdi); } catch { /* ignorer */ }
}

function flyttDato(dato: string, dager: number): string {
  const d = new Date(`${dato}T12:00:00`);
  d.setDate(d.getDate() + dager);
  return d.toISOString().slice(0, 10);
}

export function UtgiftSkjema({ utgift, privatStart, lukk }: { utgift?: Utgift; privatStart: boolean; lukk: () => void }) {
  const { felles, privat, meg, visToast } = useTilstand();
  const [privatValgt, setPrivatValgt] = useState(utgift?.privat ?? (privatStart && !!meg));
  const visning = privatValgt ? 'privat' : 'felles';
  const kontoer = felles ? kontoerFor(felles, privat ?? undefined, visning) : [];

  // Kategorier med «Følg opp»-poster i gjeldende revisjon kommer først
  const fulgteKategorier = useMemo(() => {
    if (!felles) return new Set<string>();
    const m = maanedAv(iDag());
    const poster = privatValgt
      ? revisjonForMaaned(privat?.revisjoner ?? [], m)?.poster ?? []
      : revisjonForMaaned(felles.revisjoner, m)?.poster ?? [];
    return new Set(poster.filter((p) => p.folgOpp).map((p) => p.kategoriId));
  }, [felles, privat, privatValgt]);
  const kategorier = [...(felles?.kategorier ?? [])].sort((a, b) => Number(fulgteKategorier.has(b.id)) - Number(fulgteKategorier.has(a.id)));

  const standardKonto = (v: 'felles' | 'privat') => {
    const sist = husk(`konto.${v}`);
    const liste = felles ? kontoerFor(felles, privat ?? undefined, v) : [];
    if (sist && liste.some((k) => k.id === sist)) return sist;
    const rev = felles && revisjonForMaaned(felles.revisjoner, maanedAv(iDag()));
    const fulgt = v === 'felles' ? rev?.poster.find((p) => p.folgOpp)?.kontoId : undefined;
    return fulgt ?? liste[0]?.id ?? '';
  };

  const [belopTekst, setBelopTekst] = useState(utgift ? String(utgift.belop) : '');
  const [kategoriId, setKategoriId] = useState(utgift?.kategoriId ?? husk(`kategori.${visning}`) ?? kategorier[0]?.id ?? '');
  const [kontoId, setKontoId] = useState(utgift?.kontoId ?? standardKonto(visning));
  const [dato, setDato] = useState(utgift?.dato ?? iDag());
  const [notat, setNotat] = useState(utgift?.notat ?? '');
  const [dubletter, setDubletter] = useState<Utgift[] | null>(null);
  const [lagrer, setLagrer] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const [bekreftSlett, setBekreftSlett] = useState(false);

  const belop = tolkTall(belopTekst);
  const kanLagre = belop !== 0 && !!kategoriId && !!kontoId && !!dato && !lagrer;
  const personNavn = (epost: string) => felles?.personer.find((p) => p.epost.toLowerCase() === epost.toLowerCase())?.navn ?? epost;
  const kontoNavn = (id: string) => [...(felles?.kontoer ?? []), ...(privat?.kontoer ?? [])].find((k) => k.id === id)?.navn ?? 'Ukjent konto';

  function byttVisning(v: 'felles' | 'privat') {
    setPrivatValgt(v === 'privat');
    setKontoId(standardKonto(v));
    setDubletter(null);
  }

  async function lagre(tvungen: boolean, nyEtterpaa: boolean) {
    if (!kanLagre) return;
    setLagrer(true);
    setFeil(null);
    const ny: Utgift = {
      id: utgift?.id ?? nyId(), dato, belop, kategoriId, kontoId, notat: notat.trim(),
      privat: privatValgt, fortAv: utgift?.fortAv ?? '',
    };
    try {
      if (!tvungen) {
        const naer = await lager.hentUtgifter(flyttDato(dato, -7), flyttDato(dato, 7));
        const treff = muligeDubletter(ny, naer);
        if (treff.length) { setDubletter(treff); setLagrer(false); return; }
      }
      await lager.lagreUtgift(ny);
      lagreSist(`kategori.${visning}`, kategoriId);
      lagreSist(`konto.${visning}`, kontoId);
      varsleOppfolgingEndret();
      visToast({
        tekst: `${utgift ? 'Endret' : 'Førte'} ${kr(belop)}`,
        angre: utgift ? undefined : async () => { await lager.slettUtgift(ny.id); varsleOppfolgingEndret(); visToast(null); },
      });
      if (nyEtterpaa) {
        setBelopTekst('');
        setNotat('');
        setDubletter(null);
        setLagrer(false);
        document.querySelector<HTMLInputElement>('.stort-belop input')?.focus();
      } else {
        lukk();
      }
    } catch (e) {
      setFeil(e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e));
      setLagrer(false);
    }
  }

  async function slett() {
    if (!utgift) return;
    try {
      await lager.slettUtgift(utgift.id);
      varsleOppfolgingEndret();
      visToast({ tekst: `Slettet ${kr(utgift.belop)}`, angre: async () => { await lager.lagreUtgift(utgift); varsleOppfolgingEndret(); visToast(null); } });
      lukk();
    } catch (e) {
      setFeil(String((e as { message?: unknown })?.message ?? e));
    }
  }

  const send = (e: FormEvent) => { e.preventDefault(); void lagre(false, false); };

  return (
    <Ark tittel={utgift ? 'Endre utgift' : 'Før utgift'} lukk={lukk}>
      <form className="skjema" onSubmit={send}>
        {meg && (
          <Segment etikett="Budsjett" full verdi={visning} endre={byttVisning}
            valg={[{ verdi: 'felles', tekst: 'Felles' }, { verdi: 'privat', tekst: 'Privat' }]} />
        )}

        <label className="stort-belop">
          <span className="skjult">Beløp</span>
          <input inputMode="decimal" value={belopTekst} placeholder="0" autoFocus
            onChange={(e) => { setBelopTekst(e.target.value); setDubletter(null); }} />
          <span aria-hidden="true">kr</span>
        </label>

        <div className="felt">
          <span>Kategori</span>
          <div className="valgchips" role="radiogroup" aria-label="Kategori">
            {kategorier.map((k) => (
              <button key={k.id} type="button" role="radio" aria-checked={k.id === kategoriId} onClick={() => setKategoriId(k.id)}>
                <span className="prikk" style={{ background: `var(--k${k.farge})` }} />{k.navn}
              </button>
            ))}
          </div>
        </div>

        <div className="felt-rad">
          <Felt etikett="Konto">
            <select value={kontoId} onChange={(e) => { setKontoId(e.target.value); setDubletter(null); }} required>
              {kontoer.map((k) => <option key={k.id} value={k.id}>{k.navn}</option>)}
            </select>
          </Felt>
          <Felt etikett="Dato">
            <input type="date" value={dato} max={flyttDato(iDag(), 31)} onChange={(e) => { setDato(e.target.value); setDubletter(null); }} required />
          </Felt>
        </div>
        <Felt etikett="Notat (valgfritt)"><input value={notat} onChange={(e) => setNotat(e.target.value)} placeholder="F.eks. Rema, storhandel. Retur: skriv minus foran beløpet" /></Felt>

        {dubletter && (
          <div className="banner varsel" role="alert">
            <Ikon navn="advarsel" />
            <div>
              <strong>Mulig dobbeltføring</strong>
              <p>Samme beløp er allerede ført på {kontoNavn(kontoId)}:</p>
              <ul className="dublett-liste">
                {dubletter.map((d) => (
                  <li key={d.id}>{kr(d.belop)} · {datoTekst(d.dato)} · {personNavn(d.fortAv)}{d.notat ? ` · ${d.notat}` : ''}</li>
                ))}
              </ul>
              <div className="knapperad" style={{ marginTop: 8 }}>
                <button type="button" className="knapp liten" onClick={() => void lagre(true, false)}>Lagre likevel</button>
                <button type="button" className="knapp liten flat" onClick={lukk}>Avbryt</button>
              </div>
            </div>
          </div>
        )}
        {feil && <div className="banner feil" role="alert"><Ikon navn="advarsel" /><div><strong>Kunne ikke lagre.</strong><p className="liten">{feil}</p></div></div>}

        {!dubletter && (
          <div className="knapperad slutt">
            {utgift && (bekreftSlett
              ? <button type="button" className="knapp fare dytt" onClick={() => void slett()}><Ikon navn="slett" storrelse={18} />Bekreft sletting</button>
              : <button type="button" className="knapp flat fare dytt" onClick={() => setBekreftSlett(true)}><Ikon navn="slett" storrelse={18} />Slett</button>)}
            {!utgift && <button type="button" className="knapp" disabled={!kanLagre} onClick={() => void lagre(false, true)}>Lagre + ny</button>}
            <button type="submit" className="knapp primar" disabled={!kanLagre}>{lagrer ? 'Lagrer …' : 'Lagre'}</button>
          </div>
        )}
      </form>
    </Ark>
  );
}
