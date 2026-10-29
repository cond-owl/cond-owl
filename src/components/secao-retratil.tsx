import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type CoresSecao = {
  bg: string;
  text: string;
  textMuted: string;
  border: string;
};

// Seção retrátil do menu de ajustes: o título abre e fecha o conteúdo. Serve para
// agrupar configurações novas sem aumentar o menu.
export function SecaoRetratil({
  titulo,
  icone,
  cores,
  abertoInicialmente = false,
  children,
}: {
  titulo: string;
  icone: keyof typeof Feather.glyphMap;
  cores: CoresSecao;
  abertoInicialmente?: boolean;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(abertoInicialmente);

  return (
    <View style={{ marginBottom: 8 }}>
      <TouchableOpacity
        style={[styles.cabecalho, { borderBottomColor: cores.border }]}
        onPress={() => setAberto((prev) => !prev)}
        accessibilityRole="button"
        accessibilityLabel={titulo}
      >
        <View style={[styles.icone, { backgroundColor: cores.bg }]}>
          <Feather name={icone} size={16} color={cores.textMuted} />
        </View>
        <Text style={[styles.titulo, { color: cores.text }]}>{titulo}</Text>
        <Feather
          name={aberto ? "chevron-up" : "chevron-down"}
          size={18}
          color={cores.textMuted}
        />
      </TouchableOpacity>
      {aberto && <View style={styles.conteudo}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  cabecalho: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  icone: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  titulo: { flex: 1, fontSize: 15, fontWeight: "700" },
  conteudo: { paddingTop: 16, paddingBottom: 8, paddingLeft: 4 },
});