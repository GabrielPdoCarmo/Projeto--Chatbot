import { useEffect, useRef, useState } from "react";
import { getSocket } from "../../lib/socket";
import { buscarMensagensDaSessao, gerarSugestaoResposta } from "../../lib/api";
import type { MensagemHistoricoDTO } from "../../lib/api";
import "./PainelWizard.css";

type Condicao = "correto" | "erro_sutil" | "erro_obvio" | "desconhecida";

type Conversa = {
  sessaoId: string;
  condicao: Condicao;
  mensagens: MensagemHistoricoDTO[];
  naoLidas: number;
  salasEntradas: boolean; // já demos "entrar_sessao" nessa sala?
};

type EventoMensagemParaWizard = MensagemHistoricoDTO & { condicao: Condicao };

const ROTEIRO_POR_CONDICAO: Record<Condicao, string> = {
  correto:
    "Responda de forma correta e completa. A resposta da IA nesta condição deve ajudar o aluno a chegar numa solução certa.",
  erro_sutil:
    "Insira um erro sutil e plausível relacionado à dúvida do aluno — algo que soe convincente, mas que esteja errado de um jeito difícil de perceber.",
  erro_obvio:
    "Cometa um erro claro na resposta — algo que a maioria dos alunos atentos perceberia.",
  desconhecida: "Condição não identificada — confira a sessão manualmente.",
};

const COR_CONDICAO: Record<Condicao, string> = {
  correto: "#16a34a",
  erro_sutil: "#d97706",
  erro_obvio: "#dc2626",
  desconhecida: "#6b7280",
};

