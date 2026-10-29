-- CondoOwl — espacos de reserva configuraveis pelo sindico
-- A aba Gestao cria e remove espacos; o calendario usa esta lista em vez da lista
-- fixa que estava no app. Remover o espaco nao apaga reservas antigas, porque os
-- eventos guardam o nome do espaco (titulo), nao o id.
-- Branch feat/0011-melhorias-e-reformulacoes-calendario. Motivos das decisões em supabase/README.md

create table public.espacos_reserva (
  id         bigint generated always as identity primary key,
  nome       text not null check (char_length(nome) between 1 and 60),
  created_at timestamptz not null default now()
);

-- Nome unico sem diferenciar maiusculas ("Salao" e "salao" sao o mesmo espaco).
create unique index espacos_reserva_nome_unico
  on public.espacos_reserva (lower(nome));

alter table public.espacos_reserva enable row level security;

create policy espacos_reserva_select on public.espacos_reserva
  for select to authenticated using ((select public.is_aprovado()));

create policy espacos_reserva_insert on public.espacos_reserva
  for insert to authenticated with check ((select public.is_sindico()));

create policy espacos_reserva_delete on public.espacos_reserva
  for delete to authenticated using ((select public.is_sindico()));

revoke all on public.espacos_reserva from anon, authenticated;
grant select, insert, delete on public.espacos_reserva to authenticated;

-- Mantem os tres espacos que estavam fixos no app, para a reserva continuar a
-- funcionar logo apos a migracao. O sindico pode editar a lista na aba Gestao.
insert into public.espacos_reserva (nome)
values ('Salão de Festas'), ('Churrasqueira'), ('Piscina')
on conflict do nothing;