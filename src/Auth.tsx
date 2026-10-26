import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PasswordInput } from "./components/password-input";
import { supabase } from "./supabase";
import {
  codigoExiste,
  definirTipoDoLogin,
  lerCodigoSalvo,
  salvarCodigo,
} from "./utils/codigoCondominio";

// Regras de senha e e-mail no cliente: só conveniência. Quem vale é o painel do Supabase
// (Authentication > Passwords); mantenha o mesmo mínimo lá.
const SENHA_MIN = 8;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// `conferindo`: o index.tsx está conferindo no servidor o condomínio de um login recém-feito.
// `erroAcesso`: motivo da recusa dessa conferência, mostrado no card de login (e limpo por
// `aoLimparErroAcesso` assim que a pessoa mexe nos campos).
export function Auth({
  conferindo = false,
  erroAcesso = "",
  aoLimparErroAcesso,
}: {
  conferindo?: boolean;
  erroAcesso?: string;
  aoLimparErroAcesso?: () => void;
}) {
  // --- BARREIRA DE CÓDIGO DO CONDOMÍNIO ---
  // O código escolhe o condomínio; depois do login, o index.tsx confere no servidor se o
  // usuário pertence a ele (usuarioPertence) antes de liberar o app.
  const [etapaAcesso, setEtapaAcesso] = useState<"codigo" | "login">("codigo");
  const [codigoCondominio, setCodigoCondominio] = useState("");
  const [codigoValidado, setCodigoValidado] = useState("");
  const [erroCodigo, setErroCodigo] = useState("");

  // --- ESTADO DO MODAL DE ALERTA ---
  const [alerta, setAlerta] = useState({
    visivel: false,
    titulo: "",
    mensagem: "",
  });

  const mostrarAlerta = (titulo: string, mensagem: string) => {
    setAlerta({ visivel: true, titulo, mensagem });
  };

  const [validandoCodigo, setValidandoCodigo] = useState(false);
  const [restaurando, setRestaurando] = useState(true);

  // Se já validou antes e o código ainda existe, abre direto no login.
  useEffect(() => {
    let ativo = true;
    (async () => {
      const salvo = await lerCodigoSalvo();
      const valido = salvo ? await codigoExiste(salvo) : null;
      if (!ativo) return;
      if (salvo && valido) {
        setCodigoValidado(salvo);
        setEtapaAcesso("login");
      } else if (salvo) {
        if (valido === false) await salvarCodigo(null); // código removido do condomínio
        setCodigoCondominio(salvo);
      }
      setRestaurando(false);
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const handleValidarCodigo = async () => {
    const codigoLimpo = codigoCondominio.trim().toLowerCase();

    if (!codigoLimpo) {
      setErroCodigo("Digite o código do seu condomínio.");
      return;
    }

    setValidandoCodigo(true);
    const valido = await codigoExiste(codigoLimpo);
    setValidandoCodigo(false);

    if (valido === null) {
      setErroCodigo(
        "Não foi possível verificar o código agora. Tente novamente.",
      );
      return;
    }
    if (!valido) {
      setErroCodigo("Código de condomínio não encontrado.");
      return;
    }

    setErroCodigo("");
    // Grava antes de liberar o login: a conferência pós-login lê este código. Se o
    // aparelho não guardar, vale só até fechar o app (fica em memória) e a pessoa é avisada.
    if (!(await salvarCodigo(codigoLimpo))) {
      mostrarAlerta(
        "Atenção",
        "Não foi possível guardar o código neste aparelho. Você precisará informá-lo de novo ao reabrir o app.",
      );
    }
    setCodigoValidado(codigoLimpo);
    setEtapaAcesso("login");
  };

  // Voltar para a tela de código
  const handleVoltarParaCodigo = () => {
    salvarCodigo(null);
    setCodigoCondominio("");
    setCodigoValidado("");
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
  const ocupado = loading || conferindo;
  // Erro do login aparece no próprio card, não em alerta.
  const [erroLogin, setErroLogin] = useState("");
  const erroExibido = erroLogin || erroAcesso;
  const limparErroLogin = () => {
    if (erroLogin) setErroLogin("");
    if (erroAcesso) aoLimparErroAcesso?.();
  };

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
    limparErroLogin();
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
    // O gatilho do banco recusa o cadastro com código de condomínio ou de síndico errado.
    if (msg.includes("database error saving new user"))
      return "Não foi possível criar a conta. Confira o código do condomínio e, se for síndico, o código único.";
    return "Ocorreu um erro inesperado. Tente novamente.";
  };

  const fazerLogin = async () => {
    limparErroLogin();
    if (!email || !password) {
      setErroLogin("Preencha o e-mail e a senha.");
      return;
    }
    setLoading(true);
    // A aba escolhida (Morador/Síndico) é conferida no servidor depois do login (index.tsx).
    definirTipoDoLogin(tipoUsuario);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      definirTipoDoLogin(null);
      if (error.message.includes("Email not confirmed")) {
        mostrarAlerta(
          "E-mail não verificado",
          "Insira o código que enviámos para o seu e-mail.",
        );
        setView("confirmar_otp");
      } else {
        setErroLogin(traduzirErro(error.message));
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
      mostrarAlerta("Atenção", "Por favor, preencha todos os dados pessoais.");
      return;
    }
    if (unidade === "Apto: " || unidade.trim() === "Apto:") {
      mostrarAlerta(
        "Atenção",
        "Por favor, informe o número do seu Apartamento.",
      );
      return;
    }
    if (!EMAIL_VALIDO.test(email.trim())) {
      mostrarAlerta("Atenção", "Informe um e-mail válido.");
      return;
    }
    if (password.length < SENHA_MIN) {
      mostrarAlerta(
        "Atenção",
        `A senha deve ter no mínimo ${SENHA_MIN} caracteres.`,
      );
      return;
    }
    if (password !== confirmPassword) {
      mostrarAlerta(
        "Atenção",
        "As senhas não coincidem. Verifique a digitação.",
      );
      return;
    }
    if (tipoUsuario === "sindico" && !codigoSindico) {
      mostrarAlerta("Atenção", "Informe o código único de síndico.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          // Perfil e aprovação são definidos pelo banco (gatilho em auth.users);
          // o app só envia os códigos digitados, que o servidor valida.
          codigo_condominio: codigoValidado,
          ...(tipoUsuario === "sindico" && { codigo_sindico: codigoSindico }),
          nome_completo: nome,
          data_nascimento: nascimento,
          celular: celular,
          unidade: unidade,
        },
      },
    });

    if (error) {
      mostrarAlerta("Erro no Cadastro", traduzirErro(error.message));
    } else {
      mostrarAlerta(
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
      mostrarAlerta("Atenção", "Digite o código recebido no e-mail.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "signup",
    });
    if (error) {
      mostrarAlerta("Erro", traduzirErro(error.message));
    } else {
      mostrarAlerta("Sucesso!", "Conta verificada! Já pode entrar no app.");
      mudarTela("login");
    }
    setLoading(false);
  };

  const pedirCodigo = async () => {
    if (!email.trim()) {
      mostrarAlerta("Atenção", "Informe o seu e-mail.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) {
      // Mensagem única: não revela se o e-mail tem conta (só rede/limite de envios falham aqui).
      mostrarAlerta(
        "Erro",
        "Não foi possível enviar agora. Tente novamente em instantes.",
      );
    } else {
      // Mesma resposta exista conta ou não.
      mostrarAlerta(
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
      mostrarAlerta(
        "Atenção",
        `A senha deve ter no mínimo ${SENHA_MIN} caracteres.`,
      );
      return;
    }
    setLoading(true);
    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "recovery",
    });
    if (otpError) {
      mostrarAlerta("Erro", "Código inválido.");
      setLoading(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    if (updateError) mostrarAlerta("Erro", traduzirErro(updateError.message));
    else {
      mostrarAlerta("Sucesso", "Senha alterada!");
      mudarTela("login");
    }
    setLoading(false);
  };

  // --- ESPERA: conferindo no servidor o código guardado ---
  if (restaurando) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0f172a",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color="#818cf8" size="large" />
      </View>
    );
  }

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
          <Image
            source={require("../assets/images/altadef1024.png")}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
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
              opacity: validandoCodigo ? 0.7 : 1,
            }}
            onPress={handleValidarCodigo}
            disabled={validandoCodigo}
          >
            {validandoCodigo ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
                Acessar Condomínio
              </Text>
            )}
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
            <Image
              source={require("../assets/images/altadef1024.png")}
              style={{
                width: compacto ? 40 : 54,
                height: compacto ? 40 : 54,
                marginRight: 8,
              }}
              resizeMode="contain"
            />
            <Text style={[styles.logo, compacto && { fontSize: 34 }]}>
              Condo<Text style={{ color: "#818cf8" }}>Owl</Text>
            </Text>
          </View>

          {/* 🟢 BOTÃO DE TROCAR CONDOMÍNIO (ESTILO PÍLULA) 🟢 */}
          <TouchableOpacity
            onPress={handleVoltarParaCodigo}
            disabled={ocupado}
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
              onChangeText={(texto) => {
                setEmail(texto);
                limparErroLogin();
              }}
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
                onChangeText={(texto) => {
                  setPassword(texto);
                  limparErroLogin();
                }}
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
                  style={{
                    color: "#cbd5e1",
                    marginLeft: 8,
                    fontWeight: "500",
                  }}
                >
                  Manter conectado
                </Text>
              </View>
            )}

            {view === "login" && erroExibido ? (
              <Text style={styles.erroLogin} accessibilityRole="alert">
                {erroExibido}
              </Text>
            ) : null}

            <TouchableOpacity
              style={styles.button}
              disabled={ocupado}
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
              {ocupado ? (
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
  erroLogin: {
    color: "#ef4444",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)", // Fundo escuro e opaco
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCaixa: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8, // Sombra para o Android
  },
  modalTitulo: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#f8fafc",
    marginBottom: 12,
    textAlign: "center",
  },
  modalMensagem: {
    fontSize: 15,
    color: "#cbd5e1",
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 22,
  },
  modalBotao: {
    backgroundColor: "#6366f1",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  modalBotaoTexto: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
