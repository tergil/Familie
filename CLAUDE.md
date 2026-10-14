# Sulamitten – prosjektfakta

Personlige arbeidsinstrukser ligger i `~/.claude/CLAUDE.md`. Denne fila handler bare om prosjektet.

## Hva appen er

- **Sulamitten** («Hele sulamitten. Samlet.»): familieapp for Terje og Ingrid (kun to brukere) – budsjett, lister, gaver og kalender.
- Brukes mest på mobil, også nettbrett og PC.
- Viser **budsjett**, ikke faktiske utgifter. Budsjettet revideres ca. to ganger i året (revisjoner).
- Fellesbudsjett (begge ser) + ett privatbudsjett per person (bare eieren ser). Bryteren «Felles | Privat» øverst på
  Oversikt, Budsjett og Oppfølging bytter mellom dem (huskes i `localStorage`). Det finnes ingen egen Privat-fane lenger;
  gamle lenker til `#/privat` sendes videre.
- Sankey-diagram av pengeflyten: inntekt → lønnskonto → felleskonto → kategori.
- **Oppfølging**: førte utgifter mot budsjett (poster med «Følg opp») + månedlig saldokontroll per konto.
  Varsel ved mulig dobbeltføring (samme konto og beløp innen 7 dager). `#/ny` åpner «Før utgift» direkte.
- **Lister** (`#/lister`, `#/lister/<id>`): huskelister med typer (huskeliste, gave, ønske, oppgave, steder, serier, hage,
  kalender), underpunkter (ett nivå), private lister, maler, adventskalender (24 luker eller søndager + egne dager),
  gavehistorikk, hagesesong per måned og huskelapp med frister (også på Oversikt). En liste kan kobles til en budsjettpost
  (sammenlignes med årsbeløpet) eller et sparemål. «Kjøpt» på et punkt med beløp tilbyr «Før utgift».
  Punkter kan dras i ny rekkefølge (håndtaket ⋮⋮, innenfor samme nivå) og ha bilder/PDF som vedlegg.
- **Gaveår** (listetype `gaveaar`, `sider/Gaveaar.tsx`, `logikk/gaveaar.ts`): ett felles + ett privat per person.
  Mottaker = hovedpunkt med `anledninger` (bursdag, jul, morsdag/farsdag regnes ut, egne – evt. «bare én gang») og budsjett.
  Gaver/ideer = underpunkter; `anledning` = «<anledning-id>:<år>», tom = idébanken (følger med til neste år).
  `betaler` = person-id når en felles gave går av én persons gavekonto. `fodt` på mottakeren gir bursdag og alder.
  Planer (`#/lister/plan/<jul|bursdag|andre>/<år>`): Juleplan, Bursdager og Andre (alt unntatt jul og bursdag),
  samler felles + eget gaveår med potter «Felles» / «Fra deg». Varsler på huskelappen 3 uker før hvis ingenting er kjøpt.
- **Kalender** (`#/kalender`, `sider/Kalender.tsx`, `logikk/kalender.ts`): felles avtaler i tabellen `hendelse`.
  En serie er én rad med `gjentak`; «bare denne dagen» er en egen rad med `serieId` + `originalDato` (`avlyst` = slettet).
  Endring/sletting: bare denne / denne og fremover (serien deles) / hele serien – `endreForekomst`/`slettForekomst`.
  Viser også bursdager fra gaveårene og frister fra listene. `hvem` = personer + `FellesDok.familie` (barna),
  `ansvarlig` = den som henter/leverer. Abonnement for telefonens kalender: Edge Function «kalender»
  (`?n=<FellesDok.kalenderNokkel>`, utvidede forekomster som ICS, `logikk/ics.ts`).
- **Navigasjon:** Oversikt · Kalender · Lister · Økonomi (fanene Oppfølging · Budsjett · Sparemål, på alle skjermstørrelser) · Mer. Oversikt viser de neste 5 avtalene
  (det som er over forsvinner, `kommende()`/`erForbi()`), huskelappen og økonomien. Snarveien nede til høyre på Oversikt følger
  seksjonen man ser på (`data-fab`: Ny avtale → Ny liste → Før utgift). Felles/privat-bryteren står over økonomien.
