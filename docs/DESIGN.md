# Designprinsipper

Hvorfor dashboardet ser ut og oppfører seg som det gjør. Bruk dette når nye sider lages.

## Prinsippene

| Prinsipp | Kilde | Slik er det brukt |
|---|---|---|
| **Oversikt først, zoom og filter, detaljer ved behov** | Shneiderman (1996) | Oversikt → sankey → trykk på kategori gir postene i et ark |
| **Et blikk skal holde** – det viktigste tallet øverst | Stephen Few, *Information Dashboard Design* | Stor «hero»-flis med månedlig total og endring fra forrige revisjon |
| **Få nøkkeltall på mobil (3–4), stablet vertikalt** | Few; mobil-dashboardpraksis | KPI-rad: 2 kolonner på mobil, 4 på PC |
| **Data-blekk: fjern pynt** – ingen 3D, tynne linjer, rolige rutenett | Tufte / Few | Flate kort, hårfine skillelinjer, ingen gradienter i diagrammer |
| **Progressiv avsløring** – sekundære valg i undersider/ark | Nielsen Norman Group | Redigering i bunnark, «Mer»-meny, «Med kontoer» som valg i sankey |
| **Tillit rundt penger** – rolig, tydelig, ingen overraskelser | NN/g (bank-UX) | Synlig lagringsstatus, «Angre» etter sletting, bekreftelse ved destruktive valg, «Bare du ser denne siden» |
| **Kontekst gjør tall meningsfulle** | Few | Endring mot forrige revisjon, andel av total, mål vs. faktisk |
| **Aldri bare farge** | WCAG 1.4.1 | Piler + tekst på endringer, ikon + tekst på status, tabellvisning av sankey |
| **Tommelsonen** | Mobil-UX | Bunnmeny, trykkflater ≥ 44 px, 16 px i felt (hindrer zoom på iPhone) |

## Farger

- **Terrakotta-palett**, varme papirtoner i lyst tema, mørk jord i mørkt tema.
- 8 kategorifarger (`--k0`…`--k7`) i fast rekkefølge. Validert med dataviz-validatoren for
  lyshetsbånd, metning, fargeblindhet (protan/deutan ΔE ≥ 8), normalsyn (ΔE ≥ 15) og kontrast ≥ 3:1
  – separat for lyst (`#FAF6F0`) og mørkt (`#1F1B18`) tema.
- Farge følger kategorien – aldri rangering. Personer får nøytrale toner.
- Statusfarger (grønn/gul/rød) brukes bare for status, alltid med ikon og tekst.

## Typografi

- Titler: **Fraunces** (varm serif, passer jordtonene). Brødtekst og tall: **Inter** med `tabular-nums`
  så sifre står rett under hverandre.

## Sankey på mobil

Et loddrett sankey-diagram ble vurdert, men etikettene blir uleselige når 6–8 kategorier deler
390 px bredde. Løsningen i stedet:

- **«Enkel»** er standard på mobil: Person → Fellesbudsjett → Kategori (3 kolonner).
- Etiketter ligger over lenkene med en «halo» i bakgrunnsfarge, så de er lesbare.
- Små noder får én linje (navn + beløp), store får to.
- Trykk på en kategori åpner postene i et bunnark. Tabellvisning finnes for nøyaktige tall.
