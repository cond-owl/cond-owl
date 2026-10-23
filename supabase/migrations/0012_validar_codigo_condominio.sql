-- CondoOwl — o código de condomínio passa a ser validado pelo servidor
-- Branch feat/0005-criar-codigo-condominio-ao-entrar-no-app. Motivos das decisões em supabase/README.md.

-- Antes de o login aparecer, o app pergunta ao banco se o código existe. A tabela
-- `condominios` não é legível sem login (0009), então a pergunta é uma função que só
-- devolve sim ou não: não lista condomínios nem devolve o id. A comparação usa a mesma
-- normalização do código guardado (minúsculas, sem espaços nas pontas).
-- O parâmetro não se chama `codigo` de propósito: em função SQL a coluna `c.codigo`
-- vence o parâmetro de mesmo nome, e a comparação viraria coluna = coluna (sempre
-- verdadeira para qualquer código).
create function public.validar_codigo_condominio(codigo_informado text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.condominios c where c.codigo = lower(btrim(codigo_informado))
  )
$$;

revoke execute on function public.validar_codigo_condominio(text) from public;
grant  execute on function public.validar_codigo_condominio(text) to anon, authenticated;

-- A tela de código é só a porta de entrada; quem chamar o cadastro direto pela API
-- pularia a tela. Por isso o cadastro também exige um código de condomínio existente:
-- sem ele (ou com código desconhecido) a conta não é criada. Mesma estrutura da 0003,
-- com a checagem do condomínio antes da do código de síndico.
create or replace function public.definir_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  codigo     text := new.raw_user_meta_data ->> 'codigo_sindico';
  eh_sindico boolean := false;
begin
  if not public.validar_codigo_condominio(new.raw_user_meta_data ->> 'codigo_condominio') then
    raise exception 'condominio_invalido';
  end if;

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

-- O perfil nasce já ligado ao condomínio do código informado (coluna da 0011, que o
-- usuário não consegue alterar depois).
create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.perfis (id, email, nome_completo, data_nascimento, celular, unidade, condominio_id)
  values (
    new.id,
    new.email,
    left(new.raw_user_meta_data ->> 'nome_completo', 120),
    public.data_br_ou_nula(new.raw_user_meta_data ->> 'data_nascimento'),
    left(new.raw_user_meta_data ->> 'celular', 20),
    left(new.raw_user_meta_data ->> 'unidade', 30),
    (select c.id from public.condominios c
      where c.codigo = lower(btrim(new.raw_user_meta_data ->> 'codigo_condominio')))
  );
  return new;
end;
$$;
