# Padrão de código

Estilo observado no código do autor do projeto. **O padrão novo tem que se
parecer com o que já existe.**

## Idioma

- **Todo nome do domínio do negócio é em português:** `criarReserva`,
  `carregarSugestoes`, `mostrarAlerta`, `mensagemDoErro`, `ORIENTACOES`,
  `LIMITE`, `prefsNotificacoes`. Nada de `createBooking` / `handleSave`.
- **Comentários em português** e sempre no passado-presente explicando
  **por quê** (decisão, limitação, motivo), nunca "o quê". Exemplo bom:
  `// exclusion constraint: mesmo espaço, mesmo dia, horários que se cruzam`.
- **Comentário não tem emoji. Nada de `// 👇 aqui 👇`, banners decorativos,
  ícones ou emoticons dentro do código.** O comentário é texto puro.
- **O comentário é docstring, quando carrega valor duradouro:** um bloco no
  topo do arquivo/function/module explicando responsabilidade, contrato e
  motivo da decisão (ver o cabeçalho de `src/utils/dadosCondominio.ts`
  como modelo). Comentário solto no meio do código apenas para apontar
  particularidade pontual (ex.: um código de erro específico).
- Texto de UI e mensagens de erro para o usuário: português, direto,
  sem jargão técnico (o código do Postgres aparece só entre parênteses,
  se cadastrar tradução for impossível).

## TypeScript

- `strict` ligado. Path-alias `@/` aponta para `src/` (imports novos podem usar `@/utils/...`).
- Import de tipo pode ser `type X` inline (`{ criarAta, type Ata }`) ou
  `import type` — os dois existem; preferir o inline nos imports múltiplos.
- Interfaces de domínio (Evento, Ata, Sugestao, Comunicado) declaradas no
  arquivo do `utils`/tela que as apresenta, com comentário de formato nos
  campos não óbvios (`data: string; // AAAA-MM-DD`).

## Formato (sem Prettier no projeto; siga o código existente)

- **Aspas duplas e ponto e vírgula** no código do autor (Auth.tsx, app/,
  utils/, components/ de negócio). Aspas simples aparece só em arquivos
  herdados do template Expo — não copie de lá como referência.
- Componentes funcionais. Sem classes, sem `React.FC`.
- `StyleSheet.create` no fim do arquivo, chaves em camelCase, grupos
  separados por comentário (`// Calendário`, `// --- INTERFACES ---`).
- Seções de arquivo grandes marcadas: `// --- EVENTOS E RESERVAS ---`.

## Componentes e telas

- **Componentes** (`src/components/`): export nomeado
  (`export function ModalOverlay(...)`).
- **Telas** (`src/app/`): export default (`export default function App()`).
- Props com desestruturação e tipagem inline simplificada
  (`{ children }: { children: React.ReactNode }`).
- Estilo: cores e sombras consistentes com os componentes existentes;
  Responsividade: largura máxima do app **600px** (720px em tablet).
- **Fonte 16px em TextInput** (evita zoom automático do iOS no PWA).
- Modais usam `ModalOverlay` (rolável, área segura, keyboard-aware).
- Áreas seguras por `react-native-safe-area-context` (`useSafeAreaInsets`).
- Alertas **sempre** por `utils/avisar.ts` (funciona nativo e web) — nunca
  `Alert.alert` direto nem `window.alert`.
- Datas e meses **sempre** por `utils/calendario.ts` (`chaveData`,
  `formatarDataLonga`, `formatarDataCurta`, `DIAS_SEMANA`, `MESES`). Nunca
  recalcular na mão, nunca usar `toLocaleDateString` solto.

## Datas e horas (regra dura)

Data é regra de negócio: erra o dia e a reserva/ata cai no mês errado sem
ninguém perceber. Por isso:

- **Todo cálculo e toda formatação de data/hora passa por
  `src/utils/calendario.ts`.** Se falta um formato, cria-se a função lá.
- **Proibido `toISOString` para data de negócio.** Ele converte para UTC: no
  Brasil, depois das 21h, grava o dia seguinte. Para a chave `AAAA-MM-DD`
  use `chaveData(data)` / `chaveDe(ano, mes, dia)`.
- **Proibidos `toLocaleDateString` e `toLocaleTimeString`** no código (o
  ESLint bloqueia): o formato depende da plataforma e foge do padrão do app.
  Use `formatarDataCurta` (DD/MM/AAAA), `formatarDataLonga` (1 de Outubro de
  2026) ou `formatarHora` (HH:mm).
