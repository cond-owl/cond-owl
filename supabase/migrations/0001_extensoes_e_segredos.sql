-- CondoOwl — extensões e segredo do código de síndico
-- Branch fix/0001-vulnerabilidade-perfil-aprovacao. Banco novo; motivos das decisões em supabase/README.md.

create extension if not exists pgcrypto   with schema extensions;
create extension if not exists btree_gist with schema extensions;
create table public.app_secrets (
  name       text primary key,
  value_hash text not null
);
alter table public.app_secrets enable row level security; -- sem policy: invisível pela API
revoke all on public.app_secrets from anon, authenticated;

-- Defina o código DEPOIS de rodar este script (código novo e forte; o antigo
-- "OWL2026" está no histórico do git e no bundle já publicado: considere-o vazado):
--
-- insert into public.app_secrets (name, value_hash)
-- values ('codigo_sindico', extensions.crypt('TROQUE-POR-UM-CODIGO-FORTE', extensions.gen_salt('bf')))
-- on conflict (name) do update set value_hash = excluded.value_hash;

