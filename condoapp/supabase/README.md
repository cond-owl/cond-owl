# Auditoria de segurança — achados e propostas

Auditoria feita sobre o que já existe no app. **Os itens marcados como Aplicado já estão
no código e no banco novo; os demais seguem como proposta.** Cada item diz o problema, a
proposta, o que muda para o usuário e o que depende do banco, para você decidir.

## Banco novo e separado

O projeto Supabase atual **não é alterado** por esta branch. As migrações em
`migrations/` montam um banco **novo e vazio** (um projeto Supabase novo, ou um
ambiente local com `supabase start`). Elas são ordenadas e cada uma tem um assunto:

| Arquivo | Conteúdo |
|---------|----------|
| `0001_extensoes_e_segredos` | `pgcrypto`, `btree_gist` e `app_secrets` (hash do código de síndico) |
| `0002_funcoes_de_permissao` | `is_sindico()` e `is_aprovado()`, lidas do token |
| `0003_perfis_e_cadastro` | `perfis` e gatilhos que definem perfil/aprovação no cadastro |
| `0004_rpcs_do_sindico` | `get_moradores_pendentes` e `aprovar_acesso_morador` |
| `0005_comunicados` | `comunicados` e `comunicados_vistos` |
| `0006_eventos_e_reservas` | `eventos`, com bloqueio de reserva em conflito |
| `0007_atas` | `atas` |
| `0008_sugestoes` | `sugestoes` |
| `0009_condominios` | `condominios` (nome e código único, normalizado); só o síndico escreve, só aprovados leem |
| `0010_condominio_colinas_de_roma` | dado inicial: condomínio "Colinas de Roma" |
| `0011_perfis_condominio` | `perfis.condominio_id` (FK para `condominios`); o usuário não consegue alterar |

Aplicar em ordem. Para dados de teste, `seeds/dev_usuarios_colinas_de_roma.sql` (não é migração; nunca em produção) cria 1 síndico e 2 moradores no condomínio, com senhas geradas na hora e mostradas só uma vez. Nada foi executado em Supabase real: foram validadas num Postgres
descartável (Docker) com um `auth` simulado. Depois de aplicar, definir o código de
síndico (comentado no `0001`) e apontar o `.env` do app para o projeto novo.
Para a próxima mudança, criar uma migração nova, sem editar as existentes.


## Resumo

| # | Achado | Gravidade | Estado |
|---|--------|-----------|--------|
| 1 | Perfil (síndico/morador) e aprovação decididos pelo cliente | Crítico | **Aplicado** |
| 2 | Código de síndico `OWL2026` no código do app | Crítico | **Aplicado** |
| 3 | RPCs de aprovação respondem sem login | Crítico | **Aplicado** |
| 4 | Login de teste `sindico/123` e atalhos | Alto | **Aplicado** |
| 5 | Chave anônima escrita no código | Alto | **Aplicado** |
| 6 | Painel "Admin" escondido (7 cliques no título) | Médio | **Mantido** (decisão) |
| 7 | Senha mínima 6, sem validação de e-mail | Médio | **Aplicado no app** · painel pendente |
| 8 | Recuperação de senha revela se o e-mail tem conta | Baixo | **Aplicado** |
| 9 | `console.log` de erro numa chamada com dados pessoais | Baixo | **Aplicado** |

## 1. Perfil e aprovação decididos pelo cliente — Crítico

**Hoje:** o cadastro envia `role` e `status_aprovacao` dentro de `user_metadata`, e
o app libera síndico e tira o morador da tela de análise lendo esses mesmos campos.
`user_metadata` pode ser editado pelo próprio usuário pela API pública
(`supabase.auth.updateUser({ data: { role: 'sindico' } })`). Qualquer pessoa pode se
tornar síndico ou se autoaprovar, sem usar o app.

**Proposta:** guardar perfil e aprovação em `app_metadata` (só o servidor altera) e
o app passa a ler dali. Sem `status_aprovacao = aprovado`, o morador fica na tela de
análise (nega por padrão).

**Para o usuário:** a tela de aprovação e o botão "Aprovar Acesso" continuam iguais.

**Aplicado no app (branch `fix/0001-vulnerabilidade-perfil-aprovacao`):**
- `index.tsx` lê `role` e `status_aprovacao` de `app_metadata`. Qualquer valor
  diferente de `sindico` vira morador; morador só entra com `status_aprovacao =
  aprovado` (nega por padrão). `user_metadata` ficou só para nome de exibição.
- `Auth.tsx` não envia mais `role` nem `status_aprovacao`. No cadastro de síndico
  envia apenas `codigo_sindico` (o digitado); quem decide é o gatilho do banco.
