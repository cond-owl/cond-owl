-- CondoOwl — tokens push por dispositivo e plataforma.
-- Um perfil pode usar vários aparelhos; os tokens web e nativos têm provedores diferentes.

create table if not exists public.dispositivos_notificacao (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.perfis (id) on delete cascade,
  plataforma   text not null check (plataforma in ('web', 'expo')),
  token        text not null,
  created_at   timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists dispositivos_notificacao_user_id_idx
  on public.dispositivos_notificacao (user_id);

alter table public.dispositivos_notificacao enable row level security;

create policy dispositivos_notificacao_select_proprio
  on public.dispositivos_notificacao
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy dispositivos_notificacao_insert_proprio
  on public.dispositivos_notificacao
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy dispositivos_notificacao_update_proprio
  on public.dispositivos_notificacao
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy dispositivos_notificacao_delete_proprio
  on public.dispositivos_notificacao
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.dispositivos_notificacao from anon, authenticated;
grant select, insert, update, delete on public.dispositivos_notificacao
  to authenticated;

-- Mantém os tokens web existentes durante a transição do campo legado.
insert into public.dispositivos_notificacao (user_id, plataforma, token)
select p.id, 'web', p.fcm_token
from public.perfis p
where p.fcm_token is not null
on conflict (user_id, token) do nothing;