- **Varsler** (Oppsett → Varsler, `sider/Varsler.tsx`): push til iPhone (hjemskjerm, iOS 16.4+) og Android.
  Edge Function «varsler» kjøres hvert kvarter av pg_cron (daglige varsler i første kvarter av valgt time, «før avtale» hver gang), regner ut med `logikk/varsler.ts` og sender til brukerne som
  har valgt den timen. `public/sw.js` viser varselet (ingen mellomlagring). «Skjul detaljer» (`skjulDetaljer`, `utenDetaljer()`)
  gir varsler uten navn, gaver og avtaler på låseskjermen.
- **Deling** (Valg → Del liste): som tekst (øyeblikksbilde) eller lenke `#/delt/<nøkkel>` som vises uten innlogging
  (`sider/Delt.tsx`). Bare det som ikke er kjøpt/gjort deles, og aldri vedlegg.
- Status: POC i grenen `poc`.

## Kommandoer

```powershell
Start-Familie.cmd    # enklest: henter avhengigheter, starter server, åpner nettleser
npm run dev          # http://localhost:5180 – demomodus uten .env.local
npm run build        # tsc + vite build -> dist/
npm run typecheck    # tsc --noEmit
npm test             # beregningstester, kjører uten nettleser
npm run importer     # Excel i Data/ -> Data/import-familiebudsjett.json (lokalt!)
npm run sjekk-data   # sjekker at ingen private data er staget for commit
npm run ikoner       # tegner logoen (scripts/lag-logo.mjs → src/ui/logo.json) og lager app-ikonene i public/
npm run funksjoner   # bygger supabase/functions/{varsler,kalender}/index.ts fra supabase/kilde/ + src/logikk
npm run vapid        # nøkler for push-varsler: offentlig → src/data/varselnokkel.ts, privat → Data/varsler-oppsett.txt
```

- **Kjør `npm test` og `npm run typecheck` før du sier deg ferdig.**
- Uten `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` kjører appen i **demomodus** med oppdiktede tall
  lagret i nettleseren. «Se som …» under Import/eksport bytter person.

## Mappestruktur

| Mappe | Innhold |
|---|---|
| `src/data/` | `modell.ts` (typer), `lager.ts` (Supabase / lokal), `tilstand.tsx` (React-kontekst, lagring, angre), `lister.ts` (listene i minnet, lagres i bakgrunnen), `demo.ts` |
| `src/logikk/` | Ren logikk uten React: `beregning.ts` (summer, avrunding, forslag, revisjoner), `flyt.ts` (sankey-noder), `oppfolging.ts` (saldokontroll, tempo, dubletter), `lister.ts` (listetyper, maler, advent, huskelapp, hage, gavehistorikk) |
| `src/ui/` | Gjenbrukbare komponenter: `felles.tsx` (ikoner, ark, felt, formatering), `Sankey.tsx`, `skjemaer.tsx`, `deler.tsx` |
| `src/sider/` | Én fil per side (Oversikt, Budsjett, Privat – privat oversikt og budsjett bak bryteren, Oppfølging, Lister, Sparing, Revisjoner, Oppsett) |
| `src/stil/` | `tokens.css` (farger, avstander – lys/mørk) og `app.css` |
| `supabase/skjema.sql` | Budsjettdokumentene + RLS-regler. Kjøres i Supabase SQL Editor |
| `supabase/oppfolging.sql` | Tabellene `utgift` og `saldo` (egne rader, `eier` null = felles) |
| `supabase/kalender.sql` | Kalender: tabellen `hendelse` (felles), og timejobben settes til hvert kvarter |
| `supabase/varsler.sql` | Varsler: `varsel_abonnement` (enheter), `varsel_innstilling`, `varsel_sendt`. Timejobben står i Data/varsler-oppsett.txt |
| `supabase/kilde/`, `supabase/functions/` | Edge Functions «varsler» og «kalender» (kilde + genererte filer som limes inn i Supabase) |
| `supabase/lister.sql` | Tabellene `liste` (`eier` null = felles) og `listepunkt` (arver synlighet fra listen), funksjonen `hent_delt_liste` (delingslenker) og Storage-bøtta `vedlegg` |
| `scripts/` | Tester, Excel-import, datasjekk |
| `Data/` | **Private regneark og importfiler. ALDRI i Git.** |

