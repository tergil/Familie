// Vedlegg (bilder og PDF) til punkter i huskelistene.
// Bilder forminskes i nettleseren før opplasting (maks 1600 px, JPEG), så de tar lite plass.
import { useEffect, useState } from 'react';
import type { Vedlegg } from './modell';
import { nyId } from './modell';
import { lager } from './lager';

export const MAKS_STORRELSE = 10 * 1024 * 1024;
export const GODTATTE_TYPER = 'image/*,application/pdf';
const MAKS_SIDE = 1600;

/** Forminsker bilder. GIF og bilder nettleseren ikke kan lese (f.eks. HEIC utenfor Safari) lastes opp som de er. */
async function forminsk(fil: File): Promise<{ data: Blob; type: string }> {
  if (!fil.type.startsWith('image/') || fil.type === 'image/gif') return { data: fil, type: fil.type };
  try {
    const bilde = await createImageBitmap(fil);
    const skala = Math.min(1, MAKS_SIDE / Math.max(bilde.width, bilde.height));
    const lerret = document.createElement('canvas');
    lerret.width = Math.round(bilde.width * skala);
    lerret.height = Math.round(bilde.height * skala);
    lerret.getContext('2d')!.drawImage(bilde, 0, 0, lerret.width, lerret.height);
    bilde.close();
    const blob = await new Promise<Blob | null>((ok) => lerret.toBlob(ok, 'image/jpeg', 0.85));
    return blob && blob.size < fil.size ? { data: blob, type: 'image/jpeg' } : { data: fil, type: fil.type };
  } catch {
    return { data: fil, type: fil.type };
  }
}

/** Laster opp én fil og returnerer vedlegget som skal lagres på punktet */
export async function lastOppVedlegg(listeId: string, punktId: string, fil: File): Promise<Vedlegg> {
  if (!fil.type.startsWith('image/') && fil.type !== 'application/pdf') throw new Error(`«${fil.name}» er verken bilde eller PDF.`);
  const { data, type } = await forminsk(fil);
  if (data.size > MAKS_STORRELSE) throw new Error(`«${fil.name}» er større enn 10 MB.`);
  const id = nyId();
  const endelse = type === 'application/pdf' ? 'pdf' : type === 'image/jpeg' ? 'jpg' : (type.split('/')[1] ?? 'bin');
  const sti = `${listeId}/${punktId}/${id}.${endelse}`;
  await lager.lastOppVedlegg(sti, data, type);
  return { id, navn: fil.name, type, sti, storrelse: data.size };
}

// Midlertidige adresser gjenbrukes i 50 minutter (de er gyldige i en time)
const adresser = new Map<string, { url: string; utloper: number }>();

export function useVedleggUrl(sti: string): { url: string | null; feil: boolean } {
  const [tilstand, setTilstand] = useState<{ url: string | null; feil: boolean }>(() => {
    const c = adresser.get(sti);
    return { url: c && c.utloper > Date.now() ? c.url : null, feil: false };
  });
  useEffect(() => {
    const c = adresser.get(sti);
    if (c && c.utloper > Date.now()) { setTilstand({ url: c.url, feil: false }); return; }
    let aktiv = true;
    lager.vedleggUrl(sti)
      .then((url) => { adresser.set(sti, { url, utloper: Date.now() + 50 * 60_000 }); if (aktiv) setTilstand({ url, feil: false }); })
      .catch(() => { if (aktiv) setTilstand({ url: null, feil: true }); });
    return () => { aktiv = false; };
  }, [sti]);
  return tilstand;
}

export function storrelseTekst(byte: number): string {
  return byte >= 1024 * 1024 ? `${(byte / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(byte / 1024))} kB`;
}
