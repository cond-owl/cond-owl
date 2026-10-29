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
      || count(*) filter (where plataforma = 'web')::text || ' instalação(ões) PWA'
  from public.dispositivos_notificacao

  union all

  select
    9,
    'Extensão pg_net',
    case when exists (select 1 from pg_extension where extname = 'pg_net')
      then 'OK' else 'FALHA' end,
    'A migração 0017 usa pg_net para chamar a Edge Function'

  union all

  select
    10,
    'Gatilho comunicados_notificar',
    case when exists (
      select 1
      from pg_trigger t
      where t.tgrelid = 'public.comunicados'::regclass
        and t.tgname = 'comunicados_notificar'
        and t.tgenabled = 'O'
        and not t.tgisinternal
    ) then 'OK' else 'FALHA' end,
    'Sem o gatilho, publicar comunicado não dispara push; remover o Database Webhook antigo do painel para não duplicar'

  union all

  select
    11,
    'Função do gatilho fechada à API',
    case when to_regprocedure('public.notificar_comunicado_publicado()') is not null
      and not has_function_privilege(
        'authenticated',
        to_regprocedure('public.notificar_comunicado_publicado()'),
        'execute'
      )
    then 'OK' else 'FALHA' end,
    'Esperado: SECURITY DEFINER sem EXECUTE para authenticated'

  union all

  select
    12,
    'Secrets do Vault (só nomes)',
    case when (
      select count(*)
      from vault.secrets
      where name in ('notificar_comunicados_url', 'notificar_comunicados_segredo')
    ) = 2 then 'OK' else 'FALHA' end,
    'Esperados: notificar_comunicados_url e notificar_comunicados_segredo'

  union all

  select
    13,
    'Respostas da função (pg_net)',
    'INFO',
    case when to_regclass('net._http_response') is null
      then 'pg_net ainda não instalado'
      else (xpath(
        '/row/r/text()',
        query_to_xml(
          $q$select count(*) filter (where status_code = 200)::text
                 || ' com HTTP 200; '
                 || count(*) filter (where status_code is distinct from 200)::text
                 || ' com outro status ou erro (o pg_net guarda ~6 h)' as r
             from net._http_response
$q$,
          false, true, ''
        )
      ))[1]::text
    end

  union all

  select
    14,
    'FK dos tokens para perfis',
    case when exists (
      select 1
      from pg_constraint
      where conrelid = 'public.dispositivos_notificacao'::regclass
        and contype = 'f'
        and conname = 'dispositivos_notificacao_user_id_fkey'
        and confrelid = 'public.perfis'::regclass
    ) then 'OK' else 'FALHA' end,
    'A Edge Function junta tokens e preferências por essa FK (nome exato)'

  union all

  select
    15,
    'service_role lê tokens e perfis',
    case when has_table_privilege('service_role', 'public.dispositivos_notificacao', 'select, delete')
      and has_table_privilege('service_role', 'public.perfis', 'select')
    then 'OK' else 'FALHA' end,
    'A função usa service_role para ler tokens/preferências e apagar tokens mortos'

  union all

  select
    16,
    'Usuários sem perfil',
    case when exists (
      select 1 from auth.users u
      left join public.perfis p on p.id = u.id
      where p.id is null
    ) then 'FALHA' else 'OK' end,
    'Sem linha em perfis o token do usuário não pode ser gravado (FK, erro 23503)'
)
select verificacao, resultado, detalhe
from validacoes
order by ordem;
