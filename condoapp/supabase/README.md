# Auditoria de segurança — achados e propostas

Auditoria feita sobre o que já existe no app. **Nenhuma proposta abaixo está
aplicada** (exceto a Seção 5, que não muda a lógica). Cada item diz o problema, a
proposta, o que muda para o usuário e o que depende do banco, para você decidir.

`hardening.sql` (nesta pasta) é o script do banco que acompanha as propostas 1 a 3.
Ele **não foi executado** em nenhum ambiente.

## Resumo

| # | Achado | Gravidade | Estado |
|---|--------|-----------|--------|
| 1 | Perfil (síndico/morador) e aprovação decididos pelo cliente | Crítico | Proposta |
| 2 | Código de síndico `OWL2026` no código do app | Crítico | Proposta |
| 3 | RPCs de aprovação respondem sem login | Crítico | Proposta |
| 4 | Login de teste `sindico/123` e atalhos | Alto | Proposta |
| 5 | Chave anônima escrita no código | Alto | **Aplicado** |
| 6 | Painel "Admin" escondido (7 cliques no título) | Médio | Proposta |
| 7 | Senha mínima 6, sem validação de e-mail | Médio | Proposta |
| 8 | Recuperação de senha revela se o e-mail tem conta | Baixo | Proposta |
| 9 | `console.log` de erro numa chamada com dados pessoais | Baixo | Proposta |

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

**Depende do banco:** sim (`hardening.sql`, seções 2 e 3). Sem ele aplicado, todos
cairiam como morador pendente, inclusive o síndico atual.

## 2. Código de síndico `OWL2026` no código do app — Crítico

**Hoje:** o código está em `Auth.tsx` e vai no bundle público. Qualquer pessoa lê.
Ele também está no histórico do git, então deve ser considerado vazado.

**Proposta:** o app só envia o que foi digitado; o banco valida contra um hash numa
tabela que o app não lê (gatilho em `auth.users`). Código errado recusa o cadastro.
Trocar o código por um novo.

**Para o usuário:** o fluxo de cadastro de síndico é o mesmo. O código novo precisa
ser entregue por fora do app.

**Depende do banco:** sim (`hardening.sql`, seções 1 e 2).

## 3. RPCs de aprovação respondem sem login — Crítico

**Hoje:** `get_moradores_pendentes` respondeu 200 a uma chamada só com a chave
anônima (sem login), vazia porque não havia pendentes no momento. Com pendentes, é
possível que nome, e-mail, nascimento e unidade fiquem expostos. Não testei
`aprovar_acesso_morador`, porque ela altera dados.

**Proposta:** as duas funções exigem `is_sindico()` e perdem o `EXECUTE` de `anon`.

**Para o usuário:** nada muda para o síndico.

**Depende do banco:** sim (`hardening.sql`, seção 4). O script recria as duas
funções com corpos que escrevi a partir do uso no app. **Conferir com as definições
atuais** (`\sf public.get_moradores_pendentes`) antes de rodar. Se o retorno for
diferente, o `CREATE OR REPLACE` falha em vez de sobrescrever.

## 4. Login de teste `sindico/123` e atalhos — Alto

**Hoje:** `index.tsx` tem uma tela de login com `sindico/123` e `morador/123` e
botões "Acesso rápido para testes". Só aparece com sessão e sem perfil, então hoje é
quase inalcançável, mas é credencial fixa no código.

**Proposta:** remover a tela, os atalhos, `handleLogin` e os estados `username` e
`password` associados.

**Para o usuário:** nenhuma mudança visível.

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

**Decisão sua:** manter ou remover.

## 7. Senha mínima 6, sem validação de e-mail — Médio

**Hoje:** o app aceita senha de 6 caracteres e não valida formato de e-mail.

**Proposta:** mínimo de 8 caracteres e e-mail validado, com o mesmo mínimo no painel
do Supabase (Authentication > Passwords), onde a regra vale de verdade. No cliente
ela é só conveniência.

## 8. Recuperação de senha revela se o e-mail tem conta — Baixo

**Hoje:** a mensagem "Código enviado" só aparece para e-mails cadastrados, o que
permite descobrir quem tem conta.

**Proposta:** mensagem sempre igual ("Se o e-mail estiver cadastrado, enviamos um
código").

## 9. `console.log` de erro numa chamada com dados pessoais — Baixo

**Hoje:** `buscarPendentes` imprime o erro completo no console.

**Proposta:** trocar por um aviso genérico ao usuário.

## Configurações no painel do Supabase (não são código)

- Senha mínima de 8 e bloqueio de senhas vazadas.
- CAPTCHA e limite de tentativas em cadastro e recuperação de senha.
- Site URL e Redirect URLs só do domínio do PWA.
- Login anônimo desligado; confirmação de e-mail mantida ligada.

## Quando criar tabelas (comunicados, reservas, sugestões)

Hoje esses dados vivem só na memória do app, então não há vazamento. Ao levá-los para
o banco, ligar RLS em cada tabela com policies explícitas. Sem RLS, a chave anônima
dá acesso direto à tabela.
