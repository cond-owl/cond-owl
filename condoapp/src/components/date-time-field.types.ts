export type DateTimeFieldProps = {
  mode: "date" | "time";
  value: Date | null;
  onChange: (valor: Date) => void;
  minimumDate?: Date;
  placeholder?: string;
  label: string; // rótulo de acessibilidade
  isDark: boolean;
  colors: { text: string; textMuted: string; border: string; bg: string };
  centered?: boolean;
};
