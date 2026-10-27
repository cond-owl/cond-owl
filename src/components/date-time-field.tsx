import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { formatarDataCurta, formatarHora, chaveData } from "../utils/calendario";
import type { DateTimeFieldProps } from "./date-time-field.types";

// Versão nativa (iOS/Android). A versão web fica em date-time-field.web.tsx,
// porque o DateTimePicker nativo não funciona no navegador/PWA.
export function DateTimeField({
  mode,
  value,
  onChange,
  minimumDate,
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
          value={value ?? new Date()}
          mode={mode}
          is24Hour={true}
          display="default"
          minimumDate={minimumDate}
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
