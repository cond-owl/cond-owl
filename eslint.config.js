// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "e2e/*", "playwright.config.ts"],
  },
  {
    // Portões do padrão de código (docs/ai/03-padrao-de-codigo.md).
    // O que está aqui vira erro de build, não sugestão em documentação.
    rules: {
      // Ponto 4: a tipagem é o único gate automatizado; `any` o desliga.
      "@typescript-eslint/no-explicit-any": "error",

      // Ponto 3: erro do app vai para a tela, nunca para o console com dados do banco.
      "no-console": "error",

      // Ponto 2: data de negócio passa só por src/utils/calendario.ts.
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name='toISOString']",
          message:
            "Data de negócio só via src/utils/calendario.ts: toISOString usa UTC e erra o dia no Brasil.",
        },
        {
          selector: "MemberExpression[property.name='toLocaleDateString']",
          message: "Data de negócio só via src/utils/calendario.ts.",
        },
        {
          selector: "MemberExpression[property.name='toLocaleTimeString']",
          message: "Hora de negócio só via src/utils/calendario.ts.",
        },
      ],

      // Dívida pré-existente (3 ocorrências em src/app/index.tsx e no hook de
      // tema do template): a correção mexe no ciclo de effects e fica para
      // tarefa própria. Até lá, aviso em vez de erro para não travar o gate.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
