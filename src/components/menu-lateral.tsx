import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    Animated,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CoresMenu = {
  card: string;
  text: string;
  textMuted: string;
  border: string;
};

const LARGURA_PAINEL = 320;

// Menu lateral de ajustes: entra pela direita sobre um fundo escurecido e fecha ao
// tocar fora ou no X. O conteúdo (seções retráteis) vem de quem usa o componente,
// para novas configurações entrarem sem mexer no menu.
export function MenuLateral({
  visivel,
  titulo,
  aoFechar,
  cores,
  children,
}: {
  visivel: boolean;
  titulo: string;
  aoFechar: () => void;
  cores: CoresMenu;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [deslocamento] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!visivel) return;
    deslocamento.setValue(1);
    Animated.timing(deslocamento, {
      toValue: 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [visivel, deslocamento]);

  return (
    <Modal
      visible={visivel}
      transparent
      animationType="fade"
      onRequestClose={aoFechar}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={aoFechar} />
        <Animated.View
          style={[
            styles.painel,
            {
              backgroundColor: cores.card,
              borderLeftColor: cores.border,
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 16,
              transform: [
                {
                  translateX: deslocamento.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, LARGURA_PAINEL],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.cabecalho, { borderBottomColor: cores.border }]}>
            <Text style={[styles.titulo, { color: cores.text }]}>{titulo}</Text>
            <TouchableOpacity
              onPress={aoFechar}
              style={styles.fechar}
              accessibilityLabel="Fechar ajustes"
            >
              <Feather name="x" size={22} color={cores.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 8 }}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.45)" },
  painel: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: LARGURA_PAINEL,
    maxWidth: "86%",
    borderLeftWidth: 1,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: -8, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 16,
  },
  cabecalho: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  titulo: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  fechar: { padding: 6 },
});