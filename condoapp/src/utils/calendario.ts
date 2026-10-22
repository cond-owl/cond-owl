export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const doisDigitos = (n: number) => String(n).padStart(2, "0");

// Chave AAAA-MM-DD (mes 0-11). Ordena corretamente como texto.
export const chaveDe = (ano: number, mes: number, dia: number) =>
  `${ano}-${doisDigitos(mes + 1)}-${doisDigitos(dia)}`;

export const chaveData = (d: Date) =>
  chaveDe(d.getFullYear(), d.getMonth(), d.getDate());

export const dataDaChave = (chave: string) => {
  const [ano, mes, dia] = chave.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
};

export const inicioDoDia = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const diasNoMes = (ano: number, mes: number) =>
  new Date(ano, mes + 1, 0).getDate();

export const formatarDataLonga = (chave: string) => {
  const d = dataDaChave(chave);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
};

export const formatarHora = (d: Date) =>
  `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;

// "HH:mm" -> Date de hoje com aquele horário (para alimentar o seletor de hora).
export const horaParaData = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
