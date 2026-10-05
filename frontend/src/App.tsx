import { useState } from "react";
import Inicio from "./pages/Inicio/Inicio";
import Instrucoes from "./pages/Instrucoes/Instrucoes";
import Chatbot from "./pages/ChatBox/Chatbot";
import { criarParticipante, criarSessao } from "./lib/api";
import type { SessaoDTO } from "./lib/api";
import "./App.css";

type Pagina = "inicio" | "instrucoes" | "chatbot";

function App() {
  const [pagina, setPagina] = useState<Pagina>("inicio");
  const [participanteId, setParticipanteId] = useState<string | null>(null);
  const [sessao, setSessao] = useState<SessaoDTO | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Chamado pelo botão "Iniciar experimento" da tela Início.
  const iniciarExperimento = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const participante = await criarParticipante();
      setParticipanteId(participante.id);
      setPagina("instrucoes");
    } catch {
      setErro(
        "Não foi possível iniciar o experimento. Verifique se o servidor backend está rodando em http://localhost:4000."
      );
    } finally {
      setCarregando(false);
    }
  };

  // Chamado pelo botão "Começar experimento" da tela Instruções.
  // Abre a sessão — já com uma condição sorteada no backend, mas isso
  // nunca aparece pro participante.
  const iniciarSessaoDoChatbot = async () => {
    if (!participanteId) return;

    setCarregando(true);
    setErro(null);
    try {
      const { sessao } = await criarSessao(participanteId);
      setSessao(sessao);
      setPagina("chatbot");
    } catch {
      setErro(
        "Não foi possível iniciar a sessão. Verifique se o servidor backend está rodando em http://localhost:4000."
      );
    } finally {
      setCarregando(false);
    }
  };

  if (erro) {
    return (
      <main style={{ maxWidth: 600, margin: "80px auto", textAlign: "center" }}>
        <p style={{ color: "#b91c1c" }}>{erro}</p>
      </main>
    );
  }

  if (pagina === "inicio") {
    return <Inicio onIniciar={iniciarExperimento} carregando={carregando} />;
  }

  if (pagina === "instrucoes") {
    return (
      <Instrucoes onContinuar={iniciarSessaoDoChatbot} carregando={carregando} />
    );
  }

  if (sessao) {
    return <Chatbot sessao={sessao} />;
  }

  return null;
}

export default App;
