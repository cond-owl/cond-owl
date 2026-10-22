-- =====================================================================
-- CondoOwl — endurecimento de autenticação/autorização no Supabase
--
-- NÃO APLICADO. Revisar e aplicar manualmente (SQL Editor) em horário
-- combinado: o app passou a ler perfil/aprovação de app_metadata, então
-- este script precisa estar aplicado ANTES de publicar a nova versão do app.
--
-- Por que: user_metadata é editável pelo próprio usuário
-- (supabase.auth.updateUser({ data: { role: 'sindico' } })). Decidir
-- síndico/aprovado por ele permite que qualquer pessoa se promova.
-- app_metadata só é alterável pelo servidor (service_role / SQL).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1) Código de síndico: guardado só como hash, fora do app
-- ---------------------------------------------------------------------
create table if not exists public.app_secrets (
  name       text primary key,
  value_hash text not null
);
alter table public.app_secrets enable row level security; -- sem policy: invisível pela API
revoke all on public.app_secrets from anon, authenticated;

-- Defina um código NOVO e forte (o "OWL2026" antigo está no histórico do git
-- e no bundle já publicado: considere-o vazado). Rode uma vez:
--
-- insert into public.app_secrets (name, value_hash)
-- values ('codigo_sindico', extensions.crypt('TROQUE-POR-UM-CODIGO-FORTE', extensions.gen_salt('bf')))
-- on conflict (name) do update set value_hash = excluded.value_hash;

-- ---------------------------------------------------------------------
-- 2) Perfil definido pelo servidor no cadastro
--    - sem código: morador / pendente
--    - código correto: síndico / aprovado
--    - código errado: cadastro recusado
--    role e status enviados pelo cliente são descartados.
-- ---------------------------------------------------------------------
create or replace function public.definir_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  codigo     text := new.raw_user_meta_data ->> 'codigo_sindico';
  eh_sindico boolean := false;
begin
  if codigo is not null and codigo <> '' then
    select s.value_hash = extensions.crypt(codigo, s.value_hash)
      into eh_sindico
      from public.app_secrets s
     where s.name = 'codigo_sindico';

    if not coalesce(eh_sindico, false) then
      raise exception 'codigo_invalido';
    end if;
  end if;

  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
         'role',             case when eh_sindico then 'sindico'  else 'morador'  end,
         'status_aprovacao', case when eh_sindico then 'aprovado' else 'pendente' end
       );

  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb)
    - 'role' - 'status_aprovacao' - 'codigo_sindico';

  return new;
end;
$$;

drop trigger if exists definir_perfil_novo_usuario on auth.users;
create trigger definir_perfil_novo_usuario
  before insert on auth.users
  for each row execute function public.definir_perfil_novo_usuario();

-- ---------------------------------------------------------------------
-- 3) Usuários que já existem (REVISAR ANTES)
--    Liste quem hoje se declara síndico e confirme que são legítimos:
--
-- select id, email, raw_user_meta_data ->> 'role' as role_declarado,
--        raw_user_meta_data ->> 'status_aprovacao' as status_declarado
--   from auth.users order by created_at;
--
--    Depois preencha os e-mails dos síndicos reais e rode:
--
-- update auth.users
--    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--      || jsonb_build_object(
--           'role', case when email in ('SINDICO@EXEMPLO.COM') then 'sindico' else 'morador' end,
--           'status_aprovacao',
--             case when email in ('SINDICO@EXEMPLO.COM') then 'aprovado'
--                  else coalesce(raw_user_meta_data ->> 'status_aprovacao', 'pendente') end)
--  where raw_app_meta_data ->> 'role' is null;
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 4) Funções do síndico: só síndico autenticado executa
--    Confira as definições atuais antes (\sf public.get_moradores_pendentes).
--    Se o tipo de retorno atual for diferente, o CREATE OR REPLACE falha
--    em vez de sobrescrever às cegas.
-- ---------------------------------------------------------------------
create or replace function public.is_sindico()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'sindico'
$$;

create or replace function public.get_moradores_pendentes()
returns table (
  id              uuid,
  email           text,
  nome_completo   text,
  data_nascimento text,
  unidade         text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_sindico() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select u.id,
         u.email::text,
         u.raw_user_meta_data ->> 'nome_completo',
         u.raw_user_meta_data ->> 'data_nascimento',
         u.raw_user_meta_data ->> 'unidade'
    from auth.users u
   where u.raw_app_meta_data ->> 'role' = 'morador'
     and coalesce(u.raw_app_meta_data ->> 'status_aprovacao', 'pendente') = 'pendente'
     and u.email_confirmed_at is not null;
end;
$$;

create or replace function public.aprovar_acesso_morador(morador_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_sindico() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || '{"status_aprovacao":"aprovado"}'::jsonb
   where id = morador_id
     and raw_app_meta_data ->> 'role' = 'morador';
end;
$$;

-- Funções nascem executáveis por PUBLIC/anon: fechar e liberar só a logados.
revoke execute on function public.get_moradores_pendentes()  from public, anon, authenticated;
revoke execute on function public.aprovar_acesso_morador(uuid) from public, anon, authenticated;
grant  execute on function public.get_moradores_pendentes()  to authenticated;
grant  execute on function public.aprovar_acesso_morador(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Para toda tabela futura em public (comunicados, reservas, sugestões…):
--    alter table public.<tabela> enable row level security;
--    e criar policies explícitas (morador lê o que é do condomínio; só
--    is_sindico() escreve comunicados/aprova sugestões; reserva só do
--    próprio usuário). Sem RLS, a chave anônima do app dá acesso à tabela.
--
-- 6) Painel do Supabase (Authentication):
--    - Passwords: mínimo 8 e "Prevent use of leaked passwords" ligado
--    - Rate limits / CAPTCHA (Turnstile/hCaptcha) em sign-up e reset
--    - URL Configuration: Site URL e Redirect URLs só do domínio do PWA
--    - Anonymous sign-ins desligado; confirmação de e-mail mantida ligada
-- ---------------------------------------------------------------------
