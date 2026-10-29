-- CondoOwl — comunicados com categoria Conduta, destaque de importante e
-- destinatário por apartamento.
--
-- Conduta é a única categoria que pode escolher o apartamento destinatário. Quem
-- garante o sigilo é o RLS: filtrar no app não bastaria, porque a chave anon é
-- pública e qualquer morador poderia consultar a tabela direto. As demais
-- categorias continuam sem unidade_destino, ou seja, para todos os aprovados.

alter table public.comunicados
  add column importante boolean not null default false,
  add column unidade_destino text
    check (char_length(unidade_destino) between 1 and 30);

-- Conduta exige o apartamento; as outras categorias não podem restringir o envio.
alter table public.comunicados
  add constraint comunicados_unidade_destino_ck check (
    (upper(tipo) = 'CONDUTA' and unidade_destino is not null)
    or (upper(tipo) <> 'CONDUTA' and unidade_destino is null)
  );

create index comunicados_unidade_destino_idx
  on public.comunicados (unidade_destino)
  where unidade_destino is not null;

-- Substitui a policy de leitura: o síndico vê tudo; o morador vê os comunicados
-- gerais e os de conduta do próprio apartamento.
drop policy comunicados_select on public.comunicados;

create policy comunicados_select on public.comunicados
  for select to authenticated
  using (
    (select public.is_sindico())
    or (
      (select public.is_aprovado())
      and (
        unidade_destino is null
        or lower(unidade_destino) = lower((
          select p.unidade
            from public.perfis p
           where p.id = (select auth.uid())
        ))
      )
    )
  );

-- A confirmação de ciência só vale para comunicado que o usuário consegue ler.
-- Sem isso bastaria adivinhar o id de uma conduta alheia para registrá-la como
-- vista (o select continua barrado, mas o histórico de ciência ficaria errado).
drop policy comunicados_vistos_insert on public.comunicados_vistos;

create policy comunicados_vistos_insert on public.comunicados_vistos
  for insert to authenticated
  with check (
    (select public.is_aprovado())
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.comunicados c where c.id = comunicado_id
    )
  );