- A checagem do código no login foi removida: era validação do cliente, sem efeito
  de segurança, e o campo agora só aparece no cadastro.

**Depende do banco:** sim (migrações 001 a 004). O banco é novo (só
Authentication, sem tabelas), então o script é uma instalação limpa: não há usuários
a migrar. **Rodar antes de usar o cadastro.** Sem ele, todos caem como morador
pendente e o cadastro de síndico não gera perfil de síndico. Contas de teste criadas
antes do gatilho devem ser apagadas e recriadas.

**Efeito de borda:** `app_metadata` vem no token. Ao aprovar um morador, ele só
enxerga a aprovação depois de sair e entrar de novo (ou do refresh do token).

## 2. Código de síndico `OWL2026` no código do app — Crítico

**Hoje:** o código está em `Auth.tsx` e vai no bundle público. Qualquer pessoa lê.
Ele também está no histórico do git, então deve ser considerado vazado.

**Proposta:** o app só envia o que foi digitado; o banco valida contra um hash numa
tabela que o app não lê (gatilho em `auth.users`). Código errado recusa o cadastro.
Trocar o código por um novo.

**Para o usuário:** o fluxo de cadastro de síndico é o mesmo. O código novo precisa
ser entregue por fora do app.

**Depende do banco:** sim (migrações 001 e 003).

## 3. RPCs de aprovação respondem sem login — Crítico

**Hoje:** `get_moradores_pendentes` respondeu 200 a uma chamada só com a chave
anônima (sem login), vazia porque não havia pendentes no momento. Com pendentes, é
possível que nome, e-mail, nascimento e unidade fiquem expostos. Não testei
`aprovar_acesso_morador`, porque ela altera dados.

**Proposta:** as duas funções exigem `is_sindico()` e perdem o `EXECUTE` de `anon`.

**Para o usuário:** nada muda para o síndico.

**Depende do banco:** sim (migração 004). Como o banco é novo, a migração
cria as duas funções do zero, com corpos escritos a partir do uso no app.

**Aplicado:** migração `0004`. No projeto novo, as duas RPCs respondem 401 (`42501`) à
chave anônima, conferido por chamada direta. Quem decide é `is_sindico()`, lida do
token (`app_metadata`), que o usuário não consegue editar.

## 4. Login de teste `sindico/123` e atalhos — Alto

**Hoje:** `index.tsx` tem uma tela de login com `sindico/123` e `morador/123` e
botões "Acesso rápido para testes". Só aparece com sessão e sem perfil, então hoje é
quase inalcançável, mas é credencial fixa no código.

**Proposta:** remover a tela, os atalhos, `handleLogin` e os estados `username` e
`password` associados.

**Para o usuário:** nenhuma mudança visível.

**Aplicado:** removidos a tela de login de teste, os atalhos "Acesso rápido", o
`handleLogin` e os estados `username`/`password`, mais os estilos e o import que
ficaram sem uso. Sem perfil resolvido, o app não mostra nada (`return null`), em vez
de oferecer um login alternativo.

## 5. Chave anônima escrita no código — Alto — APLICADO

`src/supabase.ts` agora lê `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`
do `.env` (ignorado pelo git); existe `.env.example`. A lógica não muda.

A chave anônima é pública por desenho, então não precisa ser trocada. Quem protege os
dados é o RLS e as permissões. A `service_role` não existe no repositório.

**Atenção:** quem clonar o projeto precisa criar o `.env` a partir do exemplo, e o
servidor de desenvolvimento precisa ser reiniciado ao mudar o `.env`. Para reverter,
basta voltar a chave para dentro de `supabase.ts`.

## 6. Painel "Admin" escondido (7 cliques no título) — Médio

**Hoje:** clicar 7 vezes no título mostra uma aba "Admin" para qualquer usuário,
logado como morador inclusive. Essa aba não abre nenhuma tela, então não expõe
dados; é só um atalho escondido sem controle de acesso.

**Proposta:** remover o clique e a aba, ou, se for ficar, restringir ao síndico.

**Decisão:** mantido como está. O motivo é que a aba não abre tela nem expõe dado. Se isso mudar (por exemplo, a aba passar a abrir algo), restringir ao síndico: `showAdmin && user === "sindico"`.

## 7. Senha mínima 6, sem validação de e-mail — Médio

**Hoje:** o app aceita senha de 6 caracteres e não valida formato de e-mail.

**Proposta:** mínimo de 8 caracteres e e-mail validado, com o mesmo mínimo no painel
do Supabase (Authentication > Passwords), onde a regra vale de verdade. No cliente
ela é só conveniência.

