import { Alert, Platform } from "react-native";

// Alert.alert não faz nada no react-native-web: erros e confirmações sumiam no
// navegador (PWA). No web usa window.alert; no celular, o Alert nativo.
export function avisar(titulo: string, mensagem?: string) {
  if (Platform.OS === "web") {
    window.alert(mensagem ? `${titulo}\n\n${mensagem}` : titulo);
    return;
  }
  Alert.alert(titulo, mensagem);
}
