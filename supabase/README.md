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
| `0012_validar_codigo_condominio` | `validar_codigo_condominio(codigo_informado)`: sim/não para a tela de código, com `anon`; o cadastro passa a exigir código de condomínio existente e grava `perfis.condominio_id` |
| `0013_usuario_pertence_ao_condominio` | `usuario_pertence_ao_condominio(codigo_informado)`: sim/não se o usuário logado pertence ao condomínio do código; associa contas antigas sem condomínio quando só existe um |
| `0014_tipo_usuario` | tabela `tipo_usuario` (síndico, morador), `perfis.tipo_usuario_id` espelhando `app_metadata` por gatilho e `usuario_e_do_tipo(tipo_informado)` para o login |
| `0015_notificacoes_push` | token FCM e preferências em `perfis`; concede ao usuário atualização somente dessas colunas, sujeita à policy de próprio perfil |
| `0016_dispositivos_notificacao` | tokens por instalação do PWA, RLS por usuário e migração dos tokens web legados |
| `0017_gatilho_notificar_comunicado` | gatilho `comunicados_notificar` (pg_net) que chama a Edge Function `notificar-comunicados` a cada comunicado publicado; URL e segredo da função vêm do Vault |

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

### Ligar o push de comunicados em um projeto (sequência de liberação)

Ordem para outro servidor/projeto Supabase; nada disto roda sem decisão de quem aplica.