## Merkevare og design

- Grunnlag: `Data/Sulamitten_merkevare_og_appdesignplattform.docx` (+ moodboard `Data/Image (12).jpg`). Terje har bestemt:
  skoggrønn `#0E3D32`, terrakotta `#D45B3E`, krem `#F4E9D7`; behold dagens navigasjon (ikke «Planer»/«Familie»); ingen onboarding.
- **Aldri emojier** – verken i UI, varsler, maler eller demodata. Bruk SVG-ikonene i `STIER` (`ui/felles.tsx`).
  Listeikoner lagres som ikonnavn (`LISTEIKONER`); eldre lister har emojier i databasen, `listeIkon()` (logikk/lister.ts) oversetter.
  Vis listeikoner med `<IkonBoble>`.
- Farger: skoggrønn er tekst og hovedknapper (`--aksent`). Gul, terrakotta, havblå og rosa er flater/ikoner – aldri liten tekst
  på krem (for lav kontrast). Statusfarger `--bra`, `--varsel`, `--feil`, `--info` (+ `-myk`). Mørkt tema: dyp grønn, gul aksent.
- Skrift: Nunito ExtraBold (800) for overskrifter/tall i fokus, Inter for resten. Maks to familier.
- Logo: `<Logo>` / `<Merke>` (krusedull → sirkel). `mikro` under ~24 px. `animer` bare ved utvalgte øyeblikk
  (innlogging, lasting, liste ferdig) – aldri ved feil. Redusert bevegelse viser logoen ferdig tegnet.
- **Sletting:** ett enkelt punkt/post/avtale/utgift slettes direkte med «Angre» i meldingen nederst. `useBekreft()` (dialog med
  konsekvens, Avbryt er valgt) når noe ikke kan angres (vedlegg, import) eller mye forsvinner (liste, mottaker, punkt med underpunkter,
  konto, person, revisjon, kategori i bruk). Aldri dobbelttrykk eller `confirm()`.
- **Tekststørrelse:** skriftstørrelser i `rem` (følger iPhones tekststørrelse via `-apple-system-body`). Unntak i px: bunnmenyens
  etiketter og bitene i månedsruta. Bredder som holder tekst (klokkeslett, datoblokker) også i rem. Test med `html { font-size: 32px }`.
- **Sveip** på listerader (`ui/Sveip.tsx`, bare berøring): høyre = gjort/neste status, venstre = slett. Alltid også en knapp for det samme.
- Ikonrutenes farge følger listekategorien (`IkonBoble kategori=…`), ikke ikonet.
- Tone: kort, folkelig, et lite skråsmil – også i tomme sider, feil og økonomi (Terjes valg). Men alltid tydelig om hva som skjedde
  og hva man kan gjøre; aldri si at noe er lagret før det er bekreftet.

## Konvensjoner

- Norsk overalt: UI, kode (variabler, funksjoner, filer), kommentarer og commit-meldinger.
- React 19 + TypeScript + Vite. Ingen UI-bibliotek – egen CSS med tokens i `tokens.css`.
- Beregninger skal ligge i `src/logikk/` og ha tester i `scripts/test-beregning.ts`.
- Beløp lagres med frekvens (mnd/kvartal/halvår/år) og regnes om med `tilMnd`.
- All ny UI skal bruke eksisterende klasser (`kort`, `rad`, `knapp`, `kpi`, `merkelapp`, `Ark` …).
- Kategorifarger er `--k0`…`--k7`, valgt med fargeblind-simulering mot krem og mørk bakgrunn. Ikke endre på øyemål –
  kjør dataviz-validatoren. Personer bruker nøytrale toner, aldri kategorifarger.
- Endringer i dokumentene går via `endreFelles`/`endrePrivat` (lagrer automatisk). Sletting skal ha `angreTekst`.

## Datamodell og sikkerhet

- To JSON-dokumenter i Supabase: `felles_dok` (én rad) og `privat_dok` (én rad per bruker).
- Huskelister ligger i `liste`/`listepunkt`. Felt som bare appen bruker (lenke, mottaker, vurdering, måneder,
  budsjettkobling …) lagres i kolonnen `ekstra` (jsonb), så nye felt ikke krever SQL. Bruk `listeLager` i `data/lister.ts`.
