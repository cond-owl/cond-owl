import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import {
  chaveData,
  formatarDataCurta,
  formatarHora,
  horaParaData,
} from "../utils/calendario";
import type { DateTimeFieldProps } from "./date-time-field.types";

// Versão nativa (iOS/Android). A versão web fica em date-time-field.web.tsx,
// porque o DateTimePicker nativo não funciona no navegador/PWA. No modo hora o
// seletor usa a roda (spinner), que é o formato que permite limitar os minutos.
export function DateTimeField({
  mode,
  value,
  onChange,
  minimumDate,
  minimumTime,
  minuteStep = 5,
  placeholder = "Selecionar",
  label,
  colors,
  centered,
}: DateTimeFieldProps) {
  const [aberto, setAberto] = useState(false);

  const texto = value
    ? mode === "date"
      ? formatarDataCurta(chaveData(value))
      : formatarHora(value)
    : placeholder;

  // Sem valor, a roda abre em 00:00 (e não no horário atual). No modo data a base
  // continua sendo hoje.
  const valorInicial =
    value ?? (mode === "time" ? horaParaData("00:00") : new Date());

  // No modo hora, o limite também é uma hora do dia; a data continua hoje para o
  // seletor não bloquear por causa do dia.
  const limiteMinimo =
    mode === "time" && minimumTime ? horaParaData(minimumTime) : minimumDate;

  return (
    <>
      <TouchableOpacity
        style={[
          styles.campo,
          { borderColor: colors.border, backgroundColor: colors.bg },
          centered && { alignItems: "center" },
        ]}
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text
          style={{
            color: value ? colors.text : colors.textMuted,
            fontWeight: "bold",
          }}
        >
          {texto}
        </Text>
      </TouchableOpacity>

      {aberto && (
        <DateTimePicker
          value={valorInicial}
          mode={mode}
          is24Hour={true}
          display={mode === "time" ? "spinner" : "default"}
          minuteInterval={mode === "time" ? minuteStep : undefined}
          minimumDate={limiteMinimo}
          onChange={(event, selecionada) => {
            setAberto(false); // fecha já para evitar bug no Android
            if (event.type === "set" && selecionada) onChange(selecionada);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  campo: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    justifyContent: "center",
  },
});