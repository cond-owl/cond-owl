# Banco e Supabase

Fonte completa das decisões: `supabase/README.md` (auditoria de segurança,
achado por achado). Aqui vai o operacional.

## Migrações

- Esquema vive em `supabase/migrations/`, numerado (`0001` em diante) e
  aplicável **em ordem**.
- **Nunca editar uma migração já aplicada.** Mudança no banco = migração
  NOVA, com o próximo número, assunto no nome e comentário explicando o
  porquê no topo do arquivo.
- Toda coluna, função, policy ou permissão usada pelo app/Edge Function precisa
  existir numa migração versionada, mesmo se já tiver sido criada manualmente
  em produção. Compare as referências do código com as migrações; corrija
  divergências com migração nova idempotente quando apropriado, sem depender
  apenas do estado manual do painel.
- A existência de uma coluna em produção **não comprova** que a migração foi
  aplicada. Separe sempre duas verificações: o estado real do schema e o histórico
  versionado no repositório.
- `IF NOT EXISTS` evita erro ao encontrar uma coluna criada manualmente, mas não
  corrige uma definição diferente. Se tipo, default, nulabilidade ou constraint
  puderem divergir, a migração também deve normalizar esses atributos e tratar os
  dados existentes antes de impor a regra (por exemplo, preencher `NULL` antes de
  `SET NOT NULL`). Não descarte nem sobrescreva valores válidos sem necessidade.
- Toda coluna que o cliente grava precisa de grant de coluna compatível e policy
  RLS que limite as linhas autorizadas. Verifique ambos; grant sozinho não substitui
  RLS, e policy sozinha não concede privilégio SQL.
- Seeds (`supabase/seeds/`) são dados de teste, **nunca rodam em produção**.
- O projeto **não usa** `supabase db push` no fluxo atual: as migrações são
  aplicadas no SQL Editor do Supabase, uma por uma.

## Segurança — regras inegociáveis

1. **Quem protege os dados é o banco (RLS), não o app.** A chave anon é
   pública; qualquer restrição que dependa do cliente é insegura.
2. **Perfil e aprovação em `app_metadata`** (só o servidor altera, via
   gatilhos do banco). `user_metadata` é só nome para exibição.
3. **Código de síndico não existe no app:** o banco guarda o hash
   (`app_secrets`) e valida no gatilho do cadastro.
4. **Código do condomínio validado no banco** (`validar_codigo_condominio`,
   `usuario_pertence_ao_condominio`), nunca por menos que isso no cliente.
5. **Nunca** usar a `service_role` no app. Nunca.
6. `console.log` não imprime dados pessoais do usuário.
7. **Segredo que não pode ser público não existe no cliente.** Não há
   servidor próprio: credencial sensível vira função/gatilho/RLS no banco.
   `.env` só carrega valores públicos por desenho (URL e anon key do
   Supabase, config web do Firebase) — e mesmo esses sempre via
   `process.env.EXPO_PUBLIC_*`, com exemplo no `.env.example`.

## Padrões de esquema (o que já está estabelecido)

- Tabelas e colunas em `snake_case` (evento `hora_inicio`, não `horaInicio`).
- Funções de permissão (SQL) leem do token: `is_sindico()`, `is_aprovado()`;
  as RPCs de aprovação (`get_moradores_pendentes`,
  `aprovar_acesso_morador`) exigem sessão.
- Restrições de integridade no banco: CHECK de limites de texto,
  exclusion constraint de reserva em conflito (`23P01`), CHECK de
  hora fim > hora início.
- Aprovação/arquivamento com motivo: UC no arquivamento exige motivo
  (app e banco conferem).

## Mudanças que tocam banco — checklist

- [ ] Migração nova numerada, sem tocar as antigas.
- [ ] RLS com policy para leitura e escrita (nega por padrão).
- [ ] Código Postgres provocável pelo usuário tem tradução no
      `mensagemDoErro` (utils/dadosCondominio.ts).
- [ ] `LIMITE` no app atualizado se algum CHECK mudou.
- [ ] Nada de segredo/credencial/URL interna hardcoded
      (tudo por `.env` + `.env.example`, ou pelo banco).
- [ ] `npm run verificar` passa (segredo, `.env.example`, tipos e lint).
- [ ] `supabase/docs/mapa-das-tabelas.md` atualizado.
- [ ] Colunas e grants usados pelo código conferidos contra migrações; divergência
      corrigida em migração nova, não só no painel.
- [ ] Para ajustes manuais históricos, SQL somente leitura de validação incluído
      em `scripts/` e executável no SQL Editor.
- [ ] O SQL de validação retorna um único conjunto de resultados, com uma linha
      por verificação e estados explícitos (`OK`, `FALHA` ou `INFO`), pois o editor
      pode exibir somente a última consulta do script.
- [ ] A validação confere presença e definição das colunas, grants, RLS e policies;
      não exibe tokens, dados pessoais ou outros valores sensíveis.
- [ ] Validado num Postgres descartável com `auth` simulado
      (roteiro no fim do `supabase/README.md`).
