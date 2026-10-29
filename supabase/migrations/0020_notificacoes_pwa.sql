-- CondoOwl — reconcilia tokens PWA existentes e limita destinatários aprovados.
-- O token por instalação é a fonte do envio; `perfis.fcm_token` permanece
-- preenchido para compatibilidade com contas e ferramentas legadas.

alter table public.perfis
  add column if not exists fcm_token text;

grant update (fcm_token) on public.perfis to authenticated;

insert into public.dispositivos_notificacao (user_id, plataforma, token)
select p.id, 'web', p.fcm_token
from public.perfis p
where p.fcm_token is not null and btrim(p.fcm_token) <> ''
on conflict (user_id, token) do nothing;

-- Preenche o campo legado dos perfis que já tinham token cadastrado por aparelho.
update public.perfis p
   set fcm_token = d.token
  from (
    select distinct on (user_id) user_id, token
      from public.dispositivos_notificacao
     where plataforma = 'web'
     order by user_id, created_at desc, id desc
  ) d
 where p.id = d.user_id
   and (p.fcm_token is null or btrim(p.fcm_token) = '');

drop policy if exists dispositivos_notificacao_insert_proprio
  on public.dispositivos_notificacao;

create policy dispositivos_notificacao_insert_proprio
  on public.dispositivos_notificacao
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_aprovado())
  );

-- A Edge Function usa service_role, mas auth.users não é exposta na API.
-- Esta função entrega somente tokens web de usuários aprovados, em páginas.
create or replace function public.tokens_notificacao_pwa(
  p_inicio integer default 0,
  p_limite integer default 1000
)
returns table (
  id uuid,
  token text,
  notifica_manutencao boolean,
  notifica_social boolean,
  unidade text
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.token, p.notifica_manutencao, p.notifica_social, p.unidade
    from public.dispositivos_notificacao d
    join public.perfis p on p.id = d.user_id
    join auth.users u on u.id = d.user_id
   where d.plataforma = 'web'
     and (
       coalesce(u.raw_app_meta_data ->> 'role', '') = 'sindico'
       or coalesce(u.raw_app_meta_data ->> 'status_aprovacao', '') = 'aprovado'
     )
   order by d.id
   offset greatest(coalesce(p_inicio, 0), 0)
   limit least(greatest(coalesce(p_limite, 1000), 1), 1000);
$$;

revoke all on function public.tokens_notificacao_pwa(integer, integer)
  from public, anon, authenticated;
grant execute on function public.tokens_notificacao_pwa(integer, integer)
  to service_role;

notify pgrst, 'reload schema';
