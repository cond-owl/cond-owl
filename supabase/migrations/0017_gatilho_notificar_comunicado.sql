-- CondoOwl — dispara o push quando o síndico publica um comunicado.
--
-- Por quê: a Edge Function notificar-comunicados existia, mas nada versionado a
-- chamava. Dependia de um Database Webhook criado à mão no painel, que não está
-- no repositório, não é reproduzível em outro projeto e, criado pelo painel,
-- envia a chave anon (a função exigia service_role e respondia 401). Resultado:
-- o síndico publicava e ninguém era notificado.
--
-- Como: gatilho AFTER INSERT em comunicados chama a função por pg_net. A chamada
-- é assíncrona (enfileirada e enviada depois do commit), então não atrasa nem
-- derruba a publicação, e some junto se a transação for desfeita. O gatilho
-- nunca falha o INSERT: qualquer erro vira WARNING.
--
-- Segredos: URL e segredo da função ficam no Vault, nunca no código. Criar ANTES
-- de depender do push (valores reais fora do git):
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/notificar-comunicados',
--                              'notificar_comunicados_url');
--   select vault.create_secret('<mesmo valor de NOTIFICAR_WEBHOOK_SECRET da função>',
--                              'notificar_comunicados_segredo');
--
-- Resultado de cada disparo (status HTTP e corpo) fica em net._http_response, que o
-- pg_net apaga depois de cerca de 6 horas: consultar logo após publicar. O timeout é
-- de 30 s porque a função só responde depois de enviar ao FCM (cold start incluso).

create extension if not exists pg_net with schema extensions;

create or replace function public.notificar_comunicado_publicado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_segredo text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets
   where name = 'notificar_comunicados_url';
  select decrypted_secret into v_segredo
    from vault.decrypted_secrets
   where name = 'notificar_comunicados_segredo';

  if v_url is null or v_segredo is null then
    raise warning 'Push do comunicado % não enviado: secrets notificar_comunicados_url e notificar_comunicados_segredo precisam existir no Vault.', new.id;
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_segredo
    ),
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', new.id,
        'tipo', new.tipo,
        'titulo', new.titulo,
        'texto', new.texto
      )
    ),
    timeout_milliseconds := 30000
  );

  return new;
exception when others then
  raise warning 'Push do comunicado % não enviado: %', new.id, sqlerrm;
  return new;
end;
$$;

-- Só o gatilho a executa; ninguém a chama pela API.
revoke all on function public.notificar_comunicado_publicado()
  from public, anon, authenticated;

drop trigger if exists comunicados_notificar on public.comunicados;
create trigger comunicados_notificar
  after insert on public.comunicados
  for each row execute function public.notificar_comunicado_publicado();
