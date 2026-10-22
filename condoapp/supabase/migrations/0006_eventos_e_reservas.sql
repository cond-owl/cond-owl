-- CondoOwl — eventos do calendário e reservas de espaço
-- Branch fix/0001-vulnerabilidade-perfil-aprovacao. Banco novo; motivos das decisões em supabase/README.md.

-- Eventos do calendário e reservas de espaço (tipo = 'reserva', titulo = espaço).
create table public.eventos (
  id          bigint generated always as identity primary key,
  data        date not null,
  tipo        text not null check (tipo in ('manutencao', 'reuniao', 'reserva')),
  titulo      text not null check (char_length(titulo) between 1 and 120),
  detalhes    text not null default '' check (char_length(detalhes) <= 2000),
  hora_inicio time,
  hora_fim    time,
  criado_por  uuid not null default auth.uid() references auth.users (id),
  created_at  timestamptz not null default now(),
  -- reserva exige horário válido; os demais tipos podem não ter.
  constraint eventos_horario_ck check (
    (hora_inicio is null and hora_fim is null and tipo <> 'reserva')
    or (hora_inicio is not null and hora_fim is not null and hora_fim > hora_inicio)
  ),
  -- Conflito de reserva decidido pelo banco: mesmo espaço, mesmo dia, horários que se cruzam.
  constraint eventos_reserva_sem_conflito exclude using gist (
    titulo with =,
    tsrange(data + hora_inicio, data + hora_fim) with &&
  ) where (tipo = 'reserva')
);
alter table public.eventos enable row level security;

create policy eventos_select on public.eventos
  for select to authenticated using ((select public.is_aprovado()));
-- Síndico cria qualquer evento; morador aprovado só reserva em seu nome, de hoje em diante
-- (data de hoje no fuso de Brasília, não o do servidor).
create policy eventos_insert on public.eventos
  for insert to authenticated
  with check (
    (select public.is_sindico())
    or (
      (select public.is_aprovado())
      and tipo = 'reserva'
      and criado_por = (select auth.uid())
      and data >= (now() at time zone 'America/Sao_Paulo')::date
    )
  );
create policy eventos_update on public.eventos
  for update to authenticated
  using ((select public.is_sindico())) with check ((select public.is_sindico()));
create policy eventos_delete on public.eventos
  for delete to authenticated using ((select public.is_sindico()));


revoke all on public.eventos from anon, authenticated;
grant select, insert, update, delete on public.eventos to authenticated;
