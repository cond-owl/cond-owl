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
npx tsc --noEmit   # tipos (obrigatório passar)
npm run lint       # ESLint (obrigatório passar)
```

Também **testar o PWA no navegador** (`npm run web`) quando a mudança toca
tela: a maior parte dos usuários é web, e o que funciona no nativo nem
sempre funciona no navegador (e vice-versa).

Instalação de dependência: **sempre** `npx expo install <pacote>` (nunca
npm/yarn/pnpm add direto) — resolve versões compatíveis com o SDK 57.

## Entrega — teste end-to-end antes de entregar

**Nenhum ajuste está entregue sem teste end-to-end do fluxo afetado.** O
projeto ainda não tem suíte automatizada, então o e2e é manual e tem que
percorrer o caminho do usuário de ponta a ponta, não só o trecho editado:

1. **Subir o app** (`npm run web`; se a mudança for específica de nativo,
   `npm run android` ou `npm run ios`).
2. **Percorrer o fluxo REAL afetado, na pele do usuário:** login → aba
   envolvida → ação pedida → resultado na tela e no banco (conferir que a
   linha/estado gravou). Ex.: mudança no Mural = entrar como morador, ler
   comunicado, marcar como visto; e como síndico, publicar.
3. **Percorrer os dois perfis** (morador e síndico) quando a mudança toca
   permissão, aprovação ou aba que difere por perfil.
4. **Testar o caso de erro de propósito** (campo fora do limite, sem
   conexão, acesso pendente) e conferir que a mensagem aparece e o app fica
   usável depois.
5. **Se mudança toca os dois ambientes, testar nativo E web** — o que
   passou em um não garante o outro (ver `components/date-time-field`).
6. A resposta final ao usuário cita o que foi testado e o resultado.

Depois de o projeto ganhar testes automatizados, passar a suíte (e2e
incluída) passa a ser requisito junto do `tsc` e do `lint`.

## O que a IA nunca faz

- Criar ou editar `ios/` e `android/` (CNG: gerados, configuram-se por
  `app.json` e config plugins).
- Editar migração aplicada.
- Introduzir chave/confidencialidade no código do app.
- Instalar dependência fora do `expo install` sem justificar.
- Renomear arquivos ou mudar caminhos (import de "../Auth") sem necessidade.
- Ignorar erros de tipo com `any` para "resolver" o `tsc`.
- Adicionar `console.log` com dados pessoais.

## Como documentar decisões

- Decisão de banco → comentário na migração + item no `supabase/README.md`.
- Regra de negócio de agenda/calendário → `src/utils/README.md`.
- Padrão novo/recorrente → nesta pasta (`docs/ai/`), num PR.
- Feedback de usuário sobre a IA (erro que não pode repetir) vira lembrete
  nesta pasta, se for de padrão de código.
