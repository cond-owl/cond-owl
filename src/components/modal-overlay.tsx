import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Fundo dos modais: rolável (telas baixas/paisagem), sem esconder campos atrás
// do teclado e respeitando as áreas seguras do aparelho.
export function ModalOverlay({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <BlurView intensity={20} tint="dark" style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingTop: 20 + insets.top,
            paddingBottom: 20 + insets.bottom,
            paddingLeft: 20 + insets.left,
            paddingRight: 20 + insets.right,
          }}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </BlurView>
  );
}
