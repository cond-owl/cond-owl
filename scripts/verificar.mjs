// Verificações que o ESLint não alcança: segredo hardcoded e variável de
// ambiente usada sem exemplo no .env.example. Roda dentro de `npm run verificar`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const raiz = process.cwd();
const pastaFonte = join(raiz, "src");

const arquivos = (pasta) =>
  readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
  });

// Ignora linhas de comentário: elas podem citar o nome de um segredo.
const ehComentario = (linha) => /^\s*(\/\/|\*|\/\*)/.test(linha);

const padroes = [
  {
    regex: /AIza[0-9A-Za-z_-]{30,}/g,
    descricao: "chave de API do Google/Firebase",
  },
  {
    regex: /eyJ[A-Za-z0-9_-]{10,}\./g,
    descricao: "token JWT",
  },
  {
    regex: /postgres(ql)?:\/\/[^\s"'`]+/g,
    descricao: "string de conexão de banco",
  },
  {
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    descricao: "chave privada",
  },
  {
    regex: /["'][A-Za-z0-9_-]{60,}["']/g,
    descricao: "literal longo com cara de credencial",
  },
];

const erros = [];

for (const arquivo of arquivos(pastaFonte)) {
  const relativo = relative(raiz, arquivo);
  const linhas = readFileSync(arquivo, "utf8").split("\n");

  linhas.forEach((linha, indice) => {
    if (ehComentario(linha)) return;
    for (const { regex, descricao } of padroes) {
      regex.lastIndex = 0;
      if (regex.test(linha)) {
        erros.push(`${relativo}:${indice + 1} — ${descricao} hardcoded`);
      }
    }
  });
}

// Toda variável EXPO_PUBLIC_* acessada em código precisa de exemplo no .env.example.
const exemplo = readFileSync(join(raiz, ".env.example"), "utf8");
const declaradas = new Set(
  [...exemplo.matchAll(/^\s*(EXPO_PUBLIC_[A-Z0-9_]+)=/gm)].map((m) => m[1]),
);

for (const arquivo of arquivos(pastaFonte)) {
  const conteudo = readFileSync(arquivo, "utf8");
  const usadas = [
    ...conteudo.matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g),
  ].map((m) => m[1]);
  for (const variavel of new Set(usadas)) {
    if (!declaradas.has(variavel)) {
      erros.push(
        `${relative(raiz, arquivo)} — ${variavel} usada mas ausente no .env.example`,
      );
    }
  }
}

if (erros.length > 0) {
  console.error("Falhas no padrão de segurança/ambiente:\n");
  for (const erro of erros) console.error(`- ${erro}`);
  process.exit(1);
}

console.log("Sem segredo hardcoded; .env.example cobre todas as variáveis usadas.");
