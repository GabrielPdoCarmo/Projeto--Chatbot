import { useState } from "react";
import "./ChatBot.css";

type Mensagem = {
  id: number;
  tipo: "user" | "assistant";
  texto: string;
};

function Chatbot() {
  const [mensagem, setMensagem] = useState("");

  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      id: 1,
      tipo: "assistant",
      texto:
        "Olá! Sou o assistente de programação. Descreva o problema que você precisa resolver e posso ajudar você a analisá-lo.",
    },
  ]);

  const enviarMensagem = () => {
    const texto = mensagem.trim();

    if (!texto) {
      return;
    }

    const novaMensagem: Mensagem = {
      id: Date.now(),
      tipo: "user",
      texto,
    };

    setMensagens((mensagensAnteriores) => [
      ...mensagensAnteriores,
      novaMensagem,
    ]);

    setMensagem("");

    // Resposta temporária do assistente
    setTimeout(() => {
      const resposta: Mensagem = {
        id: Date.now() + 1,
        tipo: "assistant",
        texto:
          "Entendi. Vou analisar o problema que você apresentou. Podemos trabalhar na resolução passo a passo. O que você gostaria de verificar primeiro?",
      };

      setMensagens((mensagensAnteriores) => [
        ...mensagensAnteriores,
        resposta,
      ]);
    }, 600);
  };

  const pressionarEnter = (
    evento: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (evento.key === "Enter") {
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
        <div className="chat-messages">
          {mensagens.map((item) => (
            <div
              key={item.id}
              className={`message ${item.tipo}`}
            >
              <strong>
                {item.tipo === "assistant"
                  ? "Assistente"
                  : "Você"}
              </strong>

              <p>{item.texto}</p>
            </div>
          ))}
        </div>

        <div className="chat-input-area">
          <input
            type="text"
            value={mensagem}
            onChange={(evento) =>
              setMensagem(evento.target.value)
            }
            onKeyDown={pressionarEnter}
            placeholder="Descreva o problema ou digite sua pergunta..."
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