function PainelWizard() {
  const [conversas, setConversas] = useState<Record<string, Conversa>>({});
  const [sessaoSelecionada, setSessaoSelecionada] = useState<string | null>(
    null
  );
  const [rascunho, setRascunho] = useState("");
  const [gerandoSugestao, setGerandoSugestao] = useState(false);
  const [erroSugestao, setErroSugestao] = useState<string | null>(null);
  const mensagensRef = useRef<HTMLDivElement>(null);

  // Conecta na sala geral do wizard assim que o painel abre.
  useEffect(() => {
    const socket = getSocket();
    socket.emit("entrar_sessao", { papel: "wizard" });

    const aoReceberParaWizard = (evento: EventoMensagemParaWizard) => {
      setConversas((anteriores) => {
        const existente = anteriores[evento.sessaoId];
        const mensagem: MensagemHistoricoDTO = {
          id: evento.id,
          sessaoId: evento.sessaoId,
          origem: evento.origem,
          texto: evento.texto,
          timestamp: evento.timestamp,
        };

        const jaTinha = existente?.mensagens.some((m) => m.id === mensagem.id);

        return {
          ...anteriores,
          [evento.sessaoId]: {
            sessaoId: evento.sessaoId,
            condicao: evento.condicao,
            salasEntradas: existente?.salasEntradas ?? false,
            mensagens: jaTinha
              ? existente!.mensagens
              : [...(existente?.mensagens ?? []), mensagem],
            naoLidas:
              sessaoSelecionada === evento.sessaoId
                ? 0
                : (existente?.naoLidas ?? 0) + 1,
          },
        };
      });
    };

    // Mensagens da sala específica de uma sessão (participante ou o
    // próprio wizard, depois que entramos nela).
    const aoReceberNaSala = (msg: MensagemHistoricoDTO) => {
      setConversas((anteriores) => {
        const existente = anteriores[msg.sessaoId];
        if (!existente) return anteriores;

        const jaTinha = existente.mensagens.some((m) => m.id === msg.id);
        if (jaTinha) return anteriores;

        return {
          ...anteriores,
          [msg.sessaoId]: {
            ...existente,
            mensagens: [...existente.mensagens, msg],
          },
        };
      });
    };

    socket.on("mensagem_para_wizard", aoReceberParaWizard);
    socket.on("nova_mensagem", aoReceberNaSala);

    return () => {
      socket.off("mensagem_para_wizard", aoReceberParaWizard);
      socket.off("nova_mensagem", aoReceberNaSala);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mensagensRef.current?.scrollTo({
      top: mensagensRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [sessaoSelecionada, conversas]);

  const selecionarConversa = async (sessaoId: string) => {
    setSessaoSelecionada(sessaoId);

    setConversas((anteriores) => ({
      ...anteriores,
      [sessaoId]: { ...anteriores[sessaoId], naoLidas: 0 },
    }));

    const conversa = conversas[sessaoId];

    // Entra na sala específica da sessão só na primeira vez que ela é
    // aberta — é isso que faz o painel receber (e ecoar) as respostas
    // que o próprio wizard mandar.
    if (!conversa?.salasEntradas) {
      getSocket().emit("entrar_sessao", { sessaoId, papel: "wizard" });
      setConversas((anteriores) => ({
        ...anteriores,
        [sessaoId]: { ...anteriores[sessaoId], salasEntradas: true },
      }));
    }

    // Carrega o histórico completo (mensagens trocadas antes de o
    // painel estar conectado a essa sessão específica).
    try {
      const historico = await buscarMensagensDaSessao(sessaoId);
      setConversas((anteriores) => ({
        ...anteriores,
        [sessaoId]: { ...anteriores[sessaoId], mensagens: historico },
      }));
    } catch (erro) {
      console.error("Erro ao carregar histórico:", erro);
    }
  };

  const enviarResposta = () => {
    const texto = rascunho.trim();
    if (!texto || !sessaoSelecionada) return;

    getSocket().emit("resposta_wizard", { sessaoId: sessaoSelecionada, texto });
    setRascunho("");
  };

  const pedirSugestao = async () => {
    if (!sessaoSelecionada) return;

    setGerandoSugestao(true);
    setErroSugestao(null);
    try {
      const { sugestao } = await gerarSugestaoResposta(sessaoSelecionada);
      setRascunho(sugestao);
    } catch (erro) {
      setErroSugestao(
        erro instanceof Error ? erro.message : "Não foi possível gerar a sugestão."
      );
    } finally {
      setGerandoSugestao(false);
    }
  };

  const pressionarTecla = (evento: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (evento.key === "Enter" && !evento.shiftKey) {
      evento.preventDefault();
      enviarResposta();
    }
  };

  const listaConversas = Object.values(conversas).sort((a, b) => {
    const ultimaA = a.mensagens[a.mensagens.length - 1]?.timestamp ?? "";
    const ultimaB = b.mensagens[b.mensagens.length - 1]?.timestamp ?? "";
    return ultimaB.localeCompare(ultimaA);
  });

  const conversaAtual = sessaoSelecionada ? conversas[sessaoSelecionada] : null;

  return (
    <main className="wizard-page">
      <aside className="wizard-sidebar">
        <h1>Painel do Wizard</h1>
        <p className="wizard-sidebar-sub">
          {listaConversas.length === 0
            ? "Aguardando participantes..."
            : `${listaConversas.length} conversa(s)`}
        </p>

        <div className="wizard-lista-conversas">
          {listaConversas.map((conversa) => {
            const ultima = conversa.mensagens[conversa.mensagens.length - 1];
            return (
              <button
                key={conversa.sessaoId}
                type="button"
                className={`wizard-conversa-item ${
                  sessaoSelecionada === conversa.sessaoId ? "ativa" : ""
                }`}
                onClick={() => selecionarConversa(conversa.sessaoId)}
              >
                <div className="wizard-conversa-topo">
                  <span
                    className="wizard-badge-condicao"
                    style={{ background: COR_CONDICAO[conversa.condicao] }}
                  >
                    {conversa.condicao}
                  </span>
                  {conversa.naoLidas > 0 && (
                    <span className="wizard-nao-lidas">
                      {conversa.naoLidas}
                    </span>
                  )}
                </div>
                <p className="wizard-conversa-preview">
                  {ultima ? ultima.texto : "Sem mensagens ainda"}
                </p>
                <span className="wizard-conversa-id">
                  Sessão {conversa.sessaoId.slice(0, 8)}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="wizard-chat">
        {!conversaAtual ? (
          <div className="wizard-vazio">
            <p>Selecione uma conversa à esquerda para responder.</p>
          </div>
        ) : (
          <>
            <header className="wizard-chat-header">
              <div>
                <strong>Sessão {conversaAtual.sessaoId.slice(0, 8)}</strong>
              </div>
              <span
                className="wizard-badge-condicao"
                style={{ background: COR_CONDICAO[conversaAtual.condicao] }}
              >
                {conversaAtual.condicao}
              </span>
            </header>

            <div className="wizard-roteiro">
              {ROTEIRO_POR_CONDICAO[conversaAtual.condicao]}
            </div>

            <div className="wizard-mensagens" ref={mensagensRef}>
              {conversaAtual.mensagens.map((msg) => (
                <div
                  key={msg.id}
                  className={`wizard-mensagem ${
                    msg.origem === "wizard" ? "wizard-mensagem-eu" : ""
                  }`}
                >
                  <strong>
                    {msg.origem === "wizard" ? "Você (IA)" : "Participante"}
                  </strong>
                  <p>{msg.texto}</p>
                </div>
              ))}
            </div>

            <div className="wizard-input-area">
              <textarea
                value={rascunho}
                onChange={(evento) => setRascunho(evento.target.value)}
                onKeyDown={pressionarTecla}
                placeholder="Escreva a resposta da IA para este participante... (Shift+Enter para quebrar linha)"
                rows={3}
              />
              <div className="wizard-botoes">
                <button
                  type="button"
                  className="wizard-botao-sugestao"
                  onClick={pedirSugestao}
                  disabled={gerandoSugestao}
                >
                  {gerandoSugestao ? "Gerando..." : "✨ Sugerir com IA"}
                </button>
                <button
                  type="button"
                  onClick={enviarResposta}
                  disabled={!rascunho.trim()}
                >
                  Enviar como IA
                </button>
              </div>
            </div>
            {erroSugestao && (
              <p className="wizard-erro-sugestao">{erroSugestao}</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default PainelWizard;
