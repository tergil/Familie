-- Varsler (push): enheter, innstillinger og hva som er sendt.
-- Kjøres én gang i Supabase → SQL Editor (etter skjema.sql og lister.sql). Trygt å kjøre på nytt.
-- Timejobben (pg_cron) og hemmelighetene står i Data/varsler-oppsett.txt, laget av «npm run vapid» – ikke her,
-- fordi repoet er offentlig.

-- Enhetene (telefon, PC) som har slått på varsler. Bare eieren ser og endrer sine.
create table if not exists public.varsel_abonnement (
  id uuid primary key default gen_random_uuid(),
  bruker uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  enhet text not null default '',
  opprettet timestamptz not null default now()
);
alter table public.varsel_abonnement enable row level security;

-- Hva hver bruker vil ha varsel om, og når. Én rad per bruker.
create table if not exists public.varsel_innstilling (
  bruker uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  oppdatert timestamptz not null default now()
);
alter table public.varsel_innstilling enable row level security;

-- Varsler som er sendt (så de ikke sendes igjen). Bare Edge Function (tjenestenøkkelen) bruker den.
create table if not exists public.varsel_sendt (
  bruker uuid not null references auth.users (id) on delete cascade,
  nokkel text not null,
  sendt timestamptz not null default now(),
  primary key (bruker, nokkel)
);
alter table public.varsel_sendt enable row level security;

drop policy if exists "egne enheter" on public.varsel_abonnement;
create policy "egne enheter" on public.varsel_abonnement for all to authenticated
  using (public.er_medlem() and bruker = auth.uid())
  with check (public.er_medlem() and bruker = auth.uid());

drop policy if exists "egne varselinnstillinger" on public.varsel_innstilling;
create policy "egne varselinnstillinger" on public.varsel_innstilling for all to authenticated
  using (public.er_medlem() and bruker = auth.uid())
  with check (public.er_medlem() and bruker = auth.uid());
-- varsel_sendt: ingen policyer – kan ikke leses eller endres fra appen.

revoke all on public.varsel_abonnement, public.varsel_innstilling, public.varsel_sendt from anon, authenticated;
grant select, insert, update, delete on public.varsel_abonnement, public.varsel_innstilling to authenticated;
