-- CondoOwl — o login confere se o usuário pertence ao condomínio do código informado
-- Branch feat/0005-criar-codigo-condominio-ao-entrar-no-app. Motivos das decisões em supabase/README.md.

-- Depois do login, o app pergunta se o usuário logado pertence ao condomínio do código
-- digitado na primeira tela. Responde só sim ou não: não revela a qual condomínio o
-- usuário pertence nem lista nada. Só `authenticated` executa (precisa de login), e o
-- usuário avaliado é sempre quem está logado (auth.uid()), nunca um id vindo do cliente.
-- O parâmetro não se chama `codigo` pelo mesmo motivo da 0012 (a coluna vence o parâmetro).
create function public.usuario_pertence_ao_condominio(codigo_informado text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.perfis p
      join public.condominios c on c.id = p.condominio_id
     where p.id = (select auth.uid())
       and c.codigo = lower(btrim(codigo_informado))
  )
$$;

revoke execute on function public.usuario_pertence_ao_condominio(text) from public, anon;
grant  execute on function public.usuario_pertence_ao_condominio(text) to authenticated;

-- Contas criadas antes da 0012 não têm condominio_id e seriam barradas no login. Enquanto
-- existir um único condomínio, não há ambiguidade: elas pertencem a ele. Com mais de um,
-- não adivinha: não mexe em nada e a associação deve ser feita à mão.
update public.perfis
   set condominio_id = (select id from public.condominios)
 where condominio_id is null
   and (select count(*) from public.condominios) = 1;
