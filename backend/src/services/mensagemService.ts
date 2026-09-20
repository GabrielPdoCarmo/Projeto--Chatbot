import { Server as SocketIOServer } from "socket.io";
import { prisma } from "../db";
import { MensagemDTO } from "../types";

/**
 * Este arquivo é o "cérebro" do experimento: tudo que precisa acontecer
 * quando uma mensagem chega ou quando o Wizard responde, independente
 * de o canal ser a página web de hoje ou o WhatsApp de amanhã.
 *
 * Regra de ouro ao adicionar o canal WhatsApp depois: o webhook do
 * WhatsApp deve chamar EXATAMENTE essas duas funções — nunca duplicar
 * a lógica de persistência/broadcast em outro lugar.
 */

function paraDTO(m: {
  id: string;
  sessaoId: string;
  origem: string;
  texto: string;
  timestamp: Date;
}): MensagemDTO {
  return {
    id: m.id,
    sessaoId: m.sessaoId,
    origem: m.origem as MensagemDTO["origem"],
    texto: m.texto,
    timestamp: m.timestamp.toISOString(),
  };
}

/**
 * Chamado quando o PARTICIPANTE envia uma mensagem (venha do canal que vier).
 * 1. Persiste a mensagem.
 * 2. Notifica quem estiver naquela sessão (o próprio participante, se web).
 * 3. Notifica a sala "wizard_geral" para o painel do pesquisador reagir.
 */
export async function receberMensagemParticipante(
  io: SocketIOServer,
  params: { sessaoId: string; texto: string }
): Promise<MensagemDTO> {
  const salva = await prisma.mensagem.create({
    data: {
      sessaoId: params.sessaoId,
      origem: "participante",
      texto: params.texto,
    },
  });

  const dto = paraDTO(salva);

  // O painel do Wizard precisa saber a condição da sessão para decidir
  // que tipo de resposta dar (correta / erro sutil / erro óbvio).
  const sessao = await prisma.sessao.findUnique({
    where: { id: params.sessaoId },
    select: { condicao: true },
  });

  io.to(params.sessaoId).emit("nova_mensagem", dto);
  io.to("wizard_geral").emit("mensagem_para_wizard", {
    ...dto,
    condicao: sessao?.condicao ?? "desconhecida",
  });

  return dto;
}

/**
 * Chamado quando o WIZARD (pesquisador) envia a resposta "da IA".
 * 1. Persiste a mensagem.
 * 2. Envia de volta para a sessão específica (para o canal de origem
 *    devolver ao participante — via socket se for web).
 *
 * Para WhatsApp: depois de persistir, o webhook handler vai pegar esse
 * retorno e chamar a API do WhatsApp para efetivamente enviar o texto.
 */
export async function enviarRespostaWizard(
  io: SocketIOServer,
  params: { sessaoId: string; texto: string }
): Promise<MensagemDTO> {
  const salva = await prisma.mensagem.create({
    data: {
      sessaoId: params.sessaoId,
      origem: "wizard",
      texto: params.texto,
    },
  });

  const dto = paraDTO(salva);

  io.to(params.sessaoId).emit("nova_mensagem", dto);

  return dto;
}

export async function listarMensagensDaSessao(
  sessaoId: string
): Promise<MensagemDTO[]> {
  const mensagens = await prisma.mensagem.findMany({
    where: { sessaoId },
    orderBy: { timestamp: "asc" },
  });

  return mensagens.map(paraDTO);
}
