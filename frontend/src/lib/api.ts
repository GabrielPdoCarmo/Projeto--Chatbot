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

export { API_URL };
