-- CondoOwl — RPCs do síndico: só síndico autenticado executa
-- Branch fix/0001-vulnerabilidade-perfil-aprovacao. Banco novo; motivos das decisões em supabase/README.md.


create function public.get_moradores_pendentes()
returns table (
  id              uuid,
  email           text,
  nome_completo   text,
  data_nascimento text,
  unidade         text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_sindico() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select p.id,
         p.email,
         p.nome_completo,
         to_char(p.data_nascimento, 'DD/MM/YYYY'),
         p.unidade
    from public.perfis p
    join auth.users u on u.id = p.id
   where u.raw_app_meta_data ->> 'role' = 'morador'
     and coalesce(u.raw_app_meta_data ->> 'status_aprovacao', 'pendente') = 'pendente'
     and u.email_confirmed_at is not null
   order by p.created_at;
end;
$$;

create function public.aprovar_acesso_morador(morador_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_sindico() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || '{"status_aprovacao":"aprovado"}'::jsonb
   where id = morador_id
     and raw_app_meta_data ->> 'role' = 'morador';
end;
$$;

-- Funções nascem executáveis por PUBLIC/anon: fechar e liberar só a logados.
revoke execute on function public.get_moradores_pendentes()    from public, anon, authenticated;
revoke execute on function public.aprovar_acesso_morador(uuid) from public, anon, authenticated;
grant  execute on function public.get_moradores_pendentes()    to authenticated;
grant  execute on function public.aprovar_acesso_morador(uuid) to authenticated;

