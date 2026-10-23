-- CondoOwl — tipo de usuário (síndico ou morador) como tabela e coluna em perfis
-- Branch feat/0005-criar-codigo-condominio-ao-entrar-no-app. Motivos das decisões em supabase/README.md.

-- Tabela de tipos. Só leitura pela API: quem cria ou muda tipos é o dono do banco (SQL).
create table public.tipo_usuario (
  id   smallint generated always as identity primary key,
  nome text not null unique check (nome in ('sindico', 'morador'))
);
alter table public.tipo_usuario enable row level security;

create policy tipo_usuario_select on public.tipo_usuario
  for select to authenticated using (true);

revoke all on public.tipo_usuario from anon, authenticated;
grant select on public.tipo_usuario to authenticated;

insert into public.tipo_usuario (nome) values ('sindico'), ('morador');

-- Qualquer papel que não seja exatamente 'sindico' é morador (nega por padrão, como is_sindico()).
create function public.tipo_usuario_id_de(papel text)
returns smallint
language sql
stable
set search_path = public, pg_temp
as $$
  select t.id from public.tipo_usuario t
   where t.nome = case when papel = 'sindico' then 'sindico' else 'morador' end
$$;

-- Coluna em perfis. Perfis que já existem recebem o tipo que está em app_metadata
-- (a fonte do perfil desde a 0003); só depois a coluna passa a ser obrigatória.
alter table public.perfis
  add column tipo_usuario_id smallint references public.tipo_usuario (id) on delete restrict;

update public.perfis p
   set tipo_usuario_id = public.tipo_usuario_id_de(u.raw_app_meta_data ->> 'role')
  from auth.users u
 where u.id = p.id;

alter table public.perfis alter column tipo_usuario_id set not null;
create index perfis_tipo_usuario_id_idx on public.perfis (tipo_usuario_id);

-- O usuário não troca o próprio tipo: o grant de update em perfis continua só em
-- nome_completo e celular (0003), e esta coluna não entra nele.

-- A coluna espelha app_metadata, que continua sendo a fonte (é o que o token e o RLS leem).
-- Cadastro: o perfil nasce com o tipo que o gatilho BEFORE (0012) acabou de definir.
create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.perfis (id, email, nome_completo, data_nascimento, celular, unidade, condominio_id, tipo_usuario_id)
  values (
    new.id,
    new.email,
    left(new.raw_user_meta_data ->> 'nome_completo', 120),
    public.data_br_ou_nula(new.raw_user_meta_data ->> 'data_nascimento'),
    left(new.raw_user_meta_data ->> 'celular', 20),
    left(new.raw_user_meta_data ->> 'unidade', 30),
    (select c.id from public.condominios c
      where c.codigo = lower(btrim(new.raw_user_meta_data ->> 'codigo_condominio'))),
    public.tipo_usuario_id_de(new.raw_app_meta_data ->> 'role')
  );
  return new;
end;
$$;

-- Promoção ou rebaixamento depois do cadastro (feito pelo dono do banco em app_metadata):
-- a coluna acompanha, para os dois nunca divergirem.
create function public.sincronizar_tipo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.perfis
     set tipo_usuario_id = public.tipo_usuario_id_de(new.raw_app_meta_data ->> 'role')
   where id = new.id;
  return new;
end;
$$;

create trigger sincronizar_tipo_usuario
  after update of raw_app_meta_data on auth.users
  for each row
  when ((old.raw_app_meta_data ->> 'role') is distinct from (new.raw_app_meta_data ->> 'role'))
  execute function public.sincronizar_tipo_usuario();

-- O login pergunta se o usuário logado é do tipo escolhido na tela (Morador ou Síndico).
-- Sim ou não, só para `authenticated`, sobre auth.uid() (nunca um id vindo do cliente).
-- O parâmetro não se chama `nome`: a coluna vence o parâmetro em função SQL (ver 0012).
create function public.usuario_e_do_tipo(tipo_informado text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.perfis p
      join public.tipo_usuario t on t.id = p.tipo_usuario_id
     where p.id = (select auth.uid())
       and t.nome = lower(btrim(tipo_informado))
  )
$$;

revoke execute on function public.usuario_e_do_tipo(text) from public, anon;
grant  execute on function public.usuario_e_do_tipo(text) to authenticated;
