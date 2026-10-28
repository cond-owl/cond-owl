import { solicitarPermissaoNotificacao } from "@/utils/notificacoes";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Session } from "@supabase/supabase-js";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  Linking,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Auth } from "../Auth"; // Ajuste o caminho se necessário
import { DateTimeField } from "../components/date-time-field";
import { ModalOverlay } from "../components/modal-overlay";
import { supabase } from "../supabase"; // Ajuste o caminho se necessário
import {
  DIAS_SEMANA,
  MESES,
  chaveData,
  chaveDe,
  dataDaChave,
  diasNoMes,
  formatarDataCurta,
  formatarDataLonga,
  formatarHora,
  horaParaData,
  inicioDoDia,
} from "../utils/calendario";
import {
  definirTipoDoLogin,
  lerCodigoSalvo,
  lerTipoDoLogin,
  usuarioEhDoTipo,
  usuarioPertence,
} from "../utils/codigoCondominio";
import {
  LIMITE,
  avaliarSugestaoNoBanco,
  carregarAtas,
  carregarEventos,
  carregarSugestoes,
  criarAta,
  criarReserva,
  criarSugestao,
  type Ata,
  type Evento,
  type Sugestao,
} from "../utils/dadosCondominio";

// Linha da tabela `comunicados` como o PostgREST devolve (snake_case).
interface ComunicadoRow {
  id: number;
  tipo: string;
  titulo: string;
  texto: string;
  created_at: string;
  comunicados_vistos: { user_id: string }[] | null;
}

// --- INTERFACES ---
interface Comunicado {
  id: number;
  tipo: string;
  titulo: string;
  texto: string;
  data: string;
  vistoPor: string[];
}

const ORIENTACOES: ("portrait" | "landscape")[] = ["portrait", "landscape"];

// Linha devolvida pela RPC get_moradores_pendentes (perfil do morador aguardando aprovação).
interface MoradorPendente {
  id: string;
  nome_completo: string | null;
  email: string | null;
  unidade: string | null;
  data_nascimento: string | null;
}

