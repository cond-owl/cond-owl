-- CondoOwl — funções de permissão (leem o JWT; app_metadata não é editável pelo cliente)
-- Branch fix/0001-vulnerabilidade-perfil-aprovacao. Banco novo; motivos das decisões em supabase/README.md.

create function public.is_sindico()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'sindico'
$$;

-- Síndico ou morador aprovado. Nega por padrão (sem token ou sem status).
create function public.is_aprovado()
returns boolean
language sql
stable
as $$
  select public.is_sindico()
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'status_aprovacao', '') = 'aprovado'
$$;
