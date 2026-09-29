# Familiebudsjett – prosjektfakta

Personlige arbeidsinstrukser ligger i `~/.claude/CLAUDE.md`. Denne fila handler bare om prosjektet.

## Hva appen er

- Privat budsjett-dashboard for Terje og Ingrid (kun to brukere).
- Brukes mest på mobil, også nettbrett og PC.
- Viser **budsjett**, ikke faktiske utgifter. Budsjettet revideres ca. to ganger i året (revisjoner).
- Fellesbudsjett (begge ser) + ett privatbudsjett per person (bare eieren ser).
- Sankey-diagram av pengeflyten: inntekt → lønnskonto → felleskonto → kategori.
- **Oppfølging**: førte utgifter mot budsjett (poster med «Følg opp») + månedlig saldokontroll per konto.
  Varsel ved mulig dobbeltføring (samme konto og beløp innen 7 dager). `#/ny` åpner «Før utgift» direkte.
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
```

- **Kjør `npm test` og `npm run typecheck` før du sier deg ferdig.**
- Uten `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` kjører appen i **demomodus** med oppdiktede tall
  lagret i nettleseren. «Se som …» under Import/eksport bytter person.

## Mappestruktur

| Mappe | Innhold |
|---|---|
| `src/data/` | `modell.ts` (typer), `lager.ts` (Supabase / lokal), `tilstand.tsx` (React-kontekst, lagring, angre), `demo.ts` |
| `src/logikk/` | Ren logikk uten React: `beregning.ts` (summer, avrunding, forslag, revisjoner), `flyt.ts` (sankey-noder), `oppfolging.ts` (saldokontroll, tempo, dubletter) |
| `src/ui/` | Gjenbrukbare komponenter: `felles.tsx` (ikoner, ark, felt, formatering), `Sankey.tsx`, `skjemaer.tsx`, `deler.tsx` |
| `src/sider/` | Én fil per side (Oversikt, Budsjett, Privat, Sparing, Revisjoner, Oppsett) |
| `src/stil/` | `tokens.css` (farger, avstander – lys/mørk) og `app.css` |
| `supabase/skjema.sql` | Budsjettdokumentene + RLS-regler. Kjøres i Supabase SQL Editor |
| `supabase/oppfolging.sql` | Tabellene `utgift` og `saldo` (egne rader, `eier` null = felles) |
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
- GitHub Pages krever offentlig repo på gratis GitHub-konto. `vite.config.ts` har `base: '/Familie/'` –
  må endres hvis repoet får nytt navn.
- `crypto.randomUUID` finnes bare på https/localhost – bruk alltid `nyId()` fra `modell.ts`.
- Headless Edge kan ikke lage vinduer smalere enn ~500 px. Mobil-skjermbilder må tas via en iframe.
- Sletting av en kategori flytter poster i fellesbudsjettet og eget privatbudsjett, men ikke i den
  andres privatbudsjett (den er ikke lesbar). De vises som «Uten kategori» hos den andre.
