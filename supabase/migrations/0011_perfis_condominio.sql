-- CondoOwl — vínculo do perfil com o condomínio
-- Branch fix/0001-vulnerabilidade-perfil-aprovacao. Banco novo; motivos das decisões em supabase/README.md.

-- Cada perfil pertence a um condomínio. Nulo = ainda não associado (cadastro novo
-- antes de o app informar o condomínio). `restrict`: não dá para apagar um condomínio
-- que ainda tem moradores.
alter table public.perfis
  add column condominio_id bigint references public.condominios (id) on delete restrict;

create index perfis_condominio_id_idx on public.perfis (condominio_id);

-- O usuário não troca o próprio condomínio: o grant de update em perfis continua só
-- em nome_completo e celular (0003), e esta coluna não entra nele. Quem associa é o
-- servidor (SQL / síndico por RPC futura), nunca o cliente.