- Timestamp do banco (`created_at`) vira data com
  `formatarDataCurta(chaveData(new Date(iso)))`.

## Tipagem (o gate automatizado)

`npx tsc --noEmit` é o único verificador automático do projeto, então a
tipagem é levada a sério:

- **Proibido `any`** — o ESLint falha (`@typescript-eslint/no-explicit-any`).
  A linha do banco ganha uma interface local e explícita antes de ser usada
  (ex.: `ComunicadoRow`, `EventoRow`, `MoradorPendente`).
- **Proibido `as any`** para "resolver" o `tsc`. Se um valor dinâmico precisa
  de tipo mais largo, tipar o dado na origem (ex.: `keyof typeof
  Feather.glyphMap` para nome de ícone).
- `as` com tipo explícito é aceitável em literal de configuração quando o
  TypeScript não consegue manter o literal (ex.: lista de abas).

## Logs

- **Proibido `console.*` no `src/`** — o ESLint falha (`no-console`). Erro
  de operação vai para a tela via `avisar.ts`/`mostrarAlerta`, com mensagem
  em português.
- **Nunca logar objeto vindo do banco** (erro do Supabase pode carregar
  dados pessoais de morador). Depuração local usa `console` temporário e sai
  antes de entregar.

## Dados (padrão de retorno do `utils/dadosCondominio.ts`)

Padrão rígido, mantenha:

- **Leitura** (`carregarX`) devolve `X[] | null` — `null` = erro; a tela
  decide o que mostrar.
- **Gravação** (`criarX`, `avaliarXNoBanco`) devolve `string | null` —
  `string` = mensagem de erro pronta para o usuário; `null` = deu certo.
- Erros do banco são **traduzidos por código** em `mensagemDoErro`
  (`23514`, `42501`, `23P01`...). Erros novos de restrição entram no mapa,
  com comentário dizendo qual constraint originou o código.
- RLS normalmente falha silencioso (0 linhas): em operações que o
  permissionamento decide, conferir se a linha foi mesmo alterada
  (`.select("id")`) e devolver mensagem de negação.
- Limites de campo (`LIMITE.detalhes = 2000`...) espelham os CHECK das
  migrações e são usados em `maxLength` no app.
- `trim()` em todo texto antes de gravar.

## Ambiente (nada hardcoded)

- **Nenhum valor configurável pode ficar hardcoded no código.** Toda
  variável de ambiente:
  1. é lida com `process.env.EXPO_PUBLIC_*` (ou devolvida por um módulo de
     configuração único, como `src/supabase.ts`);
  2. ganha **linha com valor de exemplo no `.env.example`** no mesmo commit
     que começa a usá-la, com comentário curto explicando para que serve;
  3. é comentada em `.env` local (nunca versionado).
- **Valores de exemplo no `.env.example` são fictícios e inofensivos**
  (`https://SEU-PROJETO.supabase.co`) — nunca a URL/valor real do projeto.
- **Nada hardcoded por segurança, em nenhuma camada:** sem chave, token,
  senha, código de síndico, e-mail, telefone, número de projeto, URL de
  serviço interno ou ID de tenant no código do app. Se o código precisar de
  algum desses valores, ele vem do `.env` ou do banco — nunca de um literal.
  Regra prática: `git grep` não deve achar segredo nenhum.
- **Constantes de UX e de negócio visíveis ao usuário** (largura máxima,
  `LIMITE` de campos, nomes de aba) **podem** ficar em código — elas não são
  segredo e já têm lugar definido (`constants/theme.ts`, `LIMITE`). O que a
  regra proíbe é valor de **infraestrutura/credencial/serviço** hardcoded,
  não número mágico de layout.
- `.env` nunca entra no git (`.gitignore` já cobre); nunca usar a
  `service_role` no app, nem de exemplo copiável.
- **Leitura de `.env` só em módulo de configuração** (`src/supabase.ts`,
  `src/utils/notificacoes.ts`). Tela e componente não leem `process.env`
  diretamente.
- **Segredo que não pode ser público não existe no cliente.** A chave
  `anon` e a config web do Firebase são públicas por desenho; para qualquer
  outra credencial, a resposta é banco (função/gatilho/RLS), não `.env`.
- Gates: `node scripts/verificar.mjs` barra literal com cara de credencial e
  variável `EXPO_PUBLIC_*` usada sem linha no `.env.example`. Rode
  `npm run verificar` antes de entregar.
