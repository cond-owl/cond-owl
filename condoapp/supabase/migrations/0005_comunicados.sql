-- CondoOwl — comunicados (só síndico publica) e quem já viu
-- Branch fix/0001-vulnerabilidade-perfil-aprovacao. Banco novo; motivos das decisões em supabase/README.md.

-- Comunicados: só o síndico publica.
create table public.comunicados (
  id         bigint generated always as identity primary key,
  tipo       text not null check (char_length(tipo) between 1 and 30),
  titulo     text not null check (char_length(titulo) between 1 and 120),
  texto      text not null check (char_length(texto) between 1 and 2000),
  autor_id   uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
alter table public.comunicados enable row level security;

create policy comunicados_select on public.comunicados
  for select to authenticated using ((select public.is_aprovado()));
create policy comunicados_insert on public.comunicados
  for insert to authenticated
  with check ((select public.is_sindico()) and autor_id = (select auth.uid()));
create policy comunicados_update on public.comunicados
  for update to authenticated
  using ((select public.is_sindico())) with check ((select public.is_sindico()));
create policy comunicados_delete on public.comunicados
  for delete to authenticated using ((select public.is_sindico()));

-- Quem já viu cada comunicado (o app usa "vistoPor"). Cada um registra só o seu.
create table public.comunicados_vistos (
  comunicado_id bigint not null references public.comunicados (id) on delete cascade,
  user_id       uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  visto_em      timestamptz not null default now(),
  primary key (comunicado_id, user_id)
);
alter table public.comunicados_vistos enable row level security;

create policy comunicados_vistos_select on public.comunicados_vistos
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_sindico()));
create policy comunicados_vistos_insert on public.comunicados_vistos
  for insert to authenticated
  with check ((select public.is_aprovado()) and user_id = (select auth.uid()));


revoke all on public.comunicados, public.comunicados_vistos from anon, authenticated;
grant select, insert, update, delete on public.comunicados to authenticated;
grant select, insert on public.comunicados_vistos to authenticated;
