# Arquitetura e estrutura

## Mapa de pastas

```
src/
├── app/                 ROTAS (Expo Router). Cada arquivo é uma tela;
│                        _layout.tsx define navegadores.
│                        ├── _layout.tsx     raiz do navegador
│                        └── index.tsx      app logado inteiro (todas as abas)
├── Auth.tsx             tela de entrada: código do condomínio, login,
│                        cadastro, recuperação de senha
├── supabase.ts          cliente do Supabase (único lugar que o cria)
├── components/          componentes reutilizáveis. Sufixo .web.tsx = versão
│                        só para navegador (metro escolhe pelo ambiente)
├── constants/theme.ts   cores, fontes e espaçamentos
├── hooks/               hooks de tema (do template Expo)
└── utils/               regras de negócio e acesso ao banco, nomeados em
│                        português (calendario.ts, dadosCondominio.ts,
│                        codigoCondominio.ts, avisar.ts, notificacoes.ts)
supabase/
├── migrations/          esquema do banco, numerado e ordenado
├── seeds/               contas de teste (SÓ desenvolvimento)
└── docs/                mapa das tabelas
public/                  PWA (index.html, manifest, ícones)
```

## Regras de encaixe

- **`src/app/` é só rota.** Componentes, hooks e utilitários nunca moram ali.
- **Tela grande é permitida, mas não é desculpa para crescimento descontrolado:**
  regra de negócio nova de banco entra em `src/utils/dadosCondominio.ts`;
  utilitário de data segue em `calendario.ts`. A tela coordena, não calcula.
- **Cliente Supabase único:** importar `{ supabase }` de `../supabase` (ou
  `@/supabase`). Nunca chamar `createClient` em outro lugar.
- **Tradução de nomes acontece na camada `utils/`:** o banco fala
  `snake_case` (`hora_inicio`), as interfaces do app falam `camelCase`
  (`horaInicio`). Quem consulta traduz na saída; quem grava traduz na entrada.
  Fora da `utils/` ninguém deve saber de nomes de coluna.
- **Plataforma dupla:** quando algo precisa variar entre nativo e web
  (date/time picker), criar `arquivo.tsx` + `arquivo.web.tsx` com a MESMA
  assinatura de props (ver `components/date-time-field.tsx`). O import é
  sempre sem sufixo.
- **Ícones:** da `@expo/vector-icons` (`Feather`, `Ionicons`,
  `MaterialCommunityIcons` já em uso).

## Fluxo de entrada (não quebrar)

1. Usuário informa **código do condomínio** → validado no banco.
2. Login ou cadastro (aba Morador ou Síndico; cadastro de síndico pede
   código único validado no banco por hash).
3. Pós-login, o app confere se o usuário pertence ao condomínio
   (`usuarioPertence`) e do tipo da aba (`usuarioEhDoTipo`). Falhou?
   Encerra a sessão e explica no card de login.
4. Morador novo só usa o app após aprovação do síndico.

Perfil e aprovação vivem em **`app_metadata`** (só o servidor altera).
`user_metadata` é só para nome de exibição. Nunca confiar em
`user_metadata` para permissão.
