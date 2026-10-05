import { useEffect, useRef, useState } from "react";
import { getSocket } from "../../lib/socket";
import type { SessaoDTO } from "../../lib/api";
import "./ChatBot.css";

type Mensagem = {
  id: string;
  origem: "participante" | "ia";
  texto: string;
  timestamp: string;
};

type ChatbotProps = {
  sessao: SessaoDTO;
};

function Chatbot({ sessao }: ChatbotProps) {
  const [mensagem, setMensagem] = useState("");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [aguardandoResposta, setAguardandoResposta] = useState(false);
  const [textoParcial, setTextoParcial] = useState("");
  const mensagensRef = useRef<HTMLDivElement>(null);

  // Conecta na sala da sessão e escuta as mensagens que chegam
  // (o eco da própria mensagem e a resposta automática da IA).
  useEffect(() => {
    const socket = getSocket();

    socket.emit("entrar_sessao", { sessaoId: sessao.id });

    const aoReceberMensagem = (msg: Mensagem) => {
      setMensagens((anteriores) => [...anteriores, msg]);
      if (msg.origem === "ia") {
        setAguardandoResposta(false);
        setTextoParcial("");
      }
    };

    // Texto da IA chegando aos poucos (streaming).
    const aoReceberTrecho = (dados: { texto: string }) => {
      setTextoParcial(dados.texto);
    };

    const aoAssistenteDigitando = () => {
      setAguardandoResposta(true);
    };

    socket.on("nova_mensagem", aoReceberMensagem);
    socket.on("assistente_digitando", aoAssistenteDigitando);
    socket.on("assistente_trecho", aoReceberTrecho);

    return () => {
      socket.off("nova_mensagem", aoReceberMensagem);
      socket.off("assistente_digitando", aoAssistenteDigitando);
      socket.off("assistente_trecho", aoReceberTrecho);
    };
  }, [sessao.id]);

  // Rola para a última mensagem sempre que a lista muda ou o indicador
  // de carregamento aparece.
  useEffect(() => {
    mensagensRef.current?.scrollTo({
      top: mensagensRef.current.scrollHeight,
      behavior: textoParcial ? "auto" : "smooth",
    });
  }, [mensagens, aguardandoResposta, textoParcial]);

  const enviarMensagem = () => {
    const texto = mensagem.trim();
    if (!texto || aguardandoResposta) return;

    getSocket().emit("mensagem_participante", { sessaoId: sessao.id, texto });
    setMensagem("");
  };

  const pressionarTecla = (
    evento: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (evento.key === "Enter" && !evento.shiftKey) {
      evento.preventDefault();
      enviarMensagem();
    }
  };

  return (
    <div className="chatbot-fundo">
      <main className="chatbot-page">
        <header className="chatbot-header">
          <h1>Experimento de Programação e IA</h1>
          <span>Assistente</span>
        </header>

        <section className="chat-section">
          <div className="chat-messages" ref={mensagensRef}>
            <div className="message assistant">
              <strong>Assistente</strong>
              <p>
                Olá! Sou seu assistente de programação. Pode colar seu código
                ou descrever sua dúvida que eu te ajudo a resolver.
              </p>
            </div>

            {mensagens.map((item) => (
              <div
                key={item.id}
                className={`message ${
                  item.origem === "ia" ? "assistant" : "user"
                }`}
              >
                <strong>{item.origem === "ia" ? "Assistente" : "Você"}</strong>
                <p>{item.texto}</p>
              </div>
            ))}

            {aguardandoResposta && textoParcial && (
              <div className="message assistant">
                <strong>Assistente</strong>
                <p>{textoParcial}</p>
              </div>
            )}

            {aguardandoResposta && !textoParcial && (
              <div className="message assistant message-digitando">
                <strong>Assistente</strong>
                <p className="digitando-pontinhos">
                  <span></span>
                  <span></span>
                  <span></span>
                </p>
              </div>
            )}
          </div>

          <div className="chat-input-area">
            <textarea
              value={mensagem}
              onChange={(evento) => setMensagem(evento.target.value)}
              onKeyDown={pressionarTecla}
              placeholder="Cole seu código ou descreva o que já tentou... (Shift+Enter para quebrar linha)"
              rows={3}
              disabled={aguardandoResposta}
            />

            <button
              type="button"
              onClick={enviarMensagem}
              disabled={!mensagem.trim() || aguardandoResposta}
            >
              Enviar
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Chatbot;
