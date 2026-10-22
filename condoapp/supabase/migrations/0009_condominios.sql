-- CondoOwl — condomínios (nome e código)
-- Branch fix/0001-vulnerabilidade-perfil-aprovacao. Banco novo; motivos das decisões em supabase/README.md.

-- Condomínio: nome e código. O código é guardado já normalizado (maiúsculas, sem
-- espaços nas pontas) e é único, para a comparação ser exata e sem ambiguidade.
create table public.condominios (
  id         bigint generated always as identity primary key,
  nome       text not null check (char_length(btrim(nome)) between 1 and 120),
  codigo     text not null unique
             check (codigo = upper(btrim(codigo)) and char_length(codigo) between 3 and 20),
  created_at timestamptz not null default now()
);
alter table public.condominios enable row level security;

-- Quem ainda não foi aprovado (ou não está logado) não lê: o código não deve vazar.
create policy condominios_select on public.condominios
  for select to authenticated using ((select public.is_aprovado()));
create policy condominios_insert on public.condominios
  for insert to authenticated with check ((select public.is_sindico()));
create policy condominios_update on public.condominios
  for update to authenticated
  using ((select public.is_sindico())) with check ((select public.is_sindico()));
create policy condominios_delete on public.condominios
  for delete to authenticated using ((select public.is_sindico()));

revoke all on public.condominios from anon, authenticated;
grant select, insert, update, delete on public.condominios to authenticated;
