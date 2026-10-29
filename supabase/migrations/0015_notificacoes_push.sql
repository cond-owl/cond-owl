-- CondoOwl — token FCM e preferências de notificações push.
-- A migração é idempotente porque o esquema pode já ter sido ajustado manualmente
-- no painel; ainda assim, toda instalação nova recebe as mesmas colunas e grants.

alter table public.perfis
  add column if not exists fcm_token text,
  add column if not exists notifica_manutencao boolean not null default true,
  add column if not exists notifica_social boolean not null default true;

-- Em produção as colunas podem ter sido criadas manualmente sem default/NOT NULL.
-- O app interpreta NULL como habilitado, então o backfill preserva esse comportamento.
update public.perfis
   set notifica_manutencao = coalesce(notifica_manutencao, true),
       notifica_social = coalesce(notifica_social, true)
 where notifica_manutencao is null or notifica_social is null;

alter table public.perfis
  alter column notifica_manutencao set default true,
  alter column notifica_manutencao set not null,
  alter column notifica_social set default true,
  alter column notifica_social set not null;

-- O usuário atualiza apenas o próprio token e preferências. As policies de 0003
-- continuam limitando a linha ao próprio perfil; os dados de perfil seguem restritos.
grant update (fcm_token, notifica_manutencao, notifica_social)
  on public.perfis to authenticated;
