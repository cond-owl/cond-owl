# CondoOwl

Aplicativo de gestão de condomínio. Reúne num só lugar o que síndico e moradores
costumam resolver por grupo de mensagens: **comunicados, agenda e reservas de espaços,
atas de reunião e caixa de sugestões**. Funciona no celular (Android e iOS) e no navegador
como PWA, com o mesmo código.

O condomínio piloto é o **Colinas de Roma II**.

## O que o app faz

O app tem dois perfis. Cada pessoa entra com o seu e só vê o que o perfil permite.

| Área | Morador | Síndico |
|------|---------|---------|
| **Mural** (comunicados) | lê e marca como visto | lê e publica, por categoria (aviso, reunião, manutenção, social) |
| **Agenda** | vê eventos de hoje em diante e reserva espaços | vê também o histórico |
| **Atas** | lê, por mês | lê e cadastra (data, pauta e nome ou link do PDF) |
| **Sugestões** | envia sugestões | aprova ou arquiva, com motivo obrigatório ao arquivar |
| **Aprovar** | — | libera o acesso de moradores recém-cadastrados |

Quem acabou de se cadastrar fica em **Cadastro em Análise** até o síndico aprovar.

### Como a pessoa entra

1. **Código do condomínio.** Na primeira tela, informa o código do condomínio. O servidor
   confere se ele existe; se não, aparece "Código de condomínio não encontrado."
2. **Login ou cadastro.** Escolhe a aba **Morador** ou **Síndico**. O cadastro de síndico
   pede ainda um código único de síndico, validado no servidor.
3. **Conferência no servidor.** Depois do login, o app confere se o usuário pertence ao
   condomínio do código digitado e se é do tipo da aba escolhida. Se não for, a sessão é
   encerrada e o motivo aparece no card de login.
4. **Aprovação.** Morador novo só usa o app depois que o síndico aprova.

## Tecnologias

- **App:** [Expo](https://expo.dev) 57, React Native 0.86, React 19, TypeScript e Expo Router
  (rotas por arquivo em `src/app/`). React Compiler ligado.
- **Banco e autenticação:** [Supabase](https://supabase.com) (Postgres, Auth e RLS). O app
  fala direto com as tabelas pelo `@supabase/supabase-js`; não há servidor próprio.
- **Build e publicação:** EAS (`eas.json`); versão web como PWA (`public/index.html`).

## Como rodar

Pré-requisitos: Node.js (versão LTS recente) e um projeto Supabase.

1. **Instalar as dependências**

   ```bash
   npm install
   ```

2. **Configurar o ambiente.** Copie `.env.example` para `.env` e preencha a URL e a chave
   **anon/public** do seu projeto Supabase. Nunca use a `service_role` no app.

   ```bash
   cp .env.example .env
   ```

3. **Montar o banco.** No SQL Editor do Supabase, rode em ordem os arquivos de
   [`supabase/migrations/`](supabase/migrations) (`0001` a `0019`). Depois defina o código
   de síndico (instruções no comentário da `0001`). Para ter contas de teste prontas, rode
   uma vez `supabase/seeds/dev_usuarios_colinas_de_roma.sql` (**nunca em produção**).
   Detalhes e decisões em [`supabase/README.md`](supabase/README.md).

4. **Iniciar o app**

   ```bash
   npm run web        # navegador (PWA)
   npm run android    # emulador ou aparelho Android
   npm run ios        # simulador iOS
   npx expo start     # menu com todas as opções
   ```

   Reinicie o servidor sempre que mudar o `.env`.

## Qualidade

Não há testes automatizados ainda. As conferências do projeto são:

```bash
npx tsc --noEmit   # tipos
npm run lint       # ESLint (na primeira vez o Expo cria o eslint.config.js)
```

As regras do banco foram validadas num Postgres descartável (Docker) com um `auth`
simulado; o roteiro está descrito no fim do [`supabase/README.md`](supabase/README.md).

## Estrutura

```
src/
├── app/                 rotas (Expo Router); index.tsx é o app logado, com todas as abas
├── Auth.tsx             código do condomínio, login, cadastro e recuperação de senha
├── supabase.ts          cliente do Supabase (lê o .env)
├── components/          seletor de data e hora (nativo e web), modal, campo de senha
├── utils/
│   ├── codigoCondominio.ts   código do condomínio e conferências pós-login
│   ├── dadosCondominio.ts    reservas, sugestões e atas no banco
│   ├── calendario.ts         datas e meses
│   └── avisar.ts             alerta que funciona no celular e no navegador
└── constants/ hooks/    tema e utilitários do template do Expo
supabase/
├── migrations/          esquema do banco, em ordem (0001 a 0019)
├── seeds/               contas de teste (só desenvolvimento)
├── docs/                mapa das tabelas
└── README.md            segurança do banco e motivo de cada decisão
```

## Segurança, em resumo

- **Quem protege os dados é o banco** (RLS), não a chave anônima do app, que é pública.
- **Perfil e aprovação ficam em `app_metadata`**, que só o servidor altera. O usuário não
  consegue se promover a síndico nem se autoaprovar.
- **O código de síndico não está no app:** o banco guarda só o hash e valida no cadastro.
- **O código do condomínio é validado no servidor,** no cadastro e na entrada.
- **Limite conhecido:** a conferência de condomínio e de tipo no login é feita pelo app. As
  tabelas ainda não filtram por condomínio; com um condomínio só isso não muda nada, mas é
  preciso resolver antes de entrar o segundo. Está descrito em `supabase/README.md`.

## Ainda não existe

- Upload do PDF da ata (hoje guarda o nome ou o link).
- Tela para o síndico criar eventos de manutenção e reunião (o calendário já os exibe).
- Dados separados por condomínio nas policies do banco.
- Atualização em tempo real: as listas recarregam ao entrar em cada aba.
- Testes automatizados.

## Para quem mexe no código

- **Padrões oficiais do projeto (para IA e para gente):** [`docs/ai/`](docs/ai/README.md).
- Documentação do porquê das decisões: `supabase/README.md` (banco e segurança) e
  `src/utils/README.md` (calendário e reservas).
- Mudança no banco vira uma **migração nova** em `supabase/migrations/`; não se edita uma
  migração que já foi aplicada.
- Branches seguem `tipo/NNNN-descricao` (por exemplo `fix/0003-corrigir-typescript-app-tabs`).
- `AGENTS.md` traz orientações do Expo para assistentes de código.
