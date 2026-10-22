-- CondoOwl — sugestões dos moradores
-- Branch fix/0001-vulnerabilidade-perfil-aprovacao. Banco novo; motivos das decisões em supabase/README.md.

-- Sugestões: morador aprovado envia (sempre pendente); só o síndico avalia.
create table public.sugestoes (
  id         bigint generated always as identity primary key,
  texto      text not null check (char_length(texto) between 1 and 1000),
  status     text not null default 'pendente' check (status in ('pendente', 'aprovada', 'arquivada')),
  motivo     text not null default '' check (char_length(motivo) <= 1000),
  autor_id   uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  -- regra do app: arquivar exige justificativa.
  constraint sugestoes_arquivada_exige_motivo check (status <> 'arquivada' or btrim(motivo) <> '')
);
alter table public.sugestoes enable row level security;

create policy sugestoes_select on public.sugestoes
  for select to authenticated using ((select public.is_aprovado()));
create policy sugestoes_insert on public.sugestoes
  for insert to authenticated
  with check (
    (select public.is_aprovado())
    and autor_id = (select auth.uid())
    and status = 'pendente'
    and motivo = ''
  );
create policy sugestoes_update on public.sugestoes
  for update to authenticated
  using ((select public.is_sindico())) with check ((select public.is_sindico()));
create policy sugestoes_delete on public.sugestoes
  for delete to authenticated using ((select public.is_sindico()));

revoke all on public.sugestoes from anon, authenticated;
grant select, insert, update, delete on public.sugestoes to authenticated;
