-- CondoOwl — perfis (dados pessoais) e gatilhos de cadastro
-- Branch fix/0001-vulnerabilidade-perfil-aprovacao. Banco novo; motivos das decisões em supabase/README.md.

create table public.perfis (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  nome_completo   text check (char_length(nome_completo) <= 120),
  data_nascimento date,
  celular         text check (char_length(celular) <= 20),
  unidade         text check (char_length(unidade) <= 30),
  created_at      timestamptz not null default now()
);
alter table public.perfis enable row level security;

-- BEFORE INSERT em auth.users: o servidor decide perfil e aprovação.
--   sem código: morador / pendente
--   código correto: síndico / aprovado
--   código errado: cadastro recusado
-- role e status enviados pelo cliente são descartados.
create function public.definir_perfil_novo_usuario()
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

create trigger definir_perfil_novo_usuario
  before insert on auth.users
  for each row execute function public.definir_perfil_novo_usuario();

-- "DD/MM/AAAA" do app para date; data inválida vira null e não derruba o cadastro.
create function public.data_br_ou_nula(texto text)
returns date
language plpgsql
immutable
set search_path = pg_temp
as $$
begin
  return to_date(texto, 'DD/MM/YYYY');
exception when others then
  return null;
end;
$$;

-- AFTER INSERT em auth.users: cria a linha em perfis a partir dos dados do cadastro.
create function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.perfis (id, email, nome_completo, data_nascimento, celular, unidade)
  values (
    new.id,
    new.email,
    left(new.raw_user_meta_data ->> 'nome_completo', 120),
    public.data_br_ou_nula(new.raw_user_meta_data ->> 'data_nascimento'),
    left(new.raw_user_meta_data ->> 'celular', 20),
    left(new.raw_user_meta_data ->> 'unidade', 30)
  );
  return new;
end;
$$;

create trigger criar_perfil_novo_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- Perfis: o usuário lê e edita só a si (nome e celular); síndico lê todos.
-- Unidade e e-mail não são editáveis pelo usuário: o síndico aprova com base neles.
create policy perfis_select on public.perfis
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_sindico()));

create policy perfis_update_proprio on public.perfis
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;
grant update (nome_completo, celular) on public.perfis to authenticated;
