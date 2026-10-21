import React, { useState } from "react";
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

type PasswordInputProps = Omit<TextInputProps, "secureTextEntry" | "style"> & {
  style?: StyleProp<TextStyle>;
  iconColor?: string;
};

// Campo de senha com botão para mostrar/ocultar o texto digitado.
export function PasswordInput({
  style,
  iconColor = "#94a3b8",
  ...rest
}: PasswordInputProps) {
  const [visivel, setVisivel] = useState(false);

  // A margem externa fica no wrapper para o botão ficar centralizado no campo.
  const { marginBottom, ...estiloCampo } = StyleSheet.flatten(style) ?? {};

  return (
    <View style={{ marginBottom }}>
      <TextInput
        {...rest}
        style={[estiloCampo, styles.campo]}
        secureTextEntry={!visivel}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={styles.botao}
        onPress={() => setVisivel((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visivel ? "Ocultar senha" : "Mostrar senha"}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name={visivel ? "eye-off" : "eye"} size={20} color={iconColor} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  campo: { marginBottom: 0, paddingRight: 52 },
  botao: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: 52,
    alignItems: "center",
    justifyContent: "center",
  },
});