**Aplicado no app:** `Auth.tsx` exige e-mail em formato válido e senha de no mínimo 8
caracteres no cadastro, e a mesma senha mínima na redefinição (checada antes de gastar
o código de uso único). O texto de erro e os placeholders mostram o mínimo.

**Pendente, no painel do Supabase:** Authentication > Passwords > mínimo 8 e "Prevent
leaked passwords". Sem isso, quem chamar a API direto ainda pode cadastrar senha curta.

## 8. Recuperação de senha revela se o e-mail tem conta — Baixo

**Hoje:** a mensagem "Código enviado" só aparece para e-mails cadastrados, o que
permite descobrir quem tem conta.

**Proposta:** mensagem sempre igual ("Se o e-mail estiver cadastrado, enviamos um
código").

**Aplicado:** a resposta é sempre "Se o e-mail estiver cadastrado, enviamos um
código". O servidor já responde 200 igual para e-mail sem conta (conferido), então a
única diferença visível vinha da mensagem do app. Erro de envio (rede ou limite) usa
um texto único, que não depende de a conta existir.

**Corrigido junto:** `Alert.alert` não exibe nada no navegador (react-native-web),
então erros de login, cadastro e recuperação sumiam no PWA. Todos os avisos passam
por `src/utils/avisar.ts` (`window.alert` no web, `Alert` nativo no celular).

## 9. `console.log` de erro numa chamada com dados pessoais — Baixo

**Hoje:** `buscarPendentes` imprime o erro completo no console.

**Proposta:** trocar por um aviso genérico ao usuário.

**Aplicado:** sem `console.log`; a aba de aprovações mostra "Não foi possível carregar
a lista de moradores." Os dados pessoais não vão para o console.

## Configurações no painel do Supabase (não são código)

- Senha mínima de 8 e bloqueio de senhas vazadas.
- CAPTCHA e limite de tentativas em cadastro e recuperação de senha.
- Site URL e Redirect URLs só do domínio do PWA.
- Login anônimo desligado; confirmação de e-mail mantida ligada.

## Banco: tabelas e por que são assim

A migração cria o esquema que o app vai precisar. **Só os comunicados estão ligados ao app** (listar, publicar e marcar como visto). **Ainda em memória, sem usar o banco:**
calendário, reservas, atas e sugestões, até a
próxima etapa. Todas as tabelas têm RLS ligado; sem policy, a chave anônima não
acessa nada.

| Tabela | Quem lê | Quem escreve |
|--------|---------|--------------|
| `perfis` (nome, nascimento, celular, unidade, e-mail) | o próprio usuário; síndico lê todos | o usuário altera só nome e celular; criada por gatilho no cadastro |
| `condominios` (nome, código) | síndico e moradores aprovados | só síndico; código único, em minúsculas |
| `comunicados` / `comunicados_vistos` | síndico e moradores aprovados | só síndico publica; cada um registra o seu "visto" |
| `eventos` (inclui reservas) | síndico e moradores aprovados | síndico cria qualquer um; morador aprovado só reserva em seu nome, de hoje em diante |
| `atas` | síndico e moradores aprovados | só síndico |
| `sugestoes` | síndico e moradores aprovados | morador envia (sempre pendente); só síndico avalia |
| `app_secrets` | ninguém pela API | hash do código de síndico, só por SQL |

Decisões:
- **Perfil e aprovação só em `app_metadata`**, não em `perfis`. Assim há uma fonte
  única, e as policies leem do token sem consultar tabela. `perfis` guarda só dados
  pessoais.
- **Unidade não é editável pelo morador:** o síndico aprova com base nela; mudar
  depois anularia a verificação.
- **Conflito de reserva é do banco** (constraint de exclusão: mesmo espaço, horários
  que se cruzam). A checagem do app é só aviso rápido; duas pessoas reservando ao
  mesmo tempo não passam pelo banco.
- **Data da reserva usa o fuso de Brasília**, não o do servidor, para não recusar
  reserva do próprio dia à noite.
- **Cadastro com código de síndico errado é recusado** pelo banco; o Auth devolve
  "Database error saving new user", que o app traduz.
- Token é emitido com `app_metadata` fixo: aprovação só aparece depois de novo login.


Como validar de novo: subir um Postgres descartável, criar um `auth` simulado
(`auth.users`, `auth.uid()`, `auth.jwt()`) e rodar a migração e cenários de cadastro,
promoção indevida, RPCs, reservas conflitantes e `anon`. Foi o que se fez; passou.
