// Ajuste esse endereço se o backend rodar em outra porta/host.
const API_URL = "http://localhost:4000";

export type SessaoDTO = {
  id: string;
};

export async function criarParticipante(): Promise<{ id: string }> {
  const resposta = await fetch(`${API_URL}/api/participantes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!resposta.ok) {
    throw new Error("Não foi possível criar o participante.");
  }

  return resposta.json();
}

export async function criarSessao(
  participanteId: string
): Promise<{ sessao: SessaoDTO }> {
  const resposta = await fetch(`${API_URL}/api/sessoes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participanteId, canal: "web" }),
  });

  if (!resposta.ok) {
    throw new Error("Não foi possível iniciar a sessão.");
  }

  return resposta.json();
}

export type MensagemHistoricoDTO = {
  id: string;
  sessaoId: string;
  origem: "participante" | "wizard";
  texto: string;
  timestamp: string;
};

// Usado pelo painel do Wizard ao selecionar uma conversa, para carregar
// o histórico completo (o socket só entrega mensagens a partir do
// momento em que o painel se conecta).
export async function buscarMensagensDaSessao(
  sessaoId: string
): Promise<MensagemHistoricoDTO[]> {
  const resposta = await fetch(`${API_URL}/api/sessoes/${sessaoId}/mensagens`);
  if (!resposta.ok) {
    throw new Error("Não foi possível buscar as mensagens da sessão.");
  }
  return resposta.json();
}

// Pede ao backend uma sugestão de resposta gerada por IA real (ChatGPT),
// já orientada pelo roteiro da condição da sessão. O texto retornado só
// preenche o rascunho — quem decide enviar é sempre o Wizard.
export async function gerarSugestaoResposta(
  sessaoId: string
): Promise<{ sugestao: string }> {
  const resposta = await fetch(`${API_URL}/api/sessoes/${sessaoId}/sugestao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.erro ?? "Não foi possível gerar a sugestão.");
  }

  return resposta.json();
}

export { API_URL };
