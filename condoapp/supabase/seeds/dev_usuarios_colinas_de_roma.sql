-- CondoOwl — SEED DE DESENVOLVIMENTO: 1 síndico + 2 moradores em "Colinas de Roma II"
-- Branch fix/0001-vulnerabilidade-perfil-aprovacao.
--
-- NÃO é migração e NÃO deve rodar em produção: cria contas de teste. Rodar no SQL Editor
-- DEPOIS das migrações 0001 a 0011. As senhas são geradas aqui, aparecem só no resultado
-- final desta execução e não ficam no repositório: copie na hora.
-- Pode rodar de novo: quem já existe não é recriado nem tem a senha trocada.
--
-- Por que atualiza app_metadata no fim: o gatilho do cadastro (0003) só vale para INSERT
-- e, sem o código de síndico, cria todo mundo como morador pendente. Aqui o dono do banco
-- define o perfil direto, que é o jeito legítimo de promover alguém.

do $$
begin
  if not exists (select 1 from public.condominios where codigo = 'colinasderomaii.owl') then
    raise exception 'Condomínio colinasderomaii.owl não existe: rode a migração 0010 antes.';
  end if;
end
$$;

drop table if exists pg_temp._seed;
create temp table _seed (
  email   text primary key,
  nome    text,
  nasc    text,
  celular text,
  unidade text,
  papel   text,
  status  text,
  senha   text,
  uid     uuid default gen_random_uuid(),
  existia boolean default false
);

insert into _seed (email, nome, nasc, celular, unidade, papel, status, senha) values
  ('sindico.teste@colinasderoma.test',  'Sindico Teste', '01/01/1980', '(11) 90000-0001', 'Apto: 101', 'sindico', 'aprovado', encode(extensions.gen_random_bytes(9), 'hex')),
  ('morador1.teste@colinasderoma.test', 'Morador Um',    '02/02/1990', '(11) 90000-0002', 'Apto: 102', 'morador', 'aprovado', encode(extensions.gen_random_bytes(9), 'hex')),
  ('morador2.teste@colinasderoma.test', 'Morador Dois',  '03/03/1995', '(11) 90000-0003', 'Apto: 201', 'morador', 'aprovado', encode(extensions.gen_random_bytes(9), 'hex'));

update _seed s set existia = exists (select 1 from auth.users u where u.email = s.email);

-- Cadastro: passa pelos gatilhos da 0003 (viram morador/pendente e ganham linha em perfis).
-- Os campos de token vazios ('') são exigidos pelo GoTrue; com NULL o login quebra.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', s.uid, 'authenticated', 'authenticated', s.email,
       extensions.crypt(s.senha, extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('nome_completo', s.nome, 'data_nascimento', s.nasc,
                          'celular', s.celular, 'unidade', s.unidade),
       now(), now(), '', '', '', ''
  from _seed s
 where not s.existia;

-- Identidade de e-mail (necessária para entrar com e-mail e senha).
insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                             last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  from _seed s
  join auth.users u on u.email = s.email
 where not s.existia;

-- Perfil e aprovação definidos pelo servidor (app_metadata).
update auth.users u
   set raw_app_meta_data = u.raw_app_meta_data
       || jsonb_build_object('role', s.papel, 'status_aprovacao', s.status)
  from _seed s
 where u.email = s.email
   and not s.existia;

-- Associação ao condomínio.
update public.perfis p
   set condominio_id = (select c.id from public.condominios c where c.codigo = 'colinasderomaii.owl')
  from _seed s
  join auth.users u on u.email = s.email
 where p.id = u.id
   and not s.existia;

-- Resultado: copie as senhas agora; elas não ficam salvas em lugar nenhum.
select s.email,
       s.papel,
       s.unidade,
       case when s.existia then '(já existia: senha não alterada)' else s.senha end as senha
  from _seed s
 order by s.papel desc, s.email;
