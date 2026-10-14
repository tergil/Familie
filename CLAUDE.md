# Familie – prosjektfakta

Personlige arbeidsinstrukser ligger i `~/.claude/CLAUDE.md`. Denne fila handler bare om prosjektet.

## Hva appen er

- Privat budsjett-dashboard for Terje og Ingrid (kun to brukere).
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
- **Varsler** (Oppsett → Varsler, `sider/Varsler.tsx`): push til iPhone (hjemskjerm, iOS 16.4+) og Android.
  Edge Function «varsler» kjøres hver time av pg_cron, regner ut med `logikk/varsler.ts` og sender til brukerne som
  har valgt den timen. `public/sw.js` viser varselet (ingen mellomlagring).
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
npm run ikoner       # lager app-ikonene i public/ fra SVG-en i scripts/lag-ikoner.mjs
npm run varsel-funksjon  # bygger supabase/functions/varsler/index.ts fra supabase/kilde/varsler.ts + src/logikk
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
| `supabase/varsler.sql` | Varsler: `varsel_abonnement` (enheter), `varsel_innstilling`, `varsel_sendt`. Timejobben står i Data/varsler-oppsett.txt |
| `supabase/kilde/`, `supabase/functions/` | Edge Function «varsler» (kilde + generert fil som limes inn i Supabase) |
| `supabase/lister.sql` | Tabellene `liste` (`eier` null = felles) og `listepunkt` (arver synlighet fra listen), funksjonen `hent_delt_liste` (delingslenker) og Storage-bøtta `vedlegg` |
| `scripts/` | Tester, Excel-import, datasjekk |
| `Data/` | **Private regneark og importfiler. ALDRI i Git.** |

## Konvensjoner

- Norsk overalt: UI, kode (variabler, funksjoner, filer), kommentarer og commit-meldinger.
- React 19 + TypeScript + Vite. Ingen UI-bibliotek – egen CSS med tokens i `tokens.css`.
- Beregninger skal ligge i `src/logikk/` og ha tester i `scripts/test-beregning.ts`.
- Beløp lagres med frekvens (mnd/kvartal/halvår/år) og regnes om med `tilMnd`.
- All ny UI skal bruke eksisterende klasser (`kort`, `rad`, `knapp`, `kpi`, `merkelapp`, `Ark` …).
- Kategorifarger er `--k0`…`--k7`, validert for fargeblindhet. Ikke endre på øyemål –
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
- GitHub Pages krever offentlig repo på gratis GitHub-konto. Repoet heter `Sulamitten`, appen ligger på
  https://tergil.github.io/Sulamitten/. `base` i `vite.config.ts` hentes fra repo-navnet i GitHub Actions. Får repoet nytt
  navn, endres adressen: Supabase Auth → URL Configuration må få den nye adressen, hjemskjerm-appen må legges til på
  nytt, varsler slås på igjen og delingslenker deles på nytt.
- **Delingslenker** går forbi innloggingen via `hent_delt_liste` (security definer). Funksjonen skal bare returnere
  felt som er ment for deling – legg aldri til vedlegg, mottaker eller budsjettkobling der.
- **Vedlegg** ligger i Storage-bøtta `vedlegg` under `<liste-id>/<punkt-id>/`. Tilgangen følger listen. Sletter man et
  punkt eller en liste, blir filene liggende (så «Angre» virker) – de er da utilgjengelige, men tar plass.
- **Varsler:** endres `src/logikk/varsler.ts` (eller lister/gaveår-logikken den bruker), må `npm run varsel-funksjon` kjøres
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
