-- Familiebudsjett – databaseoppsett for Supabase.
-- Kjøres én gang i Supabase → SQL Editor. Trygt å kjøre på nytt.
--
-- Sikkerhetsmodell (RLS = Row Level Security, regler i databasen som gjelder uansett hva appen gjør):
--   * Bare e-poster i tabellen `medlem` slipper inn i det hele tatt.
--   * felles_dok: ett dokument, lese/skrive for alle medlemmer.
--   * privat_dok: ett dokument per bruker, KUN eieren kan lese eller skrive.
--   * historikk: hver lagring tar vare på forrige versjon (angremulighet). Kan ikke leses fra appen.

-- ---------------------------------------------------------------------------
-- Medlemmer (hvem som har tilgang). Legg inn e-postene nederst i fila.
-- ---------------------------------------------------------------------------
create table if not exists public.medlem (
  epost text primary key check (epost = lower(epost))
);
alter table public.medlem enable row level security;
-- Ingen policyer: tabellen kan ikke leses eller endres fra appen, bare via funksjonen under.

create or replace function public.er_medlem()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.medlem where epost = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.er_medlem() from public;
grant execute on function public.er_medlem() to authenticated;

-- ---------------------------------------------------------------------------
-- Fellesbudsjettet
-- ---------------------------------------------------------------------------
create table if not exists public.felles_dok (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  versjon int not null default 1,
  endret timestamptz not null default now(),
  endret_av text not null default coalesce(auth.jwt() ->> 'email', '')
);
alter table public.felles_dok enable row level security;

drop policy if exists "medlem leser felles" on public.felles_dok;
create policy "medlem leser felles" on public.felles_dok
  for select to authenticated using (public.er_medlem());

drop policy if exists "medlem oppretter felles" on public.felles_dok;
create policy "medlem oppretter felles" on public.felles_dok
  for insert to authenticated with check (public.er_medlem());

drop policy if exists "medlem endrer felles" on public.felles_dok;
create policy "medlem endrer felles" on public.felles_dok
  for update to authenticated using (public.er_medlem()) with check (public.er_medlem());
-- Ingen delete-policy: fellesdokumentet kan ikke slettes fra appen.

-- ---------------------------------------------------------------------------
-- Privatbudsjett – ett per bruker
-- ---------------------------------------------------------------------------
create table if not exists public.privat_dok (
  eier uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  versjon int not null default 1,
  endret timestamptz not null default now()
);
alter table public.privat_dok enable row level security;

drop policy if exists "eier leser privat" on public.privat_dok;
create policy "eier leser privat" on public.privat_dok
  for select to authenticated using (eier = auth.uid() and public.er_medlem());

drop policy if exists "eier oppretter privat" on public.privat_dok;
create policy "eier oppretter privat" on public.privat_dok
  for insert to authenticated with check (eier = auth.uid() and public.er_medlem());

drop policy if exists "eier endrer privat" on public.privat_dok;
create policy "eier endrer privat" on public.privat_dok
  for update to authenticated using (eier = auth.uid() and public.er_medlem())
  with check (eier = auth.uid() and public.er_medlem());

-- ---------------------------------------------------------------------------
-- Historikk: forrige versjon lagres automatisk ved hver endring
-- ---------------------------------------------------------------------------
create table if not exists public.historikk (
  id bigint generated always as identity primary key,
  tabell text not null,
  eier uuid,
  versjon int not null,
  data jsonb not null,
  lagret timestamptz not null default now()
);
alter table public.historikk enable row level security;
-- Ingen policyer: bare tilgjengelig for deg i Supabase-dashbordet (Table Editor).

create or replace function public.ta_vare_paa_forrige()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.endret := now();
  insert into public.historikk (tabell, eier, versjon, data)
  values (tg_table_name, case when tg_table_name = 'privat_dok' then old.eier end, old.versjon, old.data);
  return new;
end;
$$;

drop trigger if exists historikk_felles on public.felles_dok;
create trigger historikk_felles before update on public.felles_dok
  for each row execute function public.ta_vare_paa_forrige();

drop trigger if exists historikk_privat on public.privat_dok;
create trigger historikk_privat before update on public.privat_dok
  for each row execute function public.ta_vare_paa_forrige();

-- ---------------------------------------------------------------------------
-- Tilganger: bare innloggede brukere (authenticated) får røre tabellene – RLS-reglene over
-- avgjør deretter hvilke rader. Anonyme (ikke innlogget) får ingenting.
-- Eksplisitt fordi nyere Supabase-prosjekter ikke alltid gir dette automatisk.
-- ---------------------------------------------------------------------------
revoke all on public.medlem, public.felles_dok, public.privat_dok, public.historikk from anon, authenticated;
grant select, insert, update on public.felles_dok to authenticated;
grant select, insert, update on public.privat_dok to authenticated;

-- ---------------------------------------------------------------------------
-- LEGG INN DERES E-POSTER HER (små bokstaver), og kjør denne delen:
-- ---------------------------------------------------------------------------
-- insert into public.medlem (epost) values
--   ('din@gmail.com'),
--   ('samboer@gmail.com')
-- on conflict do nothing;
