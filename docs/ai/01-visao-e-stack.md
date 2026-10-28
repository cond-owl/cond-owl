# Visão e stack

## O que é

CondoOwl é um aplicativo de gestão de condomínio (comunicados, agenda e
reservas, atas, caixa de sugestões, aprovação de moradores). Roda no celular
(Android e iOS) e no navegador como PWA, com o mesmo código. O condomínio
piloto é o **Colinas de Roma II**.

## Dois perfis, uma tela

O app inteiro (pós-login) vive praticamente numa tela (`src/app/index.tsx`)
com abas. O que muda por perfil:

| Aba | Morador | Síndico |
|-----|---------|---------|
| Mural | lê e marca como visto | publica por categoria |
| Agenda | eventos de hoje em diante; reserva espaços | vê também histórico |
| Atas | lê | cadastra |
| Sugestões | envia | aprova ou arquiva (motivo obrigatório ao arquivar) |
| Aprovar | — | libera acesso de moradores novos |

Morador novo fica em **Cadastro em Análise** até o síndico aprovar.

## Stack

- **App:** Expo 57 (SDK 57), React Native 0.86, React 19, TypeScript estrito,
  Expo Router para navegação, React Compiler ligado. Controle de versão por
  `package-lock.json` (npm), não bun/yarn/pnpm.
- **Banco e autenticação:** Supabase (Postgres, Auth, RLS). O app fala
  direto com as tabelas pelo `@supabase/supabase-js`; **não existe servidor
  próprio** — regra de negócio que precisa de garantia vai para o banco
  (função, gatilho, constraint, RLS), nunca para o cliente.
- **Build:** EAS (`eas.json`); web como PWA (`public/index.html`).

## Limites conhecidos (não é bug, é estado atual)

- Dados ainda não são separados por condomínio nas policies do banco
  (um condomínio só). Resolver antes de entrar o segundo condomínio.
- Sem tempo real: as listas recarregam ao entrar em cada aba.
- Sem testes automatizados; conferência é `npx tsc --noEmit` + `npm run lint`.
- Upload do PDF da ata não existe (guarda nome ou link).
- Notificações push do PWA via Firebase Cloud Messaging Web
  (`src/utils/notificacoes.ts`, tabela `dispositivos_notificacao`). O token é
  registrado por instalação do PWA depois de a pessoa permitir notificações;
  criar conta não cria nem autoriza token push.

Expo muda muito entre versões: **não responder de memória**. Consultar
https://docs.expo.dev/versions/v57.0.0/ e https://docs.expo.dev/llms.txt
antes de qualquer API de Expo/EAS/React Native.