export default function App() {
  // --- ESTADO DO MODAL GLOBAL DE ALERTA ---
  const [alerta, setAlerta] = useState({
    visivel: false,
    titulo: "",
    mensagem: "",
  });

  const mostrarAlerta = (titulo: string, mensagem: string) => {
    setAlerta({ visivel: true, titulo, mensagem });
  };

  // ==========================================
  // --- PREFERÊNCIAS DE NOTIFICAÇÃO ---
  // ==========================================
  const [prefsNotificacoes, setPrefsNotificacoes] = useState({
    manutencao: true,
    social: true,
  });

  const carregarPreferencias = async (uid: string) => {
    const { data, error } = await supabase
      .from("perfis")
      .select("notifica_manutencao, notifica_social")
      .eq("id", uid)
      .single();

    if (error || !data) {
      mostrarAlerta(
        "Erro",
        "Não foi possível carregar as preferências de notificações.",
      );
      return;
    }

    setPrefsNotificacoes({
      manutencao: data.notifica_manutencao,
      social: data.notifica_social,
    });
  };

  const alternarPreferencia = async (
    chave: "manutencao" | "social",
    valor: boolean,
  ) => {
    setPrefsNotificacoes((prev) => ({ ...prev, [chave]: valor }));

    const uid = session?.user.id;
    if (!uid) {
      mostrarAlerta("Erro", "Não foi possível identificar sua sessão.");
      setPrefsNotificacoes((prev) => ({ ...prev, [chave]: !valor }));
      return;
    }

    const coluna =
      chave === "manutencao" ? "notifica_manutencao" : "notifica_social";
    const { data, error } = await supabase
      .from("perfis")
      .update({ [coluna]: valor })
      .eq("id", uid)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      mostrarAlerta("Erro", "Não foi possível guardar a sua preferência.");
      setPrefsNotificacoes((prev) => ({ ...prev, [chave]: !valor }));
    }
  };

  // --- SISTEMA DE AUTENTICAÇÃO ---
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [isPending, setIsPending] = useState<boolean>(false);
  const [nomeUsuario, setNomeUsuario] = useState("Morador");
  // Verdadeiro até a primeira decisão de sessão (inclui a conferência do condomínio).
  const [verificandoSessao, setVerificandoSessao] = useState<boolean>(true);
  // Verdadeiro enquanto o servidor confere o condomínio de um login recém-feito: o login
  // fica travado (sem toques repetidos nem "Trocar condomínio" no meio da conferência).
  const [conferindoCondominio, setConferindoCondominio] =
    useState<boolean>(false);
  // Motivo da recusa da conferência, mostrado no card de login.
  const [erroAcesso, setErroAcesso] = useState<string>("");

  useEffect(() => {
    const organizarSessao = (sessaoDeAcesso: Session | null) => {
      setSession(sessaoDeAcesso);

      if (sessaoDeAcesso?.user) {
        // Perfil e aprovação vêm de app_metadata (só o servidor altera).
        // user_metadata é editável pelo próprio usuário e só serve para dados de exibição.
        const metadata = sessaoDeAcesso.user.user_metadata;
        const appMetadata = sessaoDeAcesso.user.app_metadata;
        const role = appMetadata?.role === "sindico" ? "sindico" : "morador";
        const aprovado = appMetadata?.status_aprovacao === "aprovado";

        setUser(role); // Define se é 'sindico' ou 'morador'

        // Nome informado no cadastro (só o primeiro nome, mais amigável).
        // Vem da sessão para aparecer já no primeiro login, sem depender de remontar a tela.
        const nomeCadastro = String(metadata?.nome_completo ?? "").trim();
        setNomeUsuario(
          nomeCadastro
            ? nomeCadastro.split(/\s+/)[0]
            : role === "sindico"
              ? "Síndico"
              : "Morador",
        );

        // Nega por padrão: morador só entra com status_aprovacao = aprovado
        setIsPending(role === "morador" && !aprovado);
      } else {
        setUser(null);
        setIsPending(false);
      }
    };

    // Só libera o app depois que o servidor confirma que o usuário pertence ao condomínio
    // do código digitado na primeira tela. Até lá a sessão não é exposta (mostra o login ou
    // a espera), então nada do app aparece para quem não passa na conferência.
    let sequencia = 0; // descarta resposta de uma conferência já superada por outra sessão
    let usuarioVerificado: string | null = null;

    const receberSessao = (sessao: Session | null) => {
      const minha = ++sequencia;

      if (!sessao?.user) {
        usuarioVerificado = null;
        organizarSessao(null);
        setVerificandoSessao(false);
        setConferindoCondominio(false);
        return;
      }
      // Renovação de token do mesmo usuário já conferido: não refaz a pergunta.
      if (usuarioVerificado === sessao.user.id) {
        organizarSessao(sessao);
        setVerificandoSessao(false);
        setConferindoCondominio(false);
        return;
      }

      // Fora do callback do auth: chamar o Supabase de dentro dele pode travar.
      setConferindoCondominio(true);
      setTimeout(async () => {
        const codigo = await lerCodigoSalvo();
        const tipo = lerTipoDoLogin();
        const pertence = codigo ? await usuarioPertence(codigo) : false;
        // O tipo (aba Morador/Síndico) só é conferido se houve escolha neste login e o
        // condomínio já passou; sessão restaurada na abertura não tem escolha.
        const doTipo = pertence && tipo ? await usuarioEhDoTipo(tipo) : true;
        if (minha !== sequencia) return;
        definirTipoDoLogin(null); // a escolha vale para uma conferência só

        if (pertence && doTipo) {
          usuarioVerificado = sessao.user.id;
          organizarSessao(sessao);
          setVerificandoSessao(false);
          setConferindoCondominio(false);
          return;
        }

        // Falhou: nega por padrão e encerra a sessão. Sem código guardado (sessão de antes
        // desta conferência) volta ao login sem aviso; o usuário informa o código de novo.
        organizarSessao(null);
        setVerificandoSessao(false);
        setConferindoCondominio(false);
        // scope local: encerra só este aparelho, sem derrubar o usuário nos outros.
        await supabase.auth.signOut({ scope: "local" });
        // O motivo aparece no card de login (Auth), não em alerta.
        if (pertence === null || doTipo === null) {
          setErroAcesso(
            "Não foi possível verificar o seu acesso. Tente novamente.",
          );
        } else if (codigo && !pertence) {
          setErroAcesso(
            "Este usuário não pertence ao condomínio do código informado.",
          );
        } else if (codigo && tipo) {
          setErroAcesso(
            `Este usuário não é ${tipo === "sindico" ? "síndico" : "morador"}. Escolha a aba correta e entre de novo.`,
          );
        }
      }, 0);
    };

    const iniciarApp = async () => {
      // 1. Aplica a trava do "Manter conectado"
      if (typeof window !== "undefined" && window.localStorage) {
        const manter = window.localStorage.getItem(
          "@condoowl:manter_conectado",
        );

        if (manter === "false") {
          await supabase.auth.signOut();
          window.localStorage.removeItem("@condoowl:manter_conectado");
          receberSessao(null); // sem sessão não há conferência; garante sair da espera
          return;
        }
      }

      // 2. Se a trava não bloqueou, carrega a sessão normalmente
      const {
        data: { session },
      } = await supabase.auth.getSession();
      receberSessao(session);
    };

    iniciarApp();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      receberSessao(session);
    });

    return () => {
      sequencia++; // cancela conferência pendente
      subscription.unsubscribe();
    };
  }, []);

  // Se não estiver logado, bloqueia a tela e mostra o Login!

  // --------------------------------
  const [isDark, setIsDark] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("feed");
  const [clickCount, setClickCount] = useState<number>(0);
  const [showAdmin, setShowAdmin] = useState<boolean>(false);

  // --- RESPONSIVIDADE (celulares, tablets e PWA) ---
  const { width: larguraTela } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compacto = larguraTela < 360;
  const tablet = larguraTela >= 768;
  const larguraApp = tablet ? 860 : 600; // largura máxima do CONTEÚDO (o fundo é tela cheia)
  const paddingLateral = compacto ? 14 : tablet ? 28 : 20;

  // --- CALENDÁRIO: sempre parte do mês real atual ---
  const hoje = inicioDoDia(new Date());
  const hojeChave = chaveData(hoje);
  const [mesVisivel, setMesVisivel] = useState(() => ({
    ano: hoje.getFullYear(),
    mes: hoje.getMonth(),
  }));

  // --- ESTADO DA LISTA DE ESPERA (Agora começa vazia) ---
  const [moradoresPendentes, setMoradoresPendentes] = useState<
    MoradorPendente[]
  >([]);

  // --- BUSCAR DADOS REAIS DO SUPABASE ---
  const [erroPendentes, setErroPendentes] = useState<string>("");

  const buscarPendentes = async () => {
    const { data, error } = await supabase.rpc("get_moradores_pendentes");
    // Sem console.log: o objeto de erro pode carregar dados pessoais dos moradores.
    if (error) {
      setErroPendentes("Não foi possível carregar a lista de moradores.");
      return;
    }
    setErroPendentes("");
    setMoradoresPendentes(data ?? []);
  };

  // Executa a busca automaticamente sempre que o síndico abre a aba de aprovações
  useEffect(() => {
    if (user === "sindico" && activeTab === "aprovacoes") {
      buscarPendentes();
    }
  }, [user, activeTab]);

  // --- FUNÇÃO PARA APROVAR REALMENTE ---
  const aprovarMorador = async (id: string) => {
    const { error } = await supabase.rpc("aprovar_acesso_morador", {
      morador_id: id,
    });

    if (error) {
      mostrarAlerta("Erro", "Não foi possível aprovar o morador.");
    } else {
      // Remove da tela imediatamente se der sucesso no banco
      setMoradoresPendentes((prev) => prev.filter((m) => m.id !== id));
      mostrarAlerta("Sucesso", "O acesso do morador foi libertado!");
    }
  };

  // --- FUNÇÃO OFICIAL DE LOGOUT ---
  const fazerLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      mostrarAlerta("Erro ao sair", error.message);
    }
    // Não precisa de fazer mais nada, o useEffect deteta a saída e mostra o Auth.tsx novo!
  };

  // Comunicados vêm da tabela `comunicados` (RLS: só síndico e morador aprovado leem).
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [erroComunicados, setErroComunicados] = useState<string>("");

  // Devolve a lista ou null em caso de erro; quem chama decide o que mostrar.
  const carregarComunicados = async (): Promise<Comunicado[] | null> => {
    const { data, error } = await supabase
      .from("comunicados")
      .select(
        "id, tipo, titulo, texto, created_at, comunicados_vistos(user_id)",
      )
      .order("created_at", { ascending: false });
    if (error) return null;
    return (data ?? []).map((c: ComunicadoRow) => ({
      id: c.id,
      tipo: c.tipo,
      titulo: c.titulo,
      texto: c.texto,
      data: formatarDataCurta(chaveData(new Date(c.created_at))),
      vistoPor: (c.comunicados_vistos ?? []).map((v) => v.user_id),
    }));
  };

  const aplicarComunicados = (lista: Comunicado[] | null) => {
    setErroComunicados(
      lista ? "" : "Não foi possível carregar os comunicados.",
    );
    if (lista) setComunicados(lista);
  };
  // Carrega quando há sessão liberada (morador pendente não passa do RLS).
  const uidLogado = session?.user.id;
  const notificacaoPendente =
    typeof Notification !== "undefined" && Notification.permission === "default";

  const habilitarNotificacoes = async () => {
    if (!uidLogado) return;

    const erro = await solicitarPermissaoNotificacao(uidLogado);
    if (erro) mostrarAlerta("Notificações", erro);
  };

  useEffect(() => {
    if (!uidLogado || isPending) return;

    carregarComunicados().then(aplicarComunicados);

    carregarPreferencias(uidLogado);
  }, [uidLogado, isPending]);

  // Eventos/reservas, atas e sugestões vêm do banco (tabelas eventos, atas e sugestoes;
  // RLS: só síndico e morador aprovado leem). Cada lista tem o seu aviso de falha de carga.
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [atas, setAtas] = useState<Ata[]>([]);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [errosCarga, setErrosCarga] = useState<{
    eventos: string;
    atas: string;
    sugestoes: string;
  }>({ eventos: "", atas: "", sugestoes: "" });

  const aplicarEventos = (lista: Evento[] | null) => {
    setErrosCarga((e) => ({
      ...e,
      eventos: lista ? "" : "Não foi possível carregar o calendário.",
    }));
    if (lista) setEventos(lista);
  };
  const aplicarAtas = (lista: Ata[] | null) => {
    setErrosCarga((e) => ({
      ...e,
      atas: lista ? "" : "Não foi possível carregar as atas.",
    }));
    if (lista) setAtas(lista);
  };
  const aplicarSugestoes = (lista: Sugestao[] | null) => {
    setErrosCarga((e) => ({
      ...e,
      sugestoes: lista ? "" : "Não foi possível carregar as sugestões.",
    }));
    if (lista) setSugestoes(lista);
  };

  // Recarrega ao entrar em cada aba, para ver o que os outros moradores fizeram
  // (reservas de outros, sugestões e atas novas).
  useEffect(() => {
    if (!uidLogado || isPending) return;
    if (activeTab === "calendario") carregarEventos().then(aplicarEventos);
    if (activeTab === "atas") {
      carregarAtas().then(aplicarAtas);
      carregarSugestoes().then(aplicarSugestoes);
    }
  }, [uidLogado, isPending, activeTab]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMesAta, setSelectedMesAta] = useState<string | null>(null);
  const [showNovoComunicado, setShowNovoComunicado] = useState<boolean>(false);
  const [showNovaSugestao, setShowNovaSugestao] = useState<boolean>(false);
  const [showAvaliarSugestao, setShowAvaliarSugestao] = useState<number | null>(
    null,
  );
  const [showNovaReserva, setShowNovaReserva] = useState<boolean>(false);
  const [dataReserva, setDataReserva] = useState<Date>(new Date());
  const [novaReserva, setNovaReserva] = useState({
    titulo: "",
    detalhes: "",
    horaInicio: "",
    horaFim: "",
  });

  // Síndico enxerga o histórico; morador só vê de hoje em diante.
  const podeVerPassado = user === "sindico";
  const eventosVisiveis = podeVerPassado
    ? eventos
    : eventos.filter((e) => e.data >= hojeChave);

  // Morador não navega para meses anteriores ao atual (vale também se o perfil mudar).
  const indiceMes = (m: { ano: number; mes: number }) => m.ano * 12 + m.mes;
  const mesAtual = { ano: hoje.getFullYear(), mes: hoje.getMonth() };
  const mesExibido =
    !podeVerPassado && indiceMes(mesVisivel) < indiceMes(mesAtual)
      ? mesAtual
      : mesVisivel;
  const podeVoltarMes =
    podeVerPassado || indiceMes(mesExibido) > indiceMes(mesAtual);

  const mudarMes = (delta: number) => {
    if (delta < 0 && !podeVoltarMes) return;
    animate();
    const indice = indiceMes(mesExibido) + delta;
    setMesVisivel({ ano: Math.floor(indice / 12), mes: indice % 12 });
  };

  const abrirReserva = (chave: string) => {
    setDataReserva(dataDaChave(chave));
    setShowNovaReserva(true);
  };

  // Botão "Reservar": usa hoje se estiver no mês atual, senão o dia 1 do mês exibido.
  const reservarNoMesExibido = () =>
    abrirReserva(
      indiceMes(mesExibido) === indiceMes(mesAtual)
        ? hojeChave
        : chaveDe(mesExibido.ano, mesExibido.mes, 1),
    );

  const aoTocarDia = (chave: string) => {
    if (eventosVisiveis.some((e) => e.data === chave)) setSelectedDate(chave);
    else if (chave >= hojeChave) abrirReserva(chave);
  };

  // --- FUNÇÃO QUE SALVA A RESERVA ---
  const [salvandoReserva, setSalvandoReserva] = useState<boolean>(false);

  const solicitarReserva = async () => {
    if (salvandoReserva) return;
    if (
      !novaReserva.titulo ||
      !novaReserva.horaInicio ||
      !novaReserva.horaFim
    ) {
      return mostrarAlerta("Atenção", "Selecione o espaço e os horários.");
    }

    const chaveReserva = chaveData(dataReserva);
    if (chaveReserva < hojeChave) {
      return mostrarAlerta(
        "Atenção",
        "Não é possível reservar em uma data que já passou.",
      );
    }

    const timeToMins = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };

    const startMins = timeToMins(novaReserva.horaInicio);
    const endMins = timeToMins(novaReserva.horaFim);

    if (startMins >= endMins) {
      return mostrarAlerta(
        "Atenção",
        "A hora final deve ser maior que a hora inicial.",
      );
    }

    if (chaveReserva === hojeChave) {
      const agora = new Date();
      if (startMins <= agora.getHours() * 60 + agora.getMinutes()) {
        return mostrarAlerta(
          "Atenção",
          "A hora inicial de uma reserva para hoje deve ser futura.",
        );
      }
    }

    // Verifica Conflitos
    const temConflito = eventos.some((ev) => {
      if (
        ev.tipo !== "reserva" ||
        ev.data !== chaveReserva ||
        ev.titulo !== novaReserva.titulo
      )
        return false;
      if (ev.horaInicio && ev.horaFim) {
        return (
          startMins < timeToMins(ev.horaFim) &&
          endMins > timeToMins(ev.horaInicio)
        );
      }
      return false;
    });

    if (temConflito) {
      return mostrarAlerta(
        "Indisponível",
        "Este espaço já está reservado para este horário neste dia.",
      );
    }

    // O banco decide: a checagem acima é só um aviso rápido (duas pessoas reservando ao
    // mesmo tempo só são separadas pela constraint de conflito do banco).
    setSalvandoReserva(true);
    const erro = await criarReserva({
      data: chaveReserva,
      espaco: novaReserva.titulo,
      horaInicio: novaReserva.horaInicio,
      horaFim: novaReserva.horaFim,
      detalhes: novaReserva.detalhes,
    });
    // Recarrega de qualquer jeito: em caso de conflito, mostra a reserva que o causou.
    aplicarEventos(await carregarEventos());
    setSalvandoReserva(false);
    if (erro) {
      return mostrarAlerta("Não foi possível reservar", erro);
    }

    // Leva o calendário para o mês da reserva, para o usuário ver o que marcou.
    setMesVisivel({
      ano: dataReserva.getFullYear(),
      mes: dataReserva.getMonth(),
    });
    setShowNovaReserva(false);
    setNovaReserva({ titulo: "", detalhes: "", horaInicio: "", horaFim: "" });
    setDataReserva(new Date());
    mostrarAlerta("Sucesso", "A sua reserva foi efetuada!");
  };

  const [novoCom, setNovoCom] = useState({
    titulo: "",
    texto: "",
    tipo: "AVISO",
  });
  const [novaSugestaoTexto, setNovaSugestaoTexto] = useState<string>("");
  const [motivoArquivamento, setMotivoArquivamento] = useState<string>("");

  // Transição suave para mudanças de estado visual
  const animate = () =>
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

  const changeTab = (tab: string) => {
    animate();
    setActiveTab(tab);
  };

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount === 7) {
      animate();
      setShowAdmin(true);
      mostrarAlerta("Modo Desenvolvedor", "Painel de administração ativado.");
    }
  };

  const marcarComoVisto = async (id: number) => {
    const uid = session?.user.id;
    if (!uid) return;
    const { error } = await supabase
      .from("comunicados_vistos")
      .insert({ comunicado_id: id });
    // 23505 = já estava marcado como visto: o estado local só acompanha.
    if (error && error.code !== "23505") {
      mostrarAlerta("Erro", "Não foi possível marcar como visto.");
      return;
    }
    animate();
    setComunicados((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, vistoPor: [...c.vistoPor, uid] } : c,
      ),
    );
  };

  const [publicandoCom, setPublicandoCom] = useState<boolean>(false);
  // Erro mostrado dentro do modal (mantém o erro visível junto do formulário).
  const [erroNovoCom, setErroNovoCom] = useState<string>("");

  const criarComunicado = async () => {
    if (publicandoCom) return;
    if (!novoCom.titulo.trim() || !novoCom.texto.trim()) {
      setErroNovoCom("Preencha o título e a mensagem.");
      return;
    }
    setPublicandoCom(true);
    setErroNovoCom("");
    const { error } = await supabase.from("comunicados").insert({
      tipo: novoCom.tipo,
      titulo: novoCom.titulo.trim(),
      texto: novoCom.texto.trim(),
    });
    setPublicandoCom(false);
    if (error) {
      setErroNovoCom(`Não foi possível publicar (${error.code ?? "erro"}).`);
      return;
    }
    animate();
    setShowNovoComunicado(false);
    setNovoCom({ tipo: "AVISO", titulo: "", texto: "" });
    aplicarComunicados(await carregarComunicados());
  };

  const [salvandoSugestao, setSalvandoSugestao] = useState<boolean>(false);

  const enviarSugestao = async () => {
    if (salvandoSugestao) return;
    if (!novaSugestaoTexto.trim()) return;
    setSalvandoSugestao(true);
    const erro = await criarSugestao(novaSugestaoTexto);
    if (erro) {
      setSalvandoSugestao(false);
      return mostrarAlerta("Erro", erro);
    }
    aplicarSugestoes(await carregarSugestoes());
    setSalvandoSugestao(false);
    animate();
    setShowNovaSugestao(false);
    setNovaSugestaoTexto("");
  };

  const avaliarSugestao = async (id: number | null, acao: string) => {
    if (id === null || salvandoSugestao) return;
    if (acao !== "aprovada" && acao !== "arquivada") return;
    if (acao === "arquivada" && !motivoArquivamento.trim())
      return mostrarAlerta(
        "Atenção",
        "É obrigatório justificar o arquivamento.",
      );
    setSalvandoSugestao(true);
    const erro = await avaliarSugestaoNoBanco(id, acao, motivoArquivamento);
    if (erro) {
      setSalvandoSugestao(false);
      return mostrarAlerta("Erro", erro);
    }
    aplicarSugestoes(await carregarSugestoes());
    setSalvandoSugestao(false);
    animate();
    setShowAvaliarSugestao(null);
    setMotivoArquivamento("");
  };

  // --- ATAS (só o síndico cadastra) ---
  const [showNovaAta, setShowNovaAta] = useState<boolean>(false);
  const [dataAta, setDataAta] = useState<Date>(new Date());
  const [novaAta, setNovaAta] = useState({ pauta: "", arquivo: "" });
  const [salvandoAta, setSalvandoAta] = useState<boolean>(false);
  // Erro mostrado dentro do modal, junto do formulário.
  const [erroNovaAta, setErroNovaAta] = useState<string>("");

  const salvarAta = async () => {
    if (salvandoAta) return;
    if (!novaAta.pauta.trim() || !novaAta.arquivo.trim()) {
      setErroNovaAta("Informe a pauta e o arquivo (nome ou link do PDF).");
      return;
    }
    setSalvandoAta(true);
    setErroNovaAta("");
    const erro = await criarAta({
      data: chaveData(dataAta),
      pauta: novaAta.pauta,
      arquivo: novaAta.arquivo,
    });
    if (erro) {
      setSalvandoAta(false);
      setErroNovaAta(erro);
      return;
    }
    aplicarAtas(await carregarAtas());
    setSalvandoAta(false);
    animate();
    setShowNovaAta(false);
    setNovaAta({ pauta: "", arquivo: "" });
    setDataAta(new Date());
  };

  // O arquivo da ata é nome ou link. Só http(s) abre (nunca outro esquema, como javascript:).
  const ehLinkAta = (arquivo: string) => /^https?:\/\//i.test(arquivo);
  const abrirLinkAta = (link: string) => {
    if (!ehLinkAta(link)) return;
    Linking.openURL(link).catch(() =>
      mostrarAlerta("Erro", "Não foi possível abrir o arquivo."),
    );
  };

  if (verificandoSessao) {
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

  if (!session) {
    return (
      <Auth
        conferindo={conferindoCondominio}
        erroAcesso={erroAcesso}
        aoLimparErroAcesso={() => setErroAcesso("")}
      />
    );
  }

  //Tela de pendente para moradores aguardando aprovacao do sindico.
  if (isPending) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0f172a",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <MaterialCommunityIcons
          name="clock-time-four-outline"
          size={64}
          color="#6366f1"
          style={{ marginBottom: 20 }}
        />
        <Text
          style={{
            fontSize: 24,
            fontWeight: "bold",
            color: "#f8fafc",
            marginBottom: 12,
          }}
        >
          Cadastro em Análise
        </Text>
        <Text
          style={{
            fontSize: 16,
            color: "#94a3b8",
            textAlign: "center",
            marginBottom: 32,
          }}
        >
          O seu cadastro foi recebido com sucesso! O síndico irá verificar a sua
          unidade e libertar o seu acesso em breve.
        </Text>
        <TouchableOpacity
          style={{
            backgroundColor: "#1e293b",
            padding: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#334155",
            width: "100%",
            alignItems: "center",
          }}
          onPress={() => supabase.auth.signOut()}
        >
          <Text style={{ color: "#f8fafc", fontWeight: "bold" }}>
            Voltar para o Login
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- TEMAS CORES ---
  const theme = isDark
    ? {
        bg: "#0F172A",
        card: "#1E293B",
        text: "#F8FAFC",
        textMuted: "#94A3B8",
        border: "#334155",
        primary: ["#6366F1", "#8B5CF6"],
        success: "#10B981",
        danger: "#EF4444",
        warning: "#F59E0B",
      }
    : {
        bg: "#F8FAFC",
        card: "#FFFFFF",
        text: "#0F172A",
        textMuted: "#64748B",
        border: "#E2E8F0",
        primary: ["#4F46E5", "#7C3AED"],
        success: "#059669",
        danger: "#DC2626",
        warning: "#D97706",
      };

  // --- GRADE DO CALENDÁRIO (mês exibido) ---
  const totalDiasMes = diasNoMes(mesExibido.ano, mesExibido.mes);
  const deslocamentoMes = new Date(mesExibido.ano, mesExibido.mes, 1).getDay();
  const totalCelulas = Math.ceil((deslocamentoMes + totalDiasMes) / 7) * 7;
  const larguraGrade = Math.min(larguraTela, larguraApp) - paddingLateral * 2;
  const alturaCelula = Math.min(
    84,
    Math.max(44, Math.round((larguraGrade / 7) * 0.95)),
  );

  // Sem perfil resolvido não há o que mostrar (nega por padrão).
  if (!user) return null;

  // --- TELA PRINCIPAL ---
  return (
    // 1. Fundo ocupa a tela toda (sem bordas laterais em iPad/PC): comportamento de app
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.bg }}
    >
      {/* 2. Contentor em tela cheia; só o conteúdo é limitado e centralizado */}
      <View
        style={{
          flex: 1,
          width: "100%",
          backgroundColor: theme.bg,
          position: "relative", // Mantém o menu inferior preso a esta área
        }}
      >
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

        {/* HEADER GLOBAL (Agora com a logo da Coruja) */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.bg,
              paddingHorizontal: paddingLateral,
              width: "100%",
              maxWidth: larguraApp,
              alignSelf: "center",
            },
          ]}
        >
          <TouchableOpacity
            onPress={handleTitleClick}
            activeOpacity={1}
            style={styles.row}
          >
            <Image
              source={require("../../assets/images/altadef1024.png")}
              style={{ width: 36, height: 36 }}
              resizeMode="contain"
            />
            <Text
              style={[styles.headerTitle, { color: theme.text, marginLeft: 8 }]}
            >
              Condo<Text style={{ color: "#818cf8" }}>Owl</Text>
            </Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => {
                animate();
                setIsDark(!isDark);
              }}
              style={styles.iconBtn}
            >
              <Feather
                name={isDark ? "sun" : "moon"}
                size={22}
                color={theme.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                animate();
                await supabase.auth.signOut();
              }}
              style={styles.iconBtn}
            >
              <Feather name="log-out" size={22} color={theme.danger} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={[
            styles.contentContainer,
            { paddingHorizontal: paddingLateral },
          ]}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: 110 + insets.bottom,
            width: "100%",
            maxWidth: larguraApp,
            alignSelf: "center",
          }}
        >
          {/* === ABA: FEED === */}
          {activeTab === "feed" && (
            <View>
              <View style={styles.pageHeader}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text
                    style={{
                      fontSize: 18,
                      color: theme.textMuted,
                      marginBottom: 4,
                    }}
                  >
                    Olá, {nomeUsuario}!
                  </Text>
                  <Text style={[styles.pageTitle, { color: theme.text }]}>
                    Mural de Avisos
                  </Text>
                </View>
                {user === "sindico" && (
                  <TouchableOpacity
                    onPress={() => {
                      setErroNovoCom("");
                      setShowNovoComunicado(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={theme.primary as [string, string]}
                      start={{ x: 0, y: 0 }}
                      style={styles.btnSmallGradient}
                    >
                      <Feather name="plus" size={16} color="#FFF" />
                      <Text style={styles.btnTextSmall}>Novo</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>

              {notificacaoPendente && (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.primary[0],
                      padding: 16,
                      marginBottom: 16,
                    },
                  ]}
                >
                  <Text style={{ color: theme.text, fontWeight: "bold" }}>
                    Quer receber avisos neste PWA?
                  </Text>
                  <Text
                    style={{
                      color: theme.textMuted,
                      marginTop: 6,
                      marginBottom: 12,
                      lineHeight: 20,
                    }}
                  >
                    Toque abaixo para permitir notificações neste aparelho. No
                    iPhone ou iPad, abra o PWA pelo ícone adicionado à Tela de
                    Início.
                  </Text>
                  <TouchableOpacity
                    onPress={() => void habilitarNotificacoes()}
                    style={{
                      alignSelf: "flex-start",
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      backgroundColor: theme.primary[0],
                    }}
                  >
                    <Text style={{ color: "#FFF", fontWeight: "bold" }}>
                      Ativar notificações
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {erroComunicados !== "" && (
                <Text style={{ color: "#ef4444", marginBottom: 12 }}>
                  {erroComunicados}
                </Text>
              )}
              {erroComunicados === "" && comunicados.length === 0 && (
                <Text style={{ color: theme.textMuted, marginBottom: 12 }}>
                  Nenhum comunicado publicado ainda.
                </Text>
              )}

              {comunicados.map((c) => {
                const visto = c.vistoPor.includes(session?.user.id ?? "");
                return (
                  <View
                    key={c.id}
                    style={[
                      styles.card,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                        opacity: visto ? 0.6 : 1,
                        shadowColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.rowBetween}>
                      <View
                        style={[
                          styles.tag,
                          { backgroundColor: theme.primary[0] + "1A" },
                        ]}
                      >
                        <Ionicons
                          name={
                            c.tipo.toUpperCase() === "REUNIÃO"
                              ? "people-outline"
                              : "alert-circle-outline"
                          }
                          size={14}
                          color={theme.primary[0]}
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          style={{
                            color: theme.primary[0],
                            fontSize: 12,
                            fontWeight: "700",
                            textTransform: "uppercase",
                          }}
                        >
                          {c.tipo}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: theme.textMuted,
                          fontSize: 12,
                          fontWeight: "500",
                        }}
                      >
                        {c.data}
                      </Text>
                    </View>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>
                      {c.titulo}
                    </Text>
                    <Text style={[styles.cardText, { color: theme.textMuted }]}>
                      {c.texto}
                    </Text>

                    {!visto && (
                      <TouchableOpacity
                        style={[
                          styles.btnOutline,
                          {
                            borderColor: theme.border,
                            marginTop: 16,
                            backgroundColor: theme.bg,
                          },
                        ]}
                        onPress={() => marcarComoVisto(c.id)}
                      >
                        <Feather
                          name="check-circle"
                          size={18}
                          color={theme.success}
                          style={{ marginRight: 8 }}
                        />
                        <Text
                          style={{ color: theme.success, fontWeight: "700" }}
                        >
                          Marcar como Visto
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* === ABA: CALENDÁRIO === */}
          {activeTab === "calendario" && (
            <View>
              {errosCarga.eventos !== "" && (
                <Text style={{ color: theme.danger, marginBottom: 12 }}>
                  {errosCarga.eventos}
                </Text>
              )}
              <View style={styles.pageHeader}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[styles.pageTitle, { color: theme.text }]}>
                    Agenda
                  </Text>
                  <View style={[styles.row, { marginTop: 4 }]}>
                    <TouchableOpacity
                      onPress={() => mudarMes(-1)}
                      disabled={!podeVoltarMes}
                      accessibilityRole="button"
                      accessibilityLabel="Mês anterior"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[
                        styles.mesBtn,
                        !podeVoltarMes && { opacity: 0.3 },
                      ]}
                    >
                      <Feather
                        name="chevron-left"
                        size={22}
                        color={theme.primary[0]}
                      />
                    </TouchableOpacity>
                    <Text
                      style={{
                        color: theme.primary[0],
                        fontWeight: "bold",
                        fontSize: 16,
                        minWidth: compacto ? 118 : 140,
                        textAlign: "center",
                      }}
                    >
                      {MESES[mesExibido.mes]} {mesExibido.ano}
                    </Text>
                    <TouchableOpacity
                      onPress={() => mudarMes(1)}
                      accessibilityRole="button"
                      accessibilityLabel="Próximo mês"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.mesBtn}
                    >
                      <Feather
                        name="chevron-right"
                        size={22}
                        color={theme.primary[0]}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
                {(user === "morador" || user === "sindico") && (
                  <TouchableOpacity
                    onPress={reservarNoMesExibido}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={theme.primary as [string, string]}
                      start={{ x: 0, y: 0 }}
                      style={styles.btnSmallGradient}
                    >
                      <Feather name="calendar" size={16} color="#FFF" />
                      <Text style={styles.btnTextSmall}>Reservar</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>

              <View
                style={[
                  styles.calendarContainer,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    shadowColor: theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.calendarWeekRow,
                    {
                      borderBottomColor: theme.border,
                      backgroundColor: theme.bg,
                    },
                  ]}
                >
                  {DIAS_SEMANA.map((d, i) => (
                    <Text
                      key={i}
                      style={[
                        styles.weekDayText,
                        { color: theme.textMuted },
                        compacto && { fontSize: 10 },
                      ]}
                    >
                      {d}
                    </Text>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {Array.from({ length: totalCelulas }).map((_, i) => {
                    const dia = i - deslocamentoMes + 1;
                    const celulaBase = [
                      styles.dayBox,
                      {
                        height: alturaCelula,
                        borderBottomColor: theme.border,
                        borderRightColor: theme.border,
                      },
                    ];

                    // Células vazias antes do dia 1 e depois do último dia
                    if (dia < 1 || dia > totalDiasMes) {
                      return <View key={`vazio-${i}`} style={celulaBase} />;
                    }

                    const chave = chaveDe(mesExibido.ano, mesExibido.mes, dia);
                    const eventoDoDia = eventosVisiveis.some(
                      (e) => e.data === chave,
                    );
                    const passado = chave < hojeChave;
                    const ehHoje = chave === hojeChave;
                    return (
                      <TouchableOpacity
                        key={chave}
                        style={[
                          ...celulaBase,
                          eventoDoDia && {
                            backgroundColor: theme.primary[0] + "10",
                          },
                          passado && { opacity: 0.5 },
                        ]}
                        onPress={() => aoTocarDia(chave)}
                        activeOpacity={0.6}
                        accessibilityRole="button"
                        accessibilityLabel={`${formatarDataLonga(chave)}${eventoDoDia ? ", com evento" : ""}`}
                      >
                        <View
                          style={[
                            styles.dayNumber,
                            ehHoje && { backgroundColor: theme.primary[0] },
                          ]}
                        >
                          <Text
                            style={{
                              color: ehHoje
                                ? "#FFF"
                                : eventoDoDia
                                  ? theme.primary[0]
                                  : theme.text,
                              fontWeight:
                                eventoDoDia || ehHoje ? "bold" : "500",
                              fontSize: 15,
                            }}
                          >
                            {dia}
                          </Text>
                        </View>
                        {eventoDoDia && (
                          <View
                            style={[
                              styles.eventDot,
                              {
                                backgroundColor: passado
                                  ? theme.textMuted
                                  : theme.primary[0],
                              },
                            ]}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {podeVerPassado && (
                <Text
                  style={{
                    color: theme.textMuted,
                    fontSize: 12,
                    marginTop: 12,
                    textAlign: "center",
                  }}
                >
                  Como síndico, você também vê meses e eventos passados.
                </Text>
              )}
            </View>
          )}

          {/* === ABA: ATAS E SUGESTÕES === */}
          {activeTab === "atas" && (
            <View>
              <View style={styles.pageHeader}>
                <Text style={[styles.pageTitle, { color: theme.text }]}>
                  Biblioteca de Atas
                </Text>
                {user === "sindico" && (
                  <TouchableOpacity
                    onPress={() => {
                      setErroNovaAta("");
                      setShowNovaAta(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={theme.primary as [string, string]}
                      start={{ x: 0, y: 0 }}
                      style={styles.btnSmallGradient}
                    >
                      <Feather name="plus" size={16} color="#FFF" />
                      <Text style={styles.btnTextSmall}>Nova ata</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
              {errosCarga.atas !== "" && (
                <Text style={{ color: theme.danger, marginBottom: 12 }}>
                  {errosCarga.atas}
                </Text>
              )}
              {errosCarga.atas === "" && atas.length === 0 && (
                <Text style={{ color: theme.textMuted, marginBottom: 12 }}>
                  Nenhuma ata cadastrada ainda.
                </Text>
              )}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -20, paddingHorizontal: 20 }}
              >
                {atas.map((ata, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.book,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                        shadowColor: theme.border,
                      },
                    ]}
                    onPress={() => setSelectedMesAta(ata.mes)}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={theme.primary as [string, string]}
                      style={styles.bookBinding}
                    />
                    <Ionicons
                      name="journal-outline"
                      size={32}
                      color={theme.textMuted}
                      style={{ marginBottom: 12, marginLeft: 15 }}
                    />
                    <Text
                      style={[
                        styles.bookTitle,
                        { color: theme.text, marginLeft: 15 },
                      ]}
                    >
                      {ata.mes}
                    </Text>
                    <Text
                      style={[
                        styles.bookSubtitle,
                        { color: theme.textMuted, marginLeft: 15 },
                      ]}
                    >
                      {ata.reunioes.length} Reuniões
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View
                style={[styles.divider, { backgroundColor: theme.border }]}
              />

              <View style={styles.pageHeader}>
                <Text style={[styles.pageTitle, { color: theme.text }]}>
                  Caixa de Sugestões
                </Text>
                {user === "morador" && (
                  <TouchableOpacity
                    onPress={() => setShowNovaSugestao(true)}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={theme.primary as [string, string]}
                      start={{ x: 0, y: 0 }}
                      style={styles.btnSmallGradient}
                    >
                      <Feather name="plus" size={16} color="#FFF" />
                      <Text style={styles.btnTextSmall}>Sugerir</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>

              {errosCarga.sugestoes !== "" && (
                <Text style={{ color: theme.danger, marginBottom: 12 }}>
                  {errosCarga.sugestoes}
                </Text>
              )}
              {errosCarga.sugestoes === "" && sugestoes.length === 0 && (
                <Text style={{ color: theme.textMuted, marginBottom: 12 }}>
                  Nenhuma sugestão enviada ainda.
                </Text>
              )}
              {sugestoes.map((s) => (
                <View
                  key={s.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      shadowColor: theme.border,
                    },
                  ]}
                >
                  <View style={styles.rowBetween}>
                    <View
                      style={[
                        styles.tag,
                        {
                          backgroundColor:
                            s.status === "aprovada"
                              ? theme.success + "1A"
                              : s.status === "arquivada"
                                ? theme.danger + "1A"
                                : theme.warning + "1A",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color:
                            s.status === "aprovada"
                              ? theme.success
                              : s.status === "arquivada"
                                ? theme.danger
                                : theme.warning,
                          fontWeight: "800",
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        {s.status}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 16,
                      marginTop: 12,
                      lineHeight: 24,
                    }}
                  >
                    {s.texto}
                  </Text>

                  {s.status === "arquivada" && s.motivo !== "" && (
                    <View
                      style={[
                        styles.motivoBox,
                        {
                          backgroundColor: theme.bg,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <View style={styles.row}>
                        <Feather
                          name="info"
                          size={14}
                          color={theme.danger}
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={{
                            color: theme.danger,
                            fontSize: 13,
                            fontWeight: "700",
                          }}
                        >
                          Motivo do Arquivamento:
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: theme.text,
                          fontSize: 14,
                          marginTop: 6,
                          lineHeight: 20,
                        }}
                      >
                        {s.motivo}
                      </Text>
                    </View>
                  )}

                  {user === "sindico" && s.status === "pendente" && (
                    <View style={[styles.row, { marginTop: 16 }]}>
                      <TouchableOpacity
                        style={[
                          styles.btnOutline,
                          {
                            borderColor: theme.success,
                            flex: 1,
                            marginRight: 6,
                            backgroundColor: theme.success + "10",
                          },
                        ]}
                        onPress={() => avaliarSugestao(s.id, "aprovada")}
                      >
                        <Text
                          style={{ color: theme.success, fontWeight: "700" }}
                        >
                          Aprovar
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.btnOutline,
                          {
                            borderColor: theme.danger,
                            flex: 1,
                            marginLeft: 6,
                            backgroundColor: theme.danger + "10",
                          },
                        ]}
                        onPress={() => setShowAvaliarSugestao(s.id)}
                      >
                        <Text
                          style={{ color: theme.danger, fontWeight: "700" }}
                        >
                          Arquivar
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
          {/* === ECRÃ DE APROVAÇÕES (Apenas Síndico) === */}
          {/* Fica dentro do mesmo ScrollView para rolar em telas pequenas */}
          {activeTab === "aprovacoes" && user === "sindico" && (
            <View style={{ paddingTop: 10 }}>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "bold",
                  color: theme.text,
                  marginBottom: 20,
                }}
              >
                Aprovar Moradores
              </Text>

              {erroPendentes !== "" && (
                <Text style={{ color: theme.danger, marginBottom: 12 }}>
                  {erroPendentes}
                </Text>
              )}

              {moradoresPendentes.length === 0 ? (
                <Text
                  style={{
                    color: theme.textMuted,
                    textAlign: "center",
                    marginTop: 20,
                  }}
                >
                  Nenhum morador a aguardar aprovação.
                </Text>
              ) : (
                moradoresPendentes.map((morador) => (
                  <View
                    key={morador.id}
                    style={[
                      styles.card,
                      {
                        backgroundColor: theme.card,
                        borderColor: theme.border,
                        marginBottom: 12,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: theme.text,
                        fontWeight: "bold",
                        fontSize: 18,
                        marginBottom: 4,
                      }}
                    >
                      {morador.nome_completo || "Nome não informado"}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMuted,
                        fontSize: 14,
                        marginBottom: 2,
                      }}
                    >
                      E-mail: {morador.email}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMuted,
                        fontSize: 14,
                        marginBottom: 2,
                      }}
                    >
                      Nascimento: {morador.data_nascimento || "Não informada"}
                    </Text>

                    <Text
                      style={{
                        color: theme.textMuted,
                        fontSize: 14,
                        marginBottom: 16,
                      }}
                    >
                      Unidade: {morador.unidade}
                    </Text>

                    <TouchableOpacity
                      style={{
                        backgroundColor: theme.success,
                        width: "100%",
                        alignItems: "center",
                        padding: 12,
                        borderRadius: 8,
                      }}
                      onPress={() => aprovarMorador(morador.id)}
                    >
                      <Text style={{ color: "#fff", fontWeight: "bold" }}>
                        Aprovar Acesso
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}
          {/* === ABA: CONFIGURAÇÕES === */}
          {activeTab === "configuracoes" && (
            <View
              style={{
                flex: 1,
                paddingTop: 20,
                paddingBottom: 100,
                paddingHorizontal: 4,
              }}
            >
              <Text
                style={[
                  styles.pageTitle,
                  { color: theme.text, marginBottom: 20 },
                ]}
              >
                Configurações
              </Text>

              <Text
                style={{
                  color: theme.textMuted,
                  fontSize: 14,
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  marginBottom: 12,
                  marginLeft: 4,
                }}
              >
                Notificações Push
              </Text>

              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    padding: 16,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.textMuted,
                    fontSize: 13,
                    marginBottom: 16,
                    lineHeight: 20,
                  }}
                >
                  Escolha os tipos de comunicados opcionais. Ative as
                  notificações neste aparelho para receber avisos push. Avisos
                  urgentes e de reuniões são sempre enviados.
                </Text>

                <TouchableOpacity
                  onPress={() => void habilitarNotificacoes()}
                  style={{
                    alignSelf: "flex-start",
                    marginBottom: 16,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    backgroundColor: theme.primary[0],
                  }}
                >
                  <Text style={{ color: "#FFF", fontWeight: "bold" }}>
                    Ativar notificações neste aparelho
                  </Text>
                </TouchableOpacity>

                {/* Switch Manutenção */}
                <View
                  style={[
                    styles.rowBetween,
                    {
                      marginBottom: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.border,
                      paddingBottom: 16,
                    },
                  ]}
                >
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.tag,
                        {
                          backgroundColor: theme.warning + "1A",
                          marginRight: 12,
                        },
                      ]}
                    >
                      <Ionicons
                        name="build-outline"
                        size={16}
                        color={theme.warning}
                      />
                    </View>
                    <View>
                      <Text
                        style={{
                          color: theme.text,
                          fontSize: 16,
                          fontWeight: "bold",
                        }}
                      >
                        Manutenção
                      </Text>
                      <Text
                        style={{
                          color: theme.textMuted,
                          fontSize: 12,
                          marginTop: 2,
                        }}
                      >
                        Obras, limpeza e reparações
                      </Text>
                    </View>
                  </View>
                  <Switch
                    trackColor={{
                      false: theme.border,
                      true: theme.primary[0],
                    }}
                    thumbColor={"#FFF"}
                    onValueChange={(valor) =>
                      alternarPreferencia("manutencao", valor)
                    }
                    value={prefsNotificacoes.manutencao}
                  />
                </View>

                {/* Switch Social */}
                <View style={styles.rowBetween}>
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.tag,
                        {
                          backgroundColor: theme.success + "1A",
                          marginRight: 12,
                        },
                      ]}
                    >
                      <Ionicons
                        name="cafe-outline"
                        size={16}
                        color={theme.success}
                      />
                    </View>
                    <View>
                      <Text
                        style={{
                          color: theme.text,
                          fontSize: 16,
                          fontWeight: "bold",
                        }}
                      >
                        Social
                      </Text>
                      <Text
                        style={{
                          color: theme.textMuted,
                          fontSize: 12,
                          marginTop: 2,
                        }}
                      >
                        Eventos e confraternizações
                      </Text>
                    </View>
                  </View>
                  <Switch
                    trackColor={{
                      false: theme.border,
                      true: theme.primary[0],
                    }}
                    thumbColor={"#FFF"}
                    onValueChange={(valor) =>
                      alternarPreferencia("social", valor)
                    }
                    value={prefsNotificacoes.social}
                  />
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* === BOTTOM TAB BAR (FLOATING & BLURRED) === */}
        <View
          style={[
            styles.floatingTabBarContainer,
            {
              bottom: insets.bottom + 12,
              left: compacto ? 12 : 20,
              right: compacto ? 12 : 20,
              alignItems: "center",
            },
          ]}
          pointerEvents="box-none"
        >
          <BlurView
            intensity={isDark ? 30 : 80}
            tint={isDark ? "dark" : "light"}
            style={[
              styles.tabBar,
              { borderColor: theme.border, width: "100%", maxWidth: 560 },
            ]}
          >
            {(
              [
                { id: "feed", icon: "home", label: "Mural" },
                { id: "calendario", icon: "calendar", label: "Agenda" },
                { id: "atas", icon: "book-open", label: "Atas" },
                ...(user === "sindico"
                  ? [{ id: "aprovacoes", icon: "user-check", label: "Aprovar" }]
                  : []),
                { id: "configuracoes", icon: "sliders", label: "Ajustes" },
              ] as {
                id: string;
                icon: keyof typeof Feather.glyphMap;
                label: string;
              }[]
            ).map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={styles.tabItem}
                onPress={() => changeTab(tab.id)}
              >
                <Feather
                  name={tab.icon}
                  size={24}
                  color={
                    activeTab === tab.id ? theme.primary[0] : theme.textMuted
                  }
                />
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color:
                        activeTab === tab.id
                          ? theme.primary[0]
                          : theme.textMuted,
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
            {showAdmin && (
              <TouchableOpacity
                style={styles.tabItem}
                onPress={() => changeTab("admin")}
              >
                <Feather
                  name="settings"
                  size={24}
                  color={activeTab === "admin" ? theme.danger : theme.textMuted}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color:
                        activeTab === "admin" ? theme.danger : theme.textMuted,
                    },
                  ]}
                >
                  Admin
                </Text>
              </TouchableOpacity>
            )}
          </BlurView>
        </View>

        {/* ========================================== */}
        {/* MODAIS COM BLUR (GLASSMORPHISM) E ALERTA GLOBAL */}
        {/* ========================================== */}
        <Modal
          transparent={true}
          visible={alerta.visivel}
          animationType="fade"
          onRequestClose={() =>
            setAlerta((prev) => ({ ...prev, visivel: false }))
          }
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalCaixa,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <MaterialCommunityIcons
                name={
                  alerta.titulo.toLowerCase().includes("sucesso")
                    ? "check-circle-outline"
                    : "alert-circle-outline"
                }
                size={56}
                color={
                  alerta.titulo.toLowerCase().includes("sucesso")
                    ? theme.success
                    : theme.primary[0]
                }
                style={{ marginBottom: 16 }}
              />

              <Text style={[styles.modalTitulo, { color: theme.text }]}>
                {alerta.titulo}
              </Text>

              <Text style={[styles.modalMensagem, { color: theme.textMuted }]}>
                {alerta.mensagem}
              </Text>

              <TouchableOpacity
                style={[
                  styles.modalBotao,
                  { backgroundColor: theme.primary[0] },
                ]}
                onPress={() =>
                  setAlerta((prev) => ({ ...prev, visivel: false }))
                }
              >
                <Text style={styles.modalBotaoTexto}>Entendi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Modal: Detalhes do Calendário */}
        <Modal
          visible={!!selectedDate}
          transparent
          animationType="fade"
          supportedOrientations={ORIENTACOES}
          onRequestClose={() => setSelectedDate(null)}
        >
          <ModalOverlay>
            <View
              style={[
                styles.modalContent,
                { backgroundColor: theme.card, shadowColor: "#000" },
              ]}
            >
              <Text
                style={[
                  styles.pageTitle,
                  {
                    color: theme.text,
                    textAlign: "center",
                    marginBottom: 20,
                  },
                ]}
              >
                {selectedDate ? formatarDataLonga(selectedDate) : ""}
              </Text>
              {eventosVisiveis
                .filter((e) => e.data === selectedDate)
                .map((e, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.eventDetailBox,
                      {
                        backgroundColor: theme.bg,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.row}>
                      <Ionicons
                        name="calendar-clear"
                        size={18}
                        color={theme.primary[0]}
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        style={{
                          color: theme.primary[0],
                          fontWeight: "800",
                          fontSize: 16,
                        }}
                      >
                        {e.titulo}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: theme.text,
                        marginTop: 8,
                        fontSize: 15,
                        lineHeight: 22,
                      }}
                    >
                      {e.detalhes}
                    </Text>
                  </View>
                ))}
              {selectedDate && selectedDate >= hojeChave && (
                <TouchableOpacity
                  style={[
                    styles.btnOutline,
                    {
                      borderColor: theme.primary[0],
                      marginTop: 24,
                      backgroundColor: theme.primary[0] + "10",
                    },
                  ]}
                  onPress={() => {
                    const chave = selectedDate;
                    setSelectedDate(null);
                    abrirReserva(chave);
                  }}
                >
                  <Text style={{ color: theme.primary[0], fontWeight: "700" }}>
                    Reservar neste dia
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.btnOutline,
                  {
                    borderColor: theme.border,
                    marginTop:
                      selectedDate && selectedDate >= hojeChave ? 12 : 24,
                    backgroundColor: theme.bg,
                  },
                ]}
                onPress={() => setSelectedDate(null)}
              >
                <Text style={{ color: theme.text, fontWeight: "700" }}>
                  Fechar
                </Text>
              </TouchableOpacity>
            </View>
          </ModalOverlay>
        </Modal>

        {/* Modal: Nova Sugestão */}
        <Modal
          visible={showNovaSugestao}
          transparent
          animationType="slide"
          supportedOrientations={ORIENTACOES}
          onRequestClose={() => setShowNovaSugestao(false)}
        >
          <ModalOverlay>
            <View
              style={[styles.modalContent, { backgroundColor: theme.card }]}
            >
              <Text
                style={[
                  styles.pageTitle,
                  { color: theme.text, marginBottom: 10 },
                ]}
              >
                Sugerir Pauta
              </Text>
              <Text
                style={{
                  color: theme.textMuted,
                  marginBottom: 20,
                  fontSize: 14,
                }}
              >
                Sua sugestão será enviada para avaliação e poderá virar pauta na
                próxima reunião.
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.bg,
                    height: 120,
                    textAlignVertical: "top",
                  },
                ]}
                placeholder="Descreva sua sugestão..."
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={LIMITE.sugestao}
                value={novaSugestaoTexto}
                onChangeText={setNovaSugestaoTexto}
              />
              <View style={styles.row}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    marginRight: 6,
                    opacity: salvandoSugestao ? 0.6 : 1,
                  }}
                  disabled={salvandoSugestao}
                  onPress={enviarSugestao}
                >
                  <LinearGradient
                    colors={theme.primary as [string, string]}
                    style={styles.btnGradient}
                  >
                    <Text style={styles.btnText}>
                      {salvandoSugestao ? "Enviando..." : "Enviar"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.btnOutline,
                    { borderColor: theme.border, flex: 1, marginLeft: 6 },
                  ]}
                  onPress={() => setShowNovaSugestao(false)}
                >
                  <Text style={{ color: theme.text, fontWeight: "700" }}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ModalOverlay>
        </Modal>
        {/* Modal: Novo Comunicado */}
        <Modal
          visible={showNovoComunicado}
          transparent
          animationType="slide"
          supportedOrientations={ORIENTACOES}
          onRequestClose={() => setShowNovoComunicado(false)}
        >
          <ModalOverlay>
            <View
              style={[styles.modalContent, { backgroundColor: theme.card }]}
            >
              <Text
                style={[
                  styles.pageTitle,
                  { color: theme.text, marginBottom: 15 },
                ]}
              >
                Novo Comunicado
              </Text>

              {/* NOVO: Seleção de Categoria */}
              <Text
                style={{
                  color: theme.text,
                  fontSize: 12,
                  marginBottom: 6,
                  fontWeight: "600",
                }}
              >
                Categoria
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 15,
                }}
              >
                {["AVISO", "REUNIÃO", "MANUTENÇÃO", "SOCIAL"].map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setNovoCom({ ...novoCom, tipo: cat })}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 20,
                      backgroundColor:
                        novoCom.tipo === cat ? theme.primary[0] : theme.bg,
                      borderWidth: 1,
                      borderColor:
                        novoCom.tipo === cat ? theme.primary[0] : theme.border,
                    }}
                  >
                    <Text
                      style={{
                        color: novoCom.tipo === cat ? "#FFF" : theme.text,
                        fontSize: 12,
                        fontWeight: "bold",
                      }}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.bg,
                  },
                ]}
                placeholder="Título do Comunicado"
                placeholderTextColor={theme.textMuted}
                value={novoCom.titulo}
                onChangeText={(t) => setNovoCom({ ...novoCom, titulo: t })}
              />
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.bg,
                    height: 100,
                    textAlignVertical: "top",
                  },
                ]}
                placeholder="Digite a mensagem completa..."
                placeholderTextColor={theme.textMuted}
                multiline
                value={novoCom.texto}
                onChangeText={(t) => setNovoCom({ ...novoCom, texto: t })}
              />

              {erroNovoCom !== "" && (
                <Text style={{ color: "#ef4444", marginBottom: 10 }}>
                  {erroNovoCom}
                </Text>
              )}

              <View style={styles.row}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    marginRight: 6,
                    opacity: publicandoCom ? 0.6 : 1,
                  }}
                  disabled={publicandoCom}
                  onPress={criarComunicado}
                >
                  <LinearGradient
                    colors={theme.primary as [string, string]}
                    style={styles.btnGradient}
                  >
                    <Text style={styles.btnText}>
                      {publicandoCom ? "Publicando..." : "Publicar"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.btnOutline,
                    { borderColor: theme.border, flex: 1, marginLeft: 6 },
                  ]}
                  onPress={() => setShowNovoComunicado(false)}
                >
                  <Text style={{ color: theme.text, fontWeight: "700" }}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ModalOverlay>
        </Modal>

        {/* Modal: Nova Ata (síndico) */}
        <Modal
          visible={showNovaAta}
          transparent
          animationType="slide"
          supportedOrientations={ORIENTACOES}
          onRequestClose={() => setShowNovaAta(false)}
        >
          <ModalOverlay>
            <View
              style={[styles.modalContent, { backgroundColor: theme.card }]}
            >
              <Text
                style={[
                  styles.pageTitle,
                  { color: theme.text, marginBottom: 15 },
                ]}
              >
                Nova Ata
              </Text>

              <Text
                style={{
                  color: theme.text,
                  fontSize: 12,
                  marginBottom: 4,
                  fontWeight: "600",
                }}
              >
                Data da reunião
              </Text>
              <DateTimeField
                mode="date"
                label="Data da reunião"
                value={dataAta}
                onChange={setDataAta}
                isDark={isDark}
                colors={theme}
              />

              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.bg,
                  },
                ]}
                placeholder="Pauta da reunião"
                placeholderTextColor={theme.textMuted}
                maxLength={LIMITE.pauta}
                value={novaAta.pauta}
                onChangeText={(t) => setNovaAta({ ...novaAta, pauta: t })}
              />
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.bg,
                  },
                ]}
                placeholder="Arquivo (nome ou link do PDF)"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={LIMITE.arquivo}
                value={novaAta.arquivo}
                onChangeText={(t) => setNovaAta({ ...novaAta, arquivo: t })}
              />

              {erroNovaAta !== "" && (
                <Text style={{ color: "#ef4444", marginBottom: 10 }}>
                  {erroNovaAta}
                </Text>
              )}

              <View style={styles.row}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    marginRight: 6,
                    opacity: salvandoAta ? 0.6 : 1,
                  }}
                  disabled={salvandoAta}
                  onPress={salvarAta}
                >
                  <LinearGradient
                    colors={theme.primary as [string, string]}
                    style={styles.btnGradient}
                  >
                    <Text style={styles.btnText}>
                      {salvandoAta ? "Salvando..." : "Salvar"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.btnOutline,
                    { borderColor: theme.border, flex: 1, marginLeft: 6 },
                  ]}
                  onPress={() => setShowNovaAta(false)}
                >
                  <Text style={{ color: theme.text, fontWeight: "700" }}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ModalOverlay>
        </Modal>

        {/* Modal: Ler Atas */}
        <Modal
          visible={!!selectedMesAta}
          transparent
          animationType="fade"
          supportedOrientations={ORIENTACOES}
          onRequestClose={() => setSelectedMesAta(null)}
        >
          <ModalOverlay>
            <View
              style={[styles.modalContent, { backgroundColor: theme.card }]}
            >
              <Text
                style={[
                  styles.pageTitle,
                  { color: theme.text, marginBottom: 20 },
                ]}
              >
                Atas: {selectedMesAta}
              </Text>
              {atas
                .find((a) => a.mes === selectedMesAta)
                ?.reunioes.map((r, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.eventDetailBox,
                      {
                        backgroundColor: theme.bg,
                        borderColor: theme.border,
                        marginBottom: 10,
                        marginTop: 0,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: theme.text,
                        fontWeight: "800",
                        fontSize: 16,
                      }}
                    >
                      {r.data}
                    </Text>
                    <Text
                      style={{
                        color: theme.textMuted,
                        marginTop: 4,
                        marginBottom: 12,
                      }}
                    >
                      Pauta: {r.pauta}
                    </Text>
                    {ehLinkAta(r.link) ? (
                      <TouchableOpacity
                        onPress={() => abrirLinkAta(r.link)}
                        style={[
                          styles.btnOutline,
                          {
                            borderColor: theme.primary[0],
                            padding: 10,
                            backgroundColor: theme.primary[0] + "10",
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: theme.primary[0],
                            fontWeight: "700",
                            textAlign: "center",
                          }}
                        >
                          Abrir PDF
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      // Sem link (só o nome do arquivo): não há o que abrir.
                      <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                        Arquivo: {r.link}
                      </Text>
                    )}
                  </View>
                ))}
              <TouchableOpacity
                style={[
                  styles.btnOutline,
                  {
                    borderColor: theme.border,
                    marginTop: 14,
                    backgroundColor: theme.bg,
                  },
                ]}
                onPress={() => setSelectedMesAta(null)}
              >
                <Text style={{ color: theme.text, fontWeight: "700" }}>
                  Fechar
                </Text>
              </TouchableOpacity>
            </View>
          </ModalOverlay>
        </Modal>

        {/* Modal: Motivo Arquivamento */}
        <Modal
          visible={!!showAvaliarSugestao}
          transparent
          animationType="fade"
          supportedOrientations={ORIENTACOES}
          onRequestClose={() => setShowAvaliarSugestao(null)}
        >
          <ModalOverlay>
            <View
              style={[styles.modalContent, { backgroundColor: theme.card }]}
            >
              <Text
                style={[
                  styles.pageTitle,
                  { color: theme.text, marginBottom: 10 },
                ]}
              >
                Arquivar Sugestão
              </Text>
              <Text style={{ color: theme.textMuted, marginBottom: 20 }}>
                Por que esta sugestão não será pautada?
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.bg,
                    height: 100,
                    textAlignVertical: "top",
                  },
                ]}
                placeholder="Digite o motivo obrigatório..."
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={LIMITE.motivo}
                value={motivoArquivamento}
                onChangeText={setMotivoArquivamento}
              />
              <View style={styles.row}>
                <TouchableOpacity
                  style={[
                    styles.btnOutline,
                    {
                      borderColor: theme.danger,
                      backgroundColor: theme.danger + "10",
                      flex: 1,
                      marginRight: 6,
                    },
                  ]}
                  onPress={() =>
                    avaliarSugestao(showAvaliarSugestao, "arquivada")
                  }
                >
                  <Text style={{ color: theme.danger, fontWeight: "700" }}>
                    Confirmar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.btnOutline,
                    { borderColor: theme.border, flex: 1, marginLeft: 6 },
                  ]}
                  onPress={() => setShowAvaliarSugestao(null)}
                >
                  <Text style={{ color: theme.text, fontWeight: "700" }}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ModalOverlay>
        </Modal>
        {/* Modal: Nova Reserva */}
        <Modal
          visible={showNovaReserva}
          transparent
          animationType="slide"
          supportedOrientations={ORIENTACOES}
          onRequestClose={() => setShowNovaReserva(false)}
        >
          <ModalOverlay>
            <View
              style={[styles.modalContent, { backgroundColor: theme.card }]}
            >
              <Text
                style={[
                  styles.pageTitle,
                  { color: theme.text, marginBottom: 5 },
                ]}
              >
                Solicitar Reserva
              </Text>

              {/* SELEÇÃO DA DATA */}
              <Text
                style={{
                  color: theme.text,
                  fontSize: 12,
                  marginBottom: 4,
                  marginTop: 10,
                  fontWeight: "600",
                }}
              >
                Data da Reserva
              </Text>
              <DateTimeField
                mode="date"
                label="Data da reserva"
                value={dataReserva}
                minimumDate={hoje}
                onChange={setDataReserva}
                isDark={isDark}
                colors={theme}
              />

              {/* SELEÇÃO DO ESPAÇO (PÍLULAS) */}
              <Text
                style={{
                  color: theme.text,
                  fontSize: 12,
                  marginBottom: 6,
                  fontWeight: "600",
                }}
              >
                Espaço Desejado
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 15,
                }}
              >
                {["Salão de Festas", "Churrasqueira", "Piscina"].map(
                  (espaco) => (
                    <TouchableOpacity
                      key={espaco}
                      onPress={() =>
                        setNovaReserva({ ...novaReserva, titulo: espaco })
                      }
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor:
                          novaReserva.titulo === espaco
                            ? theme.primary[0]
                            : theme.bg,
                        borderWidth: 1,
                        borderColor:
                          novaReserva.titulo === espaco
                            ? theme.primary[0]
                            : theme.border,
                      }}
                    >
                      <Text
                        style={{
                          color:
                            novaReserva.titulo === espaco ? "#FFF" : theme.text,
                          fontSize: 13,
                          fontWeight: "bold",
                        }}
                      >
                        {espaco}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
              </View>

              {/* SELEÇÃO DE HORÁRIOS */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      marginBottom: 4,
                      fontWeight: "600",
                    }}
                  >
                    Hora Inicial
                  </Text>
                  <DateTimeField
                    mode="time"
                    label="Hora inicial"
                    value={
                      novaReserva.horaInicio
                        ? horaParaData(novaReserva.horaInicio)
                        : null
                    }
                    onChange={(d) =>
                      setNovaReserva((prev) => ({
                        ...prev,
                        horaInicio: formatarHora(d),
                      }))
                    }
                    isDark={isDark}
                    colors={theme}
                    centered
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      marginBottom: 4,
                      fontWeight: "600",
                    }}
                  >
                    Hora Final
                  </Text>
                  <DateTimeField
                    mode="time"
                    label="Hora final"
                    value={
                      novaReserva.horaFim
                        ? horaParaData(novaReserva.horaFim)
                        : null
                    }
                    onChange={(d) =>
                      setNovaReserva((prev) => ({
                        ...prev,
                        horaFim: formatarHora(d),
                      }))
                    }
                    isDark={isDark}
                    colors={theme}
                    centered
                  />
                </View>
              </View>

              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.bg,
                    height: 60,
                    textAlignVertical: "top",
                  },
                ]}
                placeholder="Detalhes adicionais (opcional)"
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={LIMITE.detalhes}
                value={novaReserva.detalhes}
                onChangeText={(t) =>
                  setNovaReserva({ ...novaReserva, detalhes: t })
                }
              />

              <View style={styles.row}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    marginRight: 6,
                    opacity: salvandoReserva ? 0.6 : 1,
                  }}
                  disabled={salvandoReserva}
                  onPress={solicitarReserva}
                >
                  <LinearGradient
                    colors={theme.primary as [string, string]}
                    style={styles.btnGradient}
                  >
                    <Text style={styles.btnText}>
                      {salvandoReserva ? "Reservando..." : "Confirmar"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.btnOutline,
                    { borderColor: theme.border, flex: 1, marginLeft: 6 },
                  ]}
                  onPress={() => setShowNovaReserva(false)}
                >
                  <Text style={{ color: theme.text, fontWeight: "700" }}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ModalOverlay>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

