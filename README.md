# Familiebudsjett

Privat budsjett-dashboard for to personer: fellesbudsjett, privatbudsjett per person,
sankey-diagram av pengeflyten, sparemål og revisjoner. Bygget for mobil først.

Ingen økonomiske data ligger i dette repoet. Dataene lagres i Supabase og er beskyttet med
tilgangsregler i databasen (se [supabase/skjema.sql](supabase/skjema.sql)).

## Kjøre lokalt

```powershell
Start-Familie.cmd      # eller: npm install && npm run dev
```

Uten `.env.local` starter appen i **demomodus** med oppdiktede tall.

## Oppsett (én gang)

### 1. Supabase – database

1. Åpne prosjektet på [supabase.com](https://supabase.com/dashboard) → **SQL Editor** → **New query**.
2. Lim inn hele [supabase/skjema.sql](supabase/skjema.sql) og trykk **Run**.
3. Legg inn e-postene som skal ha tilgang (små bokstaver), og kjør:
   ```sql
   insert into public.medlem (epost) values ('din@gmail.com'), ('samboer@gmail.com') on conflict do nothing;
   ```

### 2. Google-innlogging

1. Gå til [Google Cloud Console](https://console.cloud.google.com/) → lag et nytt prosjekt («Familiebudsjett»).
2. **APIs & Services → OAuth consent screen**: velg *External*, fyll inn appnavn og e-post.
   Under **Test users**: legg til begge e-postene. (Så lenge appen står i «Testing» kan bare disse logge inn – en ekstra lås.)
3. **Credentials → Create credentials → OAuth client ID** → *Web application*.
   - **Authorized redirect URIs**: `https://<prosjekt-id>.supabase.co/auth/v1/callback`
     (prosjekt-id-en står i Supabase-adressen).
4. Kopier **Client ID** og **Client secret**.
5. I Supabase: **Authentication → Sign In / Providers → Google** → slå på, lim inn ID og secret, lagre.
6. I Supabase: **Authentication → URL Configuration**:
   - **Site URL**: `https://tergil.github.io/Familie/`
   - **Redirect URLs**: legg til `http://localhost:5180/**` og `https://tergil.github.io/Familie/**`

### 3. Koble appen til Supabase

Hent **Project URL** og **anon/publishable key** fra Supabase → **Project Settings → API**.

- **Lokalt**: kopier `.env.example` til `.env.local` og fyll inn.
- **GitHub**: repoet → **Settings → Secrets and variables → Actions → Variables** →
  legg til `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY`.

Anon-nøkkelen er laget for å ligge i nettleseren. Sikkerheten ligger i RLS-reglene, ikke i nøkkelen.

### 4. Publisere på GitHub Pages

- **Settings → Pages → Source: GitHub Actions**.
- Hver push til `poc` eller `main` bygger og publiserer (se [.github/workflows/pages.yml](.github/workflows/pages.yml)).
- NB: GitHub Pages fra **privat** repo krever GitHub Pro. På gratis konto må repoet være offentlig.

### 5. Første import fra Excel

```powershell
npm run importer -- --terje=din@gmail.com --ingrid=hennes@gmail.com
```

Logg inn i appen → **Import/eksport → Velg fil** → velg `Data/import-familiebudsjett.json`.
Fellesbudsjettet importeres for begge. Privatbudsjettet importeres bare hvis e-posten din matcher personen i fila.

## Sikkerhet i Git

`Data/` er ignorert, og en pre-commit-hook stopper regneark, importfiler og fulle kontonumre.
Aktiveres automatisk av `git config core.hooksPath .githooks` (gjøres én gang per maskin).
