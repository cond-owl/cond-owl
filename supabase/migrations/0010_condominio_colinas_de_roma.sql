-- CondoOwl — dados iniciais: condomínio Colinas de Roma II
-- Branch fix/0001-vulnerabilidade-perfil-aprovacao. Banco novo; motivos das decisões em supabase/README.md.

-- A primeira versão da 0009 exigia o código em maiúsculas. A regra vigente é
-- minúsculas; recriar a constraint conserta bancos que já rodaram a versão antiga e
-- não muda nada nos demais.
alter table public.condominios drop constraint if exists condominios_codigo_check;
alter table public.condominios add constraint condominios_codigo_check
  check (codigo = lower(btrim(codigo)) and char_length(codigo) between 3 and 20);

-- Roda como dono do banco (SQL Editor / migração), por isso passa pelo RLS.
-- Reexecutar não duplica: o código é único.
insert into public.condominios (nome, codigo)
values ('Colinas de Roma II', 'colinasderomaii.owl')
on conflict (codigo) do nothing;
