-- CondoOwl — atas de reunião
-- Branch fix/0001-vulnerabilidade-perfil-aprovacao. Banco novo; motivos das decisões em supabase/README.md.

-- Atas de reunião (o app agrupa por mês a partir de `data`). `arquivo` = nome/link do PDF.
create table public.atas (
  id         bigint generated always as identity primary key,
  data       date not null,
  pauta      text not null check (char_length(pauta) between 1 and 200),
  arquivo    text not null check (char_length(arquivo) between 1 and 500),
  criado_por uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
alter table public.atas enable row level security;

create policy atas_select on public.atas
  for select to authenticated using ((select public.is_aprovado()));
create policy atas_insert on public.atas
  for insert to authenticated
  with check ((select public.is_sindico()) and criado_por = (select auth.uid()));
create policy atas_update on public.atas
  for update to authenticated
  using ((select public.is_sindico())) with check ((select public.is_sindico()));
create policy atas_delete on public.atas
  for delete to authenticated using ((select public.is_sindico()));


revoke all on public.atas from anon, authenticated;
grant select, insert, update, delete on public.atas to authenticated;
