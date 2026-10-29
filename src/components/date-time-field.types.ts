// Passo de minutos aceito pelo seletor nativo (mesma união da biblioteca).
export type PassoMinutos = 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;

export type DateTimeFieldProps = {
  mode: "date" | "time";
  value: Date | null;
  onChange: (valor: Date) => void;
  minimumDate?: Date; // modo data: primeiro dia permitido
  minimumTime?: string; // modo hora ("HH:mm"): primeira hora permitida
  minuteStep?: PassoMinutos; // modo hora: passo dos minutos (padrão 5)
  placeholder?: string;
  label: string; // rótulo de acessibilidade
  isDark: boolean;
  colors: { text: string; textMuted: string; border: string; bg: string };
  centered?: boolean;
};