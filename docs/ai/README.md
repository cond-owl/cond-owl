# Padrões do projeto — leitura obrigatória para IA

Esta pasta define o padrão de código e as regras do CondoOwl. **Toda IA
(assistente, agente, copiloto) que for mexer neste projeto deve ler estes
arquivos antes de escrever a primeira linha de código** — e seguir o
`AGENTS.md` na raiz, que resume o contexto de Expo.

## Ordem de leitura

| Ordem | Arquivo | O que cabe nele |
|-------|---------|-----------------|
| 1 | [`01-visao-e-stack.md`](01-visao-e-stack.md) | O que é o app, perfis, tecnologias e limites conhecidos |
| 2 | [`02-arquitetura-e-estrutura.md`](02-arquitetura-e-estrutura.md) | Onde cada coisa vive, rotas e divisão de responsabilidade |
| 3 | [`03-padrao-de-codigo.md`](03-padrao-de-codigo.md) | Nomes, comentários, estilos, estrutura de componentes e manipulação de dados |
| 4 | [`04-banco-supabase.md`](04-banco-supabase.md) | Migrações, RLS, traduções de erro e regras de segurança |
| 5 | [`05-fluxo-de-trabalho.md`](05-fluxo-de-trabalho.md) | Branches, commits, validações e o que nunca fazer |

## Para humanos

Esta pasta é útil também para gente: é o manual do padrão da casa. A diferença
para o `README.md` da raiz: lá explica **o que o app faz**; aqui explica
**como escrever código que pertence a este projeto**.

## manutenção

- Qualquer decisão nova de padrão entra aqui, no arquivo do assunto, num PR.
- Este conjunto de documentos **é a fonte de verdade**: se algum README por aí
  entrar em conflito com estes arquivos, vale o que está aqui (ou atualiza-se
  aqui, com justificativa).
