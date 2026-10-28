# Fluxo de trabalho

## Branches

- Padrão: `tipo/NNNN-descricao` —
  `feat/0010-notificacoes-no-app`,
  `fix/0003-corrigir-typescript-app-tabs`,
  `feat/0012-padronizacao-ia`.
- NNNN conta corrido por projeto; consultar a branch de maior número aberta
  ou mesclada.
- Padrão do repositório é PR → revisão → merge (no host que o projeto usa;
  ver remoto `origin`).

## Commits

- Mensagem curta, no mesmo estilo dos existentes no `git log`
  (resumo do que mudou, sem corpo obrigatório). Exemplos reais:
  `Ajuste logo PWA`, `nova logo`, `Ajustes que quebraram o deploy`.
- Um assunto por commit; nada de commit gigante misturando banco e app.

## Validação antes de "pronto"

```bash
npm run verificar   # tsc + lint + checagem de segredo/.env.example
npm run e2e         # build web + Playwright (entrada no app)
```

- `npm run verificar` roda `tsc --noEmit`, o ESLint com os gates do padrão
  (`no-explicit-any`, `no-console`, datas restritas a `calendario.ts`) e o
  `scripts/verificar.mjs`, que barra credencial hardcoded e variável
  `EXPO_PUBLIC_*` usada sem linha no `.env.example`.
- Quando o código consulta ou grava dados no Supabase, revisar as referências
  de tabelas/colunas/RPCs contra as migrações e conferir grants e RLS. Para schema
  que também foi alterado manualmente em produção, preparar SQL somente leitura
  que mostre o estado atual em um único resultado; não inferir histórico de
  migração apenas pela presença das colunas.
- `npm run e2e` gera a build web e roda os testes do Playwright em
  `e2e/` — hoje cobre a barreira de código do condomínio (abertura, código
  vazio, código inexistente e código válido indo ao login), com o RPC do
  Supabase interceptado (não toca o banco real).
- Teste novo de fluxo vai em `e2e/`, com o mesmo padrão: interceptar a
  chamada de rede e atestar a tela.

Também **testar o PWA no navegador** (`npm run web`) quando a mudança toca
tela: a maior parte dos usuários é web, e o que funciona no nativo nem
sempre funciona no navegador (e vice-versa).

Instalação de dependência: **sempre** `npx expo install <pacote>` (nunca
npm/yarn/pnpm add direto) — resolve versões compatíveis com o SDK 57. A
exceção são ferramentas de desenvolvimento que não vão para o bundle
(ex.: `@playwright/test`), instaladas com `npm i -D`.

## Entrega — teste end-to-end antes de entregar

**Nenhum ajuste está entregue sem teste end-to-end do fluxo afetado.** O e2e
tem duas camadas:

1. **Automatizado** (`npm run e2e`): roda a suíte do Playwright.
2. **Manual, do fluxo real:** o caminho do usuário de ponta a ponta, não só
   o trecho editado:
   1. **Subir o app** (`npm run web`; se a mudança for específica de
      nativo, `npm run android` ou `npm run ios`).
   2. **Percorrer o fluxo REAL afetado:** login → aba envolvida → ação
      pedida → resultado na tela e no banco (conferir que a linha/estado
      gravou). Ex.: mudança no Mural = entrar como morador, ler comunicado,
      marcar como visto; e como síndico, publicar.
   3. **Percorrer os dois perfis** (morador e síndico) quando a mudança
      toca permissão, aprovação ou aba que difere por perfil.
   4. **Testar o caso de erro de propósito** (campo fora do limite, sem
      conexão, acesso pendente) e conferir que a mensagem aparece e o app
      fica usável depois.
   5. **Se mudança toca os dois ambientes, testar nativo E web** — o que
      passou em um não garante o outro (ver `components/date-time-field`).
3. A resposta final ao usuário cita o que foi testado e o resultado.

## O que a IA nunca faz

- Criar ou editar `ios/` e `android/` (CNG: gerados, configuram-se por
  `app.json` e config plugins).
- Editar migração aplicada.
- Introduzir chave/confidencialidade no código do app.
- Instalar dependência fora do `expo install` sem justificar.
- Renomear arquivos ou mudar caminhos (import de "../Auth") sem necessidade.
- Ignorar erros de tipo com `any` para "resolver" o `tsc`.
- Usar `console.*` no `src/`.
- Formatar data fora de `src/utils/calendario.ts`.

## Como documentar decisões

- Decisão de banco → comentário na migração + item no `supabase/README.md`.
- Regra de negócio de agenda/calendário → `src/utils/README.md`.
- Padrão novo/recorrente → nesta pasta (`docs/ai/`), num PR.
- Feedback de usuário sobre a IA (erro que não pode repetir) vira lembrete
  nesta pasta, se for de padrão de código.
