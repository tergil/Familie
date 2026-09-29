-- Oppfølging: førte utgifter og månedlige saldoer.
-- Kjøres én gang i Supabase → SQL Editor (etter skjema.sql). Trygt å kjøre på nytt.
--
-- eier = null        → felles: alle medlemmer ser og kan endre
-- eier = innlogget   → privat: bare eieren ser og kan endre
-- Én rad per utgift/saldo, så dere kan føre samtidig uten konflikt.

create table if not exists public.utgift (
  id uuid primary key default gen_random_uuid(),
  eier uuid references auth.users (id) on delete cascade,
  dato date not null,
  belop numeric(12, 2) not null check (belop <> 0),   -- negativt = retur/refusjon
  kategori_id text not null,
  konto_id text not null,
  notat text not null default '',
  fort_av text not null default coalesce(auth.jwt() ->> 'email', ''),
  opprettet timestamptz not null default now()
);
create index if not exists utgift_dato on public.utgift (dato);
alter table public.utgift enable row level security;

create table if not exists public.saldo (
  id uuid primary key default gen_random_uuid(),
  eier uuid references auth.users (id) on delete cascade,
  konto_id text not null,
  maaned text not null check (maaned ~ '^\d{4}-\d{2}$'),  -- saldo ved utgangen av måneden
  belop numeric(14, 2) not null,
  fort_av text not null default coalesce(auth.jwt() ->> 'email', ''),
  opprettet timestamptz not null default now(),
  unique nulls not distinct (eier, konto_id, maaned)
);
alter table public.saldo enable row level security;

-- Samme regel for begge: felles for medlemmer, private bare for eieren
drop policy if exists "les utgift" on public.utgift;
create policy "les utgift" on public.utgift for select to authenticated
  using (public.er_medlem() and (eier is null or eier = auth.uid()));
drop policy if exists "ny utgift" on public.utgift;
create policy "ny utgift" on public.utgift for insert to authenticated
  with check (public.er_medlem() and (eier is null or eier = auth.uid()));
drop policy if exists "endre utgift" on public.utgift;
create policy "endre utgift" on public.utgift for update to authenticated
  using (public.er_medlem() and (eier is null or eier = auth.uid()))
  with check (public.er_medlem() and (eier is null or eier = auth.uid()));
drop policy if exists "slett utgift" on public.utgift;
create policy "slett utgift" on public.utgift for delete to authenticated
  using (public.er_medlem() and (eier is null or eier = auth.uid()));

drop policy if exists "les saldo" on public.saldo;
create policy "les saldo" on public.saldo for select to authenticated
  using (public.er_medlem() and (eier is null or eier = auth.uid()));
drop policy if exists "ny saldo" on public.saldo;
create policy "ny saldo" on public.saldo for insert to authenticated
  with check (public.er_medlem() and (eier is null or eier = auth.uid()));
drop policy if exists "endre saldo" on public.saldo;
create policy "endre saldo" on public.saldo for update to authenticated
  using (public.er_medlem() and (eier is null or eier = auth.uid()))
  with check (public.er_medlem() and (eier is null or eier = auth.uid()));
drop policy if exists "slett saldo" on public.saldo;
create policy "slett saldo" on public.saldo for delete to authenticated
  using (public.er_medlem() and (eier is null or eier = auth.uid()));

revoke all on public.utgift, public.saldo from anon, authenticated;
grant select, insert, update, delete on public.utgift, public.saldo to authenticated;
