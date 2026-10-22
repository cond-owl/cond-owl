import React from "react";
import { chaveData, dataDaChave, formatarHora, horaParaData } from "../utils/calendario";
import type { DateTimeFieldProps } from "./date-time-field.types";

// Versão web/PWA: usa o seletor nativo do navegador (input date/time).
export function DateTimeField({
  mode,
  value,
  onChange,
  minimumDate,
  label,
  isDark,
  colors,
  centered,
}: DateTimeFieldProps) {
  const texto = value
    ? mode === "date"
      ? chaveData(value)
      : formatarHora(value)
    : "";

  return (
    <input
      type={mode}
      value={texto}
      min={mode === "date" && minimumDate ? chaveData(minimumDate) : undefined}
      aria-label={label}
      // Abre o calendário/seletor de horas ao tocar em qualquer parte do campo
      onClick={(e) => {
        try {
          e.currentTarget.showPicker();
        } catch {
          // navegador sem showPicker: o campo continua editável
        }
      }}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        onChange(mode === "date" ? dataDaChave(v) : horaParaData(v));
      }}
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: 18,
        marginBottom: 16,
        borderRadius: 16,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.bg,
        color: colors.text,
        colorScheme: isDark ? "dark" : "light",
        fontSize: 16, // evita zoom automático no iOS
        fontWeight: 700,
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: centered ? "center" : "left",
      }}
    />
  );
}
