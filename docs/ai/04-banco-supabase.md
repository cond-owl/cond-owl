# Banco e Supabase

Fonte completa das decisões: `supabase/README.md` (auditoria de segurança,
achado por achado). Aqui vai o operacional.

## Migrações

- Esquema vive em `supabase/migrations/`, numerado (`0001` a `0014`) e
  aplicável **em ordem**.
- **Nunca editar uma migração já aplicada.** Mudança no banco = migração
  NOVA, com o próximo número, assunto no nome e comentário explicando o
  porquê no topo do arquivo.
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
- [ ] Validado num Postgres descartável com `auth` simulado
      (roteiro no fim do `supabase/README.md`).
