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

-- ---------------------------------------------------------------------------
-- Deling via lenke (#/delt/<nøkkel>): leses uten innlogging, men bare med riktig nøkkel.
-- Nøkkelen ligger i liste.ekstra->>'deling' (tilfeldig uuid). Slås av ved å fjerne den i appen.
-- Gir bare det som trengs for visningen: navn, tekst, notat, pris, lenke og status. Ingen vedlegg.
-- ---------------------------------------------------------------------------
create or replace function public.hent_delt_liste(nokkel text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'navn', l.navn, 'ikon', l.ikon, 'type', l.type,
    'punkter', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'forelder_id', p.forelder_id, 'tekst', p.tekst, 'notat', p.notat,
        'status', p.status, 'belop', p.belop, 'rekkefolge', p.rekkefolge, 'lenke', p.ekstra ->> 'lenke'
      ) order by p.rekkefolge)
      from public.listepunkt p where p.liste_id = l.id
    ), '[]'::jsonb)
  )
  from public.liste l
  where length(nokkel) >= 32 and l.mal = false and l.ekstra ->> 'deling' = nokkel
  limit 1;
$$;
revoke all on function public.hent_delt_liste(text) from public;
grant execute on function public.hent_delt_liste(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vedlegg (bilder og PDF): privat bøtte i Supabase Storage.
-- Sti: <liste-id>/<punkt-id>/<fil>. Tilgang hvis du ser listen – private lister gir private vedlegg.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vedlegg', 'vedlegg', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "vedlegg les" on storage.objects;
create policy "vedlegg les" on storage.objects for select to authenticated
  using (bucket_id = 'vedlegg' and public.er_medlem()
    and exists (select 1 from public.liste l where l.id::text = (storage.foldername(name))[1]));
drop policy if exists "vedlegg ny" on storage.objects;
create policy "vedlegg ny" on storage.objects for insert to authenticated
  with check (bucket_id = 'vedlegg' and public.er_medlem()
    and exists (select 1 from public.liste l where l.id::text = (storage.foldername(name))[1]));
drop policy if exists "vedlegg slett" on storage.objects;
create policy "vedlegg slett" on storage.objects for delete to authenticated
  using (bucket_id = 'vedlegg' and public.er_medlem()
    and exists (select 1 from public.liste l where l.id::text = (storage.foldername(name))[1]));
