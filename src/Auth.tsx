import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "./supabase";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { PasswordInput } from "./components/password-input";
import { avisar } from "./utils/avisar";

// Regras de senha e e-mail no cliente: só conveniência. Quem vale é o painel do Supabase
// (Authentication > Passwords); mantenha o mesmo mínimo lá.
const SENHA_MIN = 8;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function Auth() {
  // --- BARREIRA DE CÓDIGO DO CONDOMÍNIO (LOCAL) ---
  const CODIGO_VALIDO = "colinasderomaii.owl";
  const CHAVE_STORAGE = "@condoowl:codigo_validado";

  const [etapaAcesso, setEtapaAcesso] = useState<"codigo" | "login">("codigo");
  const [codigoCondominio, setCodigoCondominio] = useState("");
  const [erroCodigo, setErroCodigo] = useState("");

  // Requisito 2: Se já validou antes, abre direto no login
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const codigoSalvo = window.localStorage.getItem(CHAVE_STORAGE);
        if (codigoSalvo === CODIGO_VALIDO) {
          setEtapaAcesso("login");
        }
      }
    } catch (e) {}
  }, []);

  const handleValidarCodigo = () => {
    const codigoLimpo = codigoCondominio.trim().toLowerCase();

    if (!codigoLimpo) {
      setErroCodigo("Digite o código do seu condomínio.");
      return;
    }

    if (codigoLimpo === CODIGO_VALIDO) {
      setErroCodigo("");
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(CHAVE_STORAGE, codigoLimpo);
      }
      setEtapaAcesso("login");
    } else {
      setErroCodigo("Código de condomínio incorreto ou não encontrado.");
    }
  };

  // Requisito 1: Voltar para a tela de código
  const handleVoltarParaCodigo = () => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(CHAVE_STORAGE);
    }
    setCodigoCondominio("");
    setErroCodigo("");
    setEtapaAcesso("codigo");
  };

  // --- ESTADOS DO LOGIN ORIGINAL ---
  const [view, setView] = useState<
    "login" | "cadastro" | "esqueci" | "recuperar" | "confirmar_otp"
  >("login");
  const [tipoUsuario, setTipoUsuario] = useState<"morador" | "sindico">(
    "morador",
  );
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [token, setToken] = useState("");
  const [codigoSindico, setCodigoSindico] = useState("");

  const [nome, setNome] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [celular, setCelular] = useState("");
  const [unidade, setUnidade] = useState("Apto: ");
  const [manterConectado, setManterConectado] = useState(false);

  // --- RESPONSIVIDADE ---
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compacto = width < 360;
  const tablet = width >= 768;
  const espacamento = compacto ? 16 : 24;

  // --- FUNÇÕES AUXILIARES ---
  const formatarNome = (texto: string) => texto.replace(/[^a-zA-ZÀ-ÿ\s]/g, "");

  const formatarData = (texto: string) => {
    const num = texto.replace(/\D/g, "");
    let formatado = num;
    if (num.length > 2) formatado = num.replace(/^(\d{2})(\d)/, "$1/$2");
    if (num.length > 4)
      formatado = formatado.replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
    return formatado.slice(0, 10);
  };

  const formatarCelular = (texto: string) => {
    const num = texto.replace(/\D/g, "");
    let formatado = num;
    if (num.length > 0) formatado = num.replace(/^(\d{2})(\d)/g, "($1) $2");
    if (num.length > 6)
      formatado = formatado.replace(/(\(\d{2}\) \d{5})(\d)/, "$1-$2");
    return formatado.slice(0, 15);
  };

  const lidarMudancaUnidade = (texto: string) => {
    if (!texto.startsWith("Apto: ")) {
      setUnidade("Apto: ");
      return;
    }
    const valorDigitado = texto.substring(6);
    const apenasNumeros = valorDigitado.replace(/\D/g, "");
    setUnidade("Apto: " + apenasNumeros);
  };

  const mudarTela = (novaTela: any) => {
    setView(novaTela);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setToken("");
    setCodigoSindico("");
    setNome("");
    setNascimento("");
    setCelular("");
    setUnidade("Apto: ");
  };

  const traduzirErro = (mensagemOriginal: string) => {
    const msg = mensagemOriginal.toLowerCase();
    if (msg.includes("already registered"))
      return "Este e-mail já está cadastrado.";
    if (msg.includes("invalid login credentials"))
      return "E-mail ou senha incorretos.";
    if (msg.includes("password should be at least"))
      return `A senha deve ter no mínimo ${SENHA_MIN} caracteres.`;
    if (msg.includes("email not confirmed"))
      return "E-mail não verificado. Por favor, valide o seu código.";
    if (msg.includes("invalid otp")) return "Código inválido ou expirado.";
    // O gatilho do banco recusa o cadastro com código de síndico errado.
    if (msg.includes("database error saving new user"))
      return "Não foi possível criar a conta. Se for síndico, confira o código único.";
    return "Ocorreu um erro inesperado. Tente novamente.";
  };

  const fazerLogin = async () => {
    if (!email || !password) {
      avisar("Atenção", "Preencha o e-mail e a senha.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message.includes("Email not confirmed")) {
        avisar(
          "E-mail não verificado",
          "Insira o código que enviámos para o seu e-mail.",
        );
        setView("confirmar_otp");
      } else {
        avisar("Erro no Login", traduzirErro(error.message));
      }
    } else {
      // 👇 SUCESSO: Salva a preferência de manter a sessão 👇
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(
          "@condoowl:manter_conectado",
          manterConectado ? "true" : "false",
        );
      }
    }
    setLoading(false);
  };

  const fazerCadastro = async () => {
    if (!nome || !nascimento || !celular || !email || !password) {
      avisar("Atenção", "Por favor, preencha todos os dados pessoais.");
      return;
    }
    if (unidade === "Apto: " || unidade.trim() === "Apto:") {
      avisar("Atenção", "Por favor, informe o número do seu Apartamento.");
      return;
    }
    if (!EMAIL_VALIDO.test(email.trim())) {
      avisar("Atenção", "Informe um e-mail válido.");
      return;
    }
    if (password.length < SENHA_MIN) {
      avisar("Atenção", `A senha deve ter no mínimo ${SENHA_MIN} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      avisar("Atenção", "As senhas não coincidem. Verifique a digitação.");
      return;
    }
    if (tipoUsuario === "sindico" && !codigoSindico) {
      avisar("Atenção", "Informe o código único de síndico.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          // Perfil e aprovação são definidos pelo banco (gatilho em auth.users);
          // o app só envia o código digitado, que o servidor valida.
          ...(tipoUsuario === "sindico" && { codigo_sindico: codigoSindico }),
          nome_completo: nome,
          data_nascimento: nascimento,
          celular: celular,
          unidade: unidade,
        },
      },
    });

    if (error) {
      avisar("Erro no Cadastro", traduzirErro(error.message));
    } else {
      avisar(
        "Quase lá!",
        "Enviámos um código para o seu e-mail. Confirme para finalizar a criação da conta.",
      );
      setToken("");
      setView("confirmar_otp");
    }
    setLoading(false);
  };

  const confirmarCadastroOTP = async () => {
    if (!token || token.length < 6) {
      avisar("Atenção", "Digite o código recebido no e-mail.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "signup",
    });
    if (error) {
      avisar("Erro", traduzirErro(error.message));
    } else {
      avisar("Sucesso!", "Conta verificada! Já pode entrar no app.");
      mudarTela("login");
    }
    setLoading(false);
  };

  const pedirCodigo = async () => {
    if (!email.trim()) {
      avisar("Atenção", "Informe o seu e-mail.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) {
      // Mensagem única: não revela se o e-mail tem conta (só rede/limite de envios falham aqui).
      avisar("Erro", "Não foi possível enviar agora. Tente novamente em instantes.");
    } else {
      // Mesma resposta exista conta ou não.
      avisar(
        "Verifique o seu e-mail",
        "Se o e-mail estiver cadastrado, enviamos um código.",
      );
      setView("recuperar");
    }
    setLoading(false);
  };

  const redefinirSenha = async () => {
    // Antes de verificar o código: o código é de uso único e não deve ser gasto
    // com uma senha que seria recusada.
    if (password.length < SENHA_MIN) {
      avisar("Atenção", `A senha deve ter no mínimo ${SENHA_MIN} caracteres.`);
      return;
    }
    setLoading(true);
    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "recovery",
    });
    if (otpError) {
      avisar("Erro", "Código inválido.");
      setLoading(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) avisar("Erro", traduzirErro(updateError.message));
    else {
      avisar("Sucesso", "Senha alterada!");
      mudarTela("login");
    }
    setLoading(false);
  };

  // --- ETAPA 1: TELA DE CÓDIGO DO CONDOMÍNIO ---
  if (etapaAcesso === "codigo") {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          backgroundColor: "#0f172a",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: tablet ? 560 : 480,
            alignItems: "center",
            padding: espacamento,
          }}
        >
          <MaterialCommunityIcons
            name="owl"
            size={compacto ? 60 : 80}
            color="#818cf8"
            style={{ marginBottom: 12 }}
          />

          <Text
            style={{
              fontSize: compacto ? 28 : 34,
              fontWeight: "900",
              color: "#f8fafc",
              marginBottom: 8,
            }}
          >
            Condo<Text style={{ color: "#818cf8" }}>Owl</Text>
          </Text>

          <Text
            style={{
              color: "#94a3b8",
              fontSize: 15,
              marginBottom: 28,
              textAlign: "center",
            }}
          >
            Informe o código de acesso do seu condomínio para acessar a área de
            login.
          </Text>

          <View style={{ width: "100%", marginBottom: 16 }}>
            <TextInput
              style={{
                backgroundColor: "#1e293b",
                color: "#f8fafc",
                width: "100%",
                padding: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: erroCodigo ? "#ef4444" : "#334155",
                fontSize: 16,
              }}
              placeholder="Digite o código"
              placeholderTextColor="#64748b"
              value={codigoCondominio}
              onChangeText={(text) => {
                setCodigoCondominio(text);
                if (erroCodigo) setErroCodigo("");
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {erroCodigo ? (
              <Text
                style={{
                  color: "#ef4444",
                  fontSize: 13,
                  marginTop: 6,
                  marginLeft: 2,
                }}
              >
                {erroCodigo}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={{
              backgroundColor: "#6366f1",
              width: "100%",
              padding: 16,
              borderRadius: 12,
              alignItems: "center",
            }}
            onPress={handleValidarCodigo}
          >
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
              Acessar Condomínio
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // --- ETAPA 2: FORMULÁRIO DE LOGIN/CADASTRO ---
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#0f172a" }}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: espacamento + insets.top,
            paddingBottom: espacamento + insets.bottom,
            paddingLeft: espacamento + insets.left,
            paddingRight: espacamento + insets.right,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            width: "100%",
            maxWidth: tablet ? 560 : 480,
            alignSelf: "center",
          }}
        >
          {/* LOGO */}
          <View
            style={[styles.logoContainer, compacto && { marginBottom: 16 }]}
          >
            <MaterialCommunityIcons
              name="owl"
              size={compacto ? 40 : 54}
              color="#818cf8"
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.logo, compacto && { fontSize: 34 }]}>
              Condo<Text style={{ color: "#818cf8" }}>Owl</Text>
            </Text>
          </View>

          {/* 🟢 BOTÃO DE TROCAR CONDOMÍNIO (ESTILO PÍLULA) 🟢 */}
          <TouchableOpacity
            onPress={handleVoltarParaCodigo}
            style={{
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "center",
              backgroundColor: "#1e293b",
              borderWidth: 1,
              borderColor: "#334155",
              borderRadius: 24,
              paddingVertical: 8,
              paddingHorizontal: 16,
              marginBottom: 24,
            }}
          >
            <MaterialCommunityIcons
              name="swap-horizontal"
              size={18}
              color="#818cf8"
            />
            <Text
              style={{
                color: "#cbd5e1",
                marginLeft: 8,
                fontWeight: "600",
                fontSize: 13,
              }}
            >
              Trocar condomínio
            </Text>
          </TouchableOpacity>

          {/* CARTÃO DE LOGIN */}
          <View style={[styles.card, compacto && { padding: 16 }]}>
            {(view === "login" || view === "cadastro") && (
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[
                    styles.tabButton,
                    tipoUsuario === "morador" && styles.tabActive,
                  ]}
                  onPress={() => {
                    setTipoUsuario("morador");
                    setCodigoSindico("");
                  }}
                >
                  <Text
                    style={[
                      styles.tabText,
                      tipoUsuario === "morador" && styles.tabTextActive,
                    ]}
                  >
                    Morador
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.tabButton,
                    tipoUsuario === "sindico" && styles.tabActive,
                  ]}
                  onPress={() => {
                    setTipoUsuario("sindico");
                  }}
                >
                  <Text
                    style={[
                      styles.tabText,
                      tipoUsuario === "sindico" && styles.tabTextActive,
                    ]}
                  >
                    Síndico
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.title}>
              {view === "login"
                ? "Acesso Seguro"
                : view === "cadastro"
                  ? "Criar Conta"
                  : view === "confirmar_otp"
                    ? "Confirmar E-mail"
                    : view === "esqueci"
                      ? "Recuperar Senha"
                      : "Nova Senha"}
            </Text>

            {view === "cadastro" && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Nome e Sobrenome"
                  placeholderTextColor="#64748b"
                  value={nome}
                  onChangeText={(text) => setNome(formatarNome(text))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Data de Nascimento (DD/MM/AAAA)"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                  maxLength={10}
                  value={nascimento}
                  onChangeText={(text) => setNascimento(formatarData(text))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Nº de Celular (com DDD)"
                  placeholderTextColor="#64748b"
                  keyboardType="phone-pad"
                  maxLength={15}
                  value={celular}
                  onChangeText={(text) => setCelular(formatarCelular(text))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Apto: 204"
                  placeholderTextColor="#64748b"
                  value={unidade}
                  onChangeText={lidarMudancaUnidade}
                  keyboardType="numeric"
                />
              </>
            )}

            <TextInput
              style={[
                styles.input,
                (view === "recuperar" || view === "confirmar_otp") && {
                  opacity: 0.6,
                },
              ]}
              placeholder="E-mail"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={view !== "recuperar" && view !== "confirmar_otp"}
            />

            {tipoUsuario === "sindico" && view === "cadastro" && (
              <PasswordInput
                style={styles.inputWarning}
                iconColor="#fde047"
                placeholder="Código Único do Síndico"
                placeholderTextColor="#9ca3af"
                value={codigoSindico}
                onChangeText={setCodigoSindico}
              />
            )}

            {(view === "recuperar" || view === "confirmar_otp") && (
              <TextInput
                style={styles.input}
                placeholder="Código recebido no e-mail"
                placeholderTextColor="#64748b"
                keyboardType="number-pad"
                maxLength={8}
                value={token}
                onChangeText={setToken}
              />
            )}

            {(view === "login" ||
              view === "cadastro" ||
              view === "recuperar") && (
              <PasswordInput
                style={styles.input}
                placeholder={
                  view === "login"
                    ? "Senha"
                    : view === "cadastro"
                      ? `Crie uma senha (mínimo ${SENHA_MIN} caracteres)`
                      : `Nova senha (mínimo ${SENHA_MIN} caracteres)`
                }
                placeholderTextColor="#64748b"
                value={password}
                onChangeText={setPassword}
              />
            )}

            {/* Regra sempre visível (o placeholder some ao digitar); fica verde ao atingir o mínimo. */}
            {(view === "cadastro" || view === "recuperar") && (
              <Text
                style={[
                  styles.dicaSenha,
                  password.length >= SENHA_MIN && { color: "#34d399" },
                ]}
              >
                {password.length >= SENHA_MIN ? "✓ " : ""}Mínimo de {SENHA_MIN}{" "}
                caracteres ({password.length}/{SENHA_MIN})
              </Text>
            )}

            {view === "cadastro" && (
              <PasswordInput
                style={styles.input}
                placeholder="Confirme a sua senha"
                placeholderTextColor="#64748b"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            )}

            {view === "login" && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <Switch
                  value={manterConectado}
                  onValueChange={setManterConectado}
                  trackColor={{ false: "#334155", true: "#818cf8" }}
                  thumbColor={manterConectado ? "#fff" : "#94a3b8"}
                />
                <Text
                  style={{ color: "#cbd5e1", marginLeft: 8, fontWeight: "500" }}
                >
                  Manter conectado
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.button}
              disabled={loading}
              onPress={
                view === "login"
                  ? fazerLogin
                  : view === "cadastro"
                    ? fazerCadastro
                    : view === "confirmar_otp"
                      ? confirmarCadastroOTP
                      : view === "esqueci"
                        ? pedirCodigo
                        : redefinirSenha
              }
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {view === "login"
                    ? "Entrar no App"
                    : view === "cadastro"
                      ? "Cadastrar"
                      : view === "confirmar_otp"
                        ? "Validar Código"
                        : view === "esqueci"
                          ? "Enviar Código"
                          : "Salvar Nova Senha"}
                </Text>
              )}
            </TouchableOpacity>

            {view === "login" && (
              <>
                <TouchableOpacity
                  onPress={() => mudarTela("esqueci")}
                  style={{ marginTop: 24, paddingVertical: 8 }}
                >
                  <Text style={styles.linkText}>Esqueceu a sua senha?</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => mudarTela("cadastro")}
                  style={{ marginTop: 8, paddingVertical: 8 }}
                >
                  <Text style={styles.linkText}>
                    Não tem conta?{" "}
                    <Text style={{ color: "#fff", fontWeight: "bold" }}>
                      Cadastre-se
                    </Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {(view === "cadastro" ||
              view === "esqueci" ||
              view === "recuperar" ||
              view === "confirmar_otp") && (
              <TouchableOpacity
                onPress={() => mudarTela("login")}
                style={{ marginTop: 24, paddingVertical: 8 }}
              >
                <Text style={styles.linkText}>Voltar ao Login</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logo: {
    fontSize: 44,
    fontWeight: "900",
    color: "#f8fafc",
    letterSpacing: -1,
  },
  card: {
    backgroundColor: "#1e293b",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  title: {
    fontSize: 20,
    color: "#f8fafc",
    fontWeight: "bold",
    marginBottom: 24,
    textAlign: "center",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    borderRadius: 8,
    padding: 4,
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 6,
  },
  tabActive: { backgroundColor: "#6366f1" },
  tabText: { color: "#64748b", fontWeight: "bold" },
  tabTextActive: { color: "#fff" },
  input: {
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    padding: 16,
    fontSize: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  // Fica logo abaixo do campo de senha: desfaz o marginBottom do input acima.
  dicaSenha: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: -8,
    marginBottom: 16,
  },
  inputWarning: {
    backgroundColor: "#332701",
    color: "#fde047",
    padding: 16,
    fontSize: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ca8a04",
  },
  button: {
    backgroundColor: "#6366f1",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  linkText: {
    color: "#818cf8",
    textAlign: "center",
    fontWeight: "600",
    fontSize: 15,
  },
});
