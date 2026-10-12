-- Huskelister: lister og punktene i dem.
-- Kjøres én gang i Supabase → SQL Editor (etter skjema.sql). Trygt å kjøre på nytt.
--
-- liste.eier = null        → felles: alle medlemmer ser og kan endre
-- liste.eier = innlogget   → privat: bare eieren ser listen og punktene i den
-- Punktene har ingen egen eier – de arver synligheten fra listen sin.
-- Én rad per punkt, så dere kan krysse av samtidig uten konflikt.
-- «ekstra» (jsonb) holder felt som bare appen bruker (lenke, mottaker, vurdering, budsjettkobling …),
-- så nye felt ikke krever endringer i databasen.

create table if not exists public.liste (
  id uuid primary key default gen_random_uuid(),
  eier uuid references auth.users (id) on delete cascade,
  navn text not null,
  ikon text not null default '',
  kategori text not null default '',
  type text not null default 'sjekk',
  mal boolean not null default false,
  rekkefolge numeric not null default 0,
  ekstra jsonb not null default '{}',
  opprettet timestamptz not null default now()
);
alter table public.liste enable row level security;

create table if not exists public.listepunkt (
  id uuid primary key default gen_random_uuid(),
  liste_id uuid not null references public.liste (id) on delete cascade,
  forelder_id uuid references public.listepunkt (id) on delete cascade,
  tekst text not null default '',
  notat text not null default '',
  status text not null default '',
  belop numeric(12, 2),
  dato date,
  rekkefolge numeric not null default 0,
  ekstra jsonb not null default '{}',
  opprettet timestamptz not null default now(),
  lagt_til_av text not null default coalesce(auth.jwt() ->> 'email', '')
);
create index if not exists listepunkt_liste on public.listepunkt (liste_id);
alter table public.listepunkt enable row level security;

-- Lister: felles for medlemmer, private bare for eieren
drop policy if exists "les liste" on public.liste;
create policy "les liste" on public.liste for select to authenticated
  using (public.er_medlem() and (eier is null or eier = auth.uid()));
drop policy if exists "ny liste" on public.liste;
create policy "ny liste" on public.liste for insert to authenticated
  with check (public.er_medlem() and (eier is null or eier = auth.uid()));
drop policy if exists "endre liste" on public.liste;
create policy "endre liste" on public.liste for update to authenticated
  using (public.er_medlem() and (eier is null or eier = auth.uid()))
  with check (public.er_medlem() and (eier is null or eier = auth.uid()));
drop policy if exists "slett liste" on public.liste;
create policy "slett liste" on public.liste for delete to authenticated
  using (public.er_medlem() and (eier is null or eier = auth.uid()));

-- Punkter: tilgang hvis du ser listen. Oppslaget i «liste» følger reglene over,
-- så punkter i den andres private lister er usynlige og kan ikke endres.
drop policy if exists "les punkt" on public.listepunkt;
create policy "les punkt" on public.listepunkt for select to authenticated
  using (public.er_medlem() and exists (select 1 from public.liste l where l.id = liste_id));
drop policy if exists "nytt punkt" on public.listepunkt;
create policy "nytt punkt" on public.listepunkt for insert to authenticated
  with check (public.er_medlem() and exists (select 1 from public.liste l where l.id = liste_id));
drop policy if exists "endre punkt" on public.listepunkt;
create policy "endre punkt" on public.listepunkt for update to authenticated
  using (public.er_medlem() and exists (select 1 from public.liste l where l.id = liste_id))
  with check (public.er_medlem() and exists (select 1 from public.liste l where l.id = liste_id));
drop policy if exists "slett punkt" on public.listepunkt;
create policy "slett punkt" on public.listepunkt for delete to authenticated
  using (public.er_medlem() and exists (select 1 from public.liste l where l.id = liste_id));

revoke all on public.liste, public.listepunkt from anon, authenticated;
grant select, insert, update, delete on public.liste, public.listepunkt to authenticated;
