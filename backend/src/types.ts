export type Canal = "web" | "whatsapp";
export type Origem = "participante" | "wizard";
export type Condicao = "erro_sutil" | "correto" | "erro_obvio";

// Payload que o participante manda ao digitar uma mensagem.
export type MensagemParticipanteInput = {
  sessaoId: string;
  texto: string;
};

// Payload que o Wizard manda ao responder.
export type RespostaWizardInput = {
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