1. Secrets da função (`supabase secrets set`): `FIREBASE_SERVICE_ACCOUNT` (JSON da conta
   de serviço do projeto Firebase) e `NOTIFICAR_WEBHOOK_SECRET` (valor longo e aleatório,
   novo). `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já vêm do ambiente.
2. Publicar a função: `supabase functions deploy notificar-comunicados` (o
   `verify_jwt = false` vem do `config.toml`).
3. Vault do banco, no SQL Editor (mesmo valor do passo 1 no segundo secret):
   `select vault.create_secret('https://<ref>.supabase.co/functions/v1/notificar-comunicados', 'notificar_comunicados_url');`
   `select vault.create_secret('<NOTIFICAR_WEBHOOK_SECRET>', 'notificar_comunicados_segredo');`
4. Aplicar a migração `0017` no SQL Editor.
5. **Remover o Database Webhook antigo do painel** (Database > Webhooks), se existir; com
   os dois ativos cada comunicado notificaria em dobro.
6. Rodar `scripts/validar_notificacoes.sql` (tudo `OK`) e publicar um comunicado de teste.
   O resultado do disparo fica em `net._http_response` (o pg_net apaga após ~6 h; 200 com `disparos`, `falhas` e
   `falhasPorCodigo`).
7. No PWA publicado, as variáveis `EXPO_PUBLIC_FIREBASE_*` (inclusive a VAPID) precisam
   estar no ambiente de build; sem elas o app avisa quais faltam ao tocar em ativar.

## Banco: tabelas e por que são assim

As migrações criam o esquema que o app usa. **Ligados ao app:** comunicados (listar, publicar
e marcar como visto), calendário e reservas, sugestões (enviar e avaliar) e atas (listar e
cadastrar). Todas as tabelas têm RLS ligado; sem policy, a chave anônima não acessa nada.

| Tabela | Quem lê | Quem escreve |
|--------|---------|--------------|
| `perfis` (nome, nascimento, celular, unidade, e-mail e preferências push) | o próprio usuário; síndico lê todos | o usuário altera nome, celular e preferências; criada por gatilho no cadastro |
| `dispositivos_notificacao` | só o dono dos tokens | o usuário registra e remove seus dispositivos; múltiplos por perfil |
| `condominios` (nome, código) | síndico e moradores aprovados | só síndico; código único, em minúsculas |
| `comunicados` / `comunicados_vistos` | síndico e moradores aprovados | só síndico publica; cada um registra o seu "visto" |
| `eventos` (inclui reservas) | síndico e moradores aprovados | síndico cria qualquer um; morador aprovado só reserva em seu nome, de hoje em diante |
| `atas` | síndico e moradores aprovados | só síndico |
| `sugestoes` | síndico e moradores aprovados | morador envia (sempre pendente); só síndico avalia |
| `app_secrets` | ninguém pela API | hash do código de síndico, só por SQL |

Decisões:
- **Perfil e aprovação decididos em `app_metadata`.** É a fonte: as policies leem do token
  sem consultar tabela. `perfis` guarda os dados pessoais e, desde a 0014, o tipo de
  usuário como espelho (ver abaixo). A aprovação segue só em `app_metadata`.
- **Tipo de usuário é tabela e coluna (0014).** `tipo_usuario` (síndico e morador) e
  `perfis.tipo_usuario_id` (obrigatória, FK, o usuário não altera). A coluna **espelha**
  `app_metadata`, que continua sendo o que o token e o RLS leem: o gatilho do cadastro
  grava o tipo que o servidor definiu, e um gatilho em `auth.users` acompanha qualquer
  promoção ou rebaixamento feito depois (ex.: o seed). Assim as duas fontes nunca divergem
  e não há outro lugar para escrever o papel. Papel desconhecido vira morador.
- **O login confere o tipo escolhido na tela (0014).** As abas Morador e Síndico do login
  passam a valer: depois do login o app pergunta ao servidor (`usuario_e_do_tipo`, sim ou
  não, só `authenticated`, sobre `auth.uid()`) se o usuário é do tipo da aba. Morador na aba
  Síndico, ou o contrário, é recusado e a sessão deste aparelho é encerrada, com o motivo no
  card de login. Vale como o do condomínio: é uma conferência do app. O que dá poder de
  síndico de verdade continua sendo `app_metadata`, que o usuário não edita. Sessão
  restaurada na abertura do app não tem aba escolhida e não passa por essa conferência.
  Efeito: síndico que entrar na aba Morador (a padrão) é recusado e precisa escolher a aba
  Síndico.
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
- **Código de condomínio validado no servidor (0012).** A tela de código antes do login
  usava um código fixo no app: ficava no bundle público e só valia no cliente. Agora o
  app pergunta ao banco (`validar_codigo_condominio`), que responde só sim ou não: a
  tabela `condominios` continua ilegível sem login (o código não vaza e a lista não
  pode ser varrida), e o `anon` só ganha `EXECUTE` nessa função. Quais códigos valem é
  dado, não código: hoje só `colinasderomaii.owl`; outro condomínio entra por `insert`
  em `condominios`, sem mexer no app.
- **O cadastro também exige o código (0012).** A tela é só a porta de entrada: quem
  chamasse `signUp` direto pela API a pularia. O gatilho `definir_perfil_novo_usuario`
  recusa conta sem `codigo_condominio` existente (`condominio_invalido`) e o perfil
  nasce com `condominio_id` preenchido. O app envia o código que o servidor já validou
  na tela. Consequência: versões antigas do app, sem esse campo, não conseguem mais
  cadastrar; o seed de desenvolvimento já envia o campo.
- **O código guardado no aparelho é conferido de novo a cada abertura.** Se o código for
  removido de `condominios`, o app volta para a tela de código em vez de confiar no que
  ficou no `localStorage`. Falha de rede mostra "não foi possível verificar", e não
  "não encontrado", para não confundir erro de conexão com código errado.
- **Limite conhecido:** não há limite de tentativas na função. Quem quiser adivinhar
  códigos pode chamá-la em sequência. O código atual é longo, o que torna isso
  impraticável hoje, mas se os códigos ficarem curtos convém ligar CAPTCHA e limite de
  tentativas no painel do Supabase.
- **O login confere o condomínio do usuário (0013).** O código da primeira tela escolhe o
  condomínio; depois do login o app pergunta ao servidor se o `condominio_id` do usuário
  logado é o desse código (`usuario_pertence_ao_condominio`) e só então libera o app. A
  função avalia sempre `auth.uid()`, nunca um id vindo do cliente, devolve só sim ou não
  (não revela o condomínio de ninguém) e só `authenticated` executa. Se não pertence, o app
  encerra a sessão deste aparelho (`signOut` com `scope: local`, para não derrubar o
  usuário nos outros) e avisa. Sem código guardado (sessão de antes desta conferência),
  volta ao login sem aviso, e a pessoa informa o código de novo.
- **Limite importante: a conferência é do app, não do banco.** Ela barra o uso normal, mas
  as policies e RPCs (0001 a 0011) ainda não filtram por `condominio_id`: quem usar o
  token direto pela API, sem passar pelo app, não é barrado por ela. Com um único
  condomínio isso não tem efeito prático. Antes de entrar o segundo condomínio, separar de
  verdade: gravar `condominio_id` em `app_metadata` no gatilho do cadastro (0012) e
  filtrar por ele nas policies e RPCs (o mapa das tabelas lista isso como pendência).
- **Contas anteriores à 0012 e o backfill da 0013.** Elas não têm `condominio_id` e seriam
  barradas no login, síndico inclusive. A 0013 associa todas ao condomínio, mas só
  enquanto existir exatamente um: com mais de um não adivinha e não altera nada. Nesse
  caso, antes de usar o app, associar à mão (SQL Editor, como dono do banco):
  `update public.perfis set condominio_id = (select id from public.condominios where codigo = '<codigo>') where condominio_id is null;`
  Sem isso, quem ficou sem condomínio não consegue entrar.
- **Código validado também fica em memória.** Se o armazenamento do aparelho falhar
  (navegador em modo restrito), o código vale até fechar o app em vez de o login negar em
  silêncio. A pessoa é avisada de que terá de informá-lo de novo.
- **Reservas, sugestões e atas passaram a ser gravadas no banco.** Antes eram listas em
  memória que sumiam ao recarregar. O app grava e lê pelas tabelas `eventos`, `sugestoes` e
  `atas` direto pelo cliente do Supabase (`src/utils/dadosCondominio.ts`), sem endpoint
  próprio: quem protege os dados é o RLS das migrações 0006 a 0008, que não mudaram. Criar
  uma API a mais só repetiria essas regras em outro lugar.
- **Quem decide a reserva é o banco.** A checagem de conflito no app é só um aviso rápido;
  duas pessoas reservando ao mesmo tempo são separadas pela constraint de exclusão
  (`23P01`, traduzido para "espaço já reservado"). Data passada e reserva em nome de outro
  usuário são barradas pelo RLS (`42501`). Depois de gravar, o app recarrega a lista, mesmo
  em caso de erro, para mostrar a reserva que causou o conflito.
- **Avaliar sugestão confere a linha alterada.** O RLS não devolve erro quando o morador tenta
  avaliar: o `update` só afeta 0 linhas. O app pede a linha de volta (`select`) e, se não
  veio nada, mostra "apenas o síndico pode avaliar", em vez de fingir que deu certo.
- **Ata guarda nome ou link do PDF, não o arquivo.** A coluna `arquivo` é texto. O app só abre
  o arquivo se for `http(s)`; senão mostra o nome. Enviar o PDF de verdade exigiria o Storage
  do Supabase (bucket, policies e limite de tamanho), que ainda não existe.
- **Listas recarregam ao entrar na aba** (calendário, atas e sugestões), para ver o que os
  outros fizeram. Não há atualização em tempo real.
- **Push de comunicado nasce de um gatilho versionado (0017), não de webhook do painel.**
  A Edge Function `notificar-comunicados` existia, mas nada no repositório a chamava: o
  disparo dependia de um Database Webhook criado à mão, que o painel configura com a chave
  anon, enquanto a função exigia `service_role` e respondia 401. O síndico publicava e
  ninguém era notificado. O gatilho `AFTER INSERT` em `comunicados` usa `pg_net`
  (assíncrono, pós-commit): não atrasa nem derruba a publicação, e qualquer falha vira
  `WARNING` em vez de erro no `INSERT`. A função autentica por segredo compartilhado
  (`NOTIFICAR_WEBHOOK_SECRET`, comparado em tempo constante) com `verify_jwt = false`, por
  não depender do formato da chave de serviço do projeto. Ela só envia a tokens `web`,
  devolve falhas por código do FCM (visíveis em `net._http_response`) e apaga tokens que o
  FCM declara inexistentes.
- **O aparelho reregistra o token sozinho após o login** quando a permissão já foi
  concedida (`sincronizarNotificacao`). O cartão "Ativar notificações" some depois da
  concessão; sem o reregistro, quem concedeu antes da configuração do Firebase estar
  publicada, ou teve o token renovado pelo FCM, ficava para sempre sem receber nada. O
  pedido de permissão continua só por toque (regra do navegador e do iOS).
- **O service worker mostra a notificação mesmo com o app aberto.** O app não tem tempo
  real nem handler de mensagem em primeiro plano; esconder o aviso quando havia janela
  visível deixava quem estava com o PWA aberto sem nenhum sinal.
- **Parâmetro `codigo_informado`, não `codigo`:** em função SQL, a coluna `codigo` vence
  um parâmetro de mesmo nome e a comparação vira coluna = coluna, aceitando qualquer
  código. Foi um erro real da primeira versão, pego pelos testes.


Como validar de novo: subir um Postgres descartável, criar um `auth` simulado
(`auth.users`, `auth.uid()`, `auth.jwt()`) e rodar a migração e cenários de cadastro,
promoção indevida, RPCs, reservas conflitantes e `anon`. Foi o que se fez; passou.
