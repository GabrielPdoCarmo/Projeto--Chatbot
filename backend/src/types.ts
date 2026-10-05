export type Canal = "web" | "whatsapp";
export type Origem = "participante" | "ia";
export type Condicao = "erro_sutil" | "correto" | "erro_obvio";
export type Personalidade = "formal" | "amigavel" | "confiante";

// Lista usada para sortear a personalidade de cada sessão.
export const PERSONALIDADES: Personalidade[] = ["formal", "amigavel", "confiante"];

// Payload que o participante manda ao digitar uma mensagem.
export type MensagemParticipanteInput = {
  sessaoId: string;
  texto: string;
};

// Formato de mensagem devolvido para os clientes (web e, futuramente,
// usado internamente antes de formatar para a API do WhatsApp).
export type MensagemDTO = {
  id: string;
  sessaoId: string;
  origem: Origem;
  texto: string;
  timestamp: string;
};