- Utgifter og saldoer ligger i egne tabeller (`utgift`, `saldo`) – ikke i dokumentene – så begge kan føre
  samtidig uten versjonskonflikt. `eier` = null er felles, ellers privat for den brukeren.
- Tilgang håndheves i databasen med RLS: bare e-poster i `medlem`-tabellen slipper inn,
  og `privat_dok` kan bare leses av eieren. Appen kan ikke omgå dette.
- Hver lagring tar vare på forrige versjon i `historikk` (angre via Supabase-dashbordet).
- Samtidig redigering: optimistisk låsing med `versjon`. Konflikt → banner «Last inn på nytt».
- Personer kobles til innlogging via e-post (`Person.epost` = Google-e-post).

## Fallgruver

- **Databaseendringer må Terje kjøre selv** i Supabase SQL Editor. Gi alltid ferdig SQL i en kodeblokk i svaret,
  og oppdater tilsvarende fil i `supabase/`. SQL-funksjoner må ikke referere kolonner som bare finnes i én tabell
  (feilen med `old.eier` i historikk-triggeren stoppet all lagring av fellesbudsjettet).

- **`Data/` skal aldri i Git.** Ignoreres som `/Data/` (forankret til roten – Windows skiller ikke store/små
  bokstaver, så `data/` ville også skjult `src/data/`). `.gitignore` + pre-commit-hook (`.githooks/pre-commit`, aktivert med
  `git config core.hooksPath .githooks`) stopper regneark, importfiler og fulle kontonumre.
- `demo.ts` skal bare ha **oppdiktede** tall – repoet kan være offentlig.
- Kontonumre lagres maskert (`1234 xx xx567`) – `maskerKontonr` i `skjemaer.tsx`.
- GitHub Pages krever offentlig repo på gratis GitHub-konto. Repoet heter `sulamitten` (små bokstaver – adressen skiller på store/små), appen ligger på
  https://tergil.github.io/sulamitten/. `base` i `vite.config.ts` hentes fra repo-navnet i GitHub Actions. Får repoet nytt
  navn, endres adressen: Supabase Auth → URL Configuration må få den nye adressen, hjemskjerm-appen må legges til på
  nytt, varsler slås på igjen og delingslenker deles på nytt.
- **Delingslenker** går forbi innloggingen via `hent_delt_liste` (security definer). Funksjonen skal bare returnere
  felt som er ment for deling – legg aldri til vedlegg, mottaker eller budsjettkobling der.
- **Vedlegg** ligger i Storage-bøtta `vedlegg` under `<liste-id>/<punkt-id>/`. Tilgangen følger listen. Sletter man et
  punkt eller en liste, blir filene liggende (så «Angre» virker) – de er da utilgjengelige, men tar plass.
- **Varsler:** endres `src/logikk/varsler.ts` (eller lister/gaveår-logikken den bruker), må `npm run funksjoner` kjøres
  og funksjonen limes inn i Supabase på nytt. Nye VAPID-nøkler (`npm run vapid -- --ny`) gjør at alle enheter må slå på
  varsler igjen. Den private nøkkelen og cron-hemmeligheten skal bare ligge i Data/ og i Supabase.
- `crypto.randomUUID` finnes bare på https/localhost – bruk alltid `nyId()` fra `modell.ts`.
- Headless Edge kan ikke lage vinduer smalere enn ~500 px. Mobil-skjermbilder: iframe-siden må serveres fra samme
  adresse som appen (ikke `file://` – da henger appen på lasteikonet), eller bruk CDP `Emulation.setDeviceMetricsOverride`.
- `.env.local` finnes lokalt: `npm run dev` kobler til den ekte databasen. For demomodus: sett
  `VITE_SUPABASE_URL=` og `VITE_SUPABASE_ANON_KEY=` tomme i miljøet før `vite` startes.
- Filene har CRLF i arbeidsmappa. Søk-og-erstatt-skript som matcher flere linjer må ta høyde for `
`.
- Sletting av en kategori flytter poster i fellesbudsjettet og eget privatbudsjett, men ikke i den
  andres privatbudsjett (den er ikke lesbar). De vises som «Uten kategori» hos den andre.
