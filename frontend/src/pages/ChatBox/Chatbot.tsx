import { useEffect, useRef, useState } from "react";
import { getSocket } from "../../lib/socket";
import type { SessaoDTO } from "../../lib/api";
import "./ChatBot.css";

type Mensagem = {
  id: string;
  origem: "participante" | "wizard";
  texto: string;
  timestamp: string;
};

type ChatbotProps = {
  sessao: SessaoDTO;
};

function Chatbot({ sessao }: ChatbotProps) {
  const [mensagem, setMensagem] = useState("");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const mensagensRef = useRef<HTMLDivElement>(null);

  // Conecta na sala da sessão e escuta as mensagens que chegam
  // (tanto o eco da própria mensagem quanto a resposta do Wizard).
  useEffect(() => {
    const socket = getSocket();

    socket.emit("entrar_sessao", {
      sessaoId: sessao.id,
      papel: "participante",
    });

    const aoReceberMensagem = (msg: Mensagem) => {
      setMensagens((anteriores) => [...anteriores, msg]);
    };

    socket.on("nova_mensagem", aoReceberMensagem);

    return () => {
      socket.off("nova_mensagem", aoReceberMensagem);
    };
  }, [sessao.id]);

  // Rola para a última mensagem sempre que a lista muda.
  useEffect(() => {
    mensagensRef.current?.scrollTo({
      top: mensagensRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [mensagens]);

  const enviarMensagem = () => {
    const texto = mensagem.trim();
    if (!texto) return;

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
                item.origem === "wizard" ? "assistant" : "user"
              }`}
            >
              <strong>
                {item.origem === "wizard" ? "Assistente" : "Você"}
              </strong>
              <p>{item.texto}</p>
            </div>
          ))}
        </div>

        <div className="chat-input-area">
          <textarea
            value={mensagem}
            onChange={(evento) => setMensagem(evento.target.value)}
            onKeyDown={pressionarTecla}
            placeholder="Cole seu código ou descreva o que já tentou... (Shift+Enter para quebrar linha)"
            rows={3}
          />

          <button
            type="button"
            onClick={enviarMensagem}
            disabled={!mensagem.trim()}
          >
            Enviar
          </button>
        </div>
      </section>
    </main>
  );
}

export default Chatbot;