// === ESTILOS MODERNOS ===
const styles = StyleSheet.create({
  safeArea: { flex: 1 },

  // Header Global
  header: {
    paddingHorizontal: 20,
    paddingTop: 10, // a área segura do topo vem do SafeAreaView
    paddingBottom: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  iconBtn: { padding: 8, marginLeft: 8, borderRadius: 20 },

  // Layout Base
  contentContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    marginTop: 10,
  },
  pageTitle: { fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  row: { flexDirection: "row", alignItems: "center" },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Cards Modernos
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  cardText: { fontSize: 15, lineHeight: 24 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  divider: { height: 1, width: "100%", marginVertical: 30 },

  // Inputs e Botões
  input: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    fontSize: 16,
  },
  btnGradient: {
    padding: 18,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  btnOutline: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  btnSmallGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  btnTextSmall: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 14,
    marginLeft: 6,
  },

  // Calendário
  calendarContainer: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  calendarWeekRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  weekDayText: {
    flex: 1,
    textAlign: "center",
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayBox: {
    width: "14.28%",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dayNumber: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  mesBtn: { padding: 4 },
  eventDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  eventDetailBox: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 15,
  },

  // Estante de Atas
  book: {
    width: 140,
    height: 180,
    marginRight: 16,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  bookTitle: { fontSize: 17, fontWeight: "900", marginBottom: 4 },
  bookSubtitle: { fontSize: 13, fontWeight: "500" },
  bookBinding: { position: "absolute", left: 0, top: 0, bottom: 0, width: 8 },

  // Caixa de Sugestões
  motivoBox: { marginTop: 20, padding: 16, borderRadius: 16, borderWidth: 1 },

  // Tab Bar Flutuante
  floatingTabBarContainer: {
    position: "absolute",
  },
  tabBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 16,
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  tabItem: { alignItems: "center", flex: 1 },
  tabLabel: { fontSize: 12, fontWeight: "700", marginTop: 4 },

  // Modais Glassmorphism
  modalContent: {
    width: "100%",
    maxWidth: 520, // não estica em tablets/PC
    alignSelf: "center",
    borderRadius: 28,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 15,
  },

  // === ESTILOS DO MODAL DE ALERTA ===
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
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
    elevation: 8,
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
