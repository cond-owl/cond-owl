-- Validação somente leitura do esquema, permissões e contagens agregadas de push.
-- Retorna um único resultado para exibição completa no SQL Editor do Supabase.

with colunas_perfil as (
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'perfis'
), validacoes as (
  select
    1 as ordem,
    'Preferência notifica_manutencao' as verificacao,
    case when exists (
      select 1 from colunas_perfil
      where column_name = 'notifica_manutencao'
        and data_type = 'boolean'
        and is_nullable = 'NO'
        and column_default like '%true%'
    ) then 'OK' else 'FALHA' end as resultado,
    'Esperado: boolean, NOT NULL, DEFAULT true' as detalhe

  union all

  select
    2,
    'Preferência notifica_social',
    case when exists (
      select 1 from colunas_perfil
      where column_name = 'notifica_social'
        and data_type = 'boolean'
        and is_nullable = 'NO'
        and column_default like '%true%'
    ) then 'OK' else 'FALHA' end,
    'Esperado: boolean, NOT NULL, DEFAULT true'

  union all

  select
    3,
    'Tabela dispositivos_notificacao',
    case when to_regclass('public.dispositivos_notificacao') is not null
      then 'OK' else 'FALHA' end,
    'A migração 0016 cria a tabela de tokens por aparelho'

  union all

  select
    4,
    'Colunas de token e plataforma',
    case when (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'dispositivos_notificacao'
        and column_name in ('user_id', 'plataforma', 'token')
    ) = 3 then 'OK' else 'FALHA' end,
    'Esperadas: user_id, plataforma e token'

  union all

  select
    5,
    'RLS habilitado nos tokens',
    case when exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'dispositivos_notificacao'
        and c.relrowsecurity
    ) then 'OK' else 'FALHA' end,
    'RLS deve estar habilitado'

  union all

  select
    6,
    'Policies próprias dos tokens',
    case when (
      select count(*)
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'dispositivos_notificacao'
        and p.polname in (
          'dispositivos_notificacao_select_proprio',
          'dispositivos_notificacao_insert_proprio',
          'dispositivos_notificacao_update_proprio',
          'dispositivos_notificacao_delete_proprio'
        )
    ) = 4 then 'OK' else 'FALHA' end,
    'Esperadas: SELECT, INSERT, UPDATE e DELETE do próprio usuário'

  union all

  select
    7,
    'Grants para registrar tokens',
    case when (
      select count(distinct privilege_type)
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name = 'dispositivos_notificacao'
        and grantee = 'authenticated'
        and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ) = 4 then 'OK' else 'FALHA' end,
    'Authenticated recebe os privilégios limitados pelas policies RLS'

  union all

  select
    8,
    'Dispositivos registrados',
    'INFO',
    count(*)::text || ' total; '
      || count(*) filter (where plataforma = 'web')::text || ' web; '
      || count(*) filter (where plataforma = 'expo')::text || ' nativos'
  from public.dispositivos_notificacao
)
select verificacao, resultado, detalhe
from validacoes
order by ordem;
