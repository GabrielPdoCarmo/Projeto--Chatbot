import { Server as SocketIOServer } from "socket.io";
import { prisma } from "../db";
import { MensagemDTO, Condicao } from "../types";
import { gerarSugestaoResposta } from "./iaService";

/**
 * Este arquivo é o "cérebro" do experimento: tudo que precisa acontecer
 * quando uma mensagem do participante chega, independente de o canal ser
 * a página web de hoje ou o WhatsApp de amanhã.
 *
 * Não existe mais um Wizard humano: a resposta é gerada automaticamente
 * pela IA (Ollama, rodando localmente), seguindo o roteiro da condição
 * sorteada pra sessão.
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

async function salvarMensagem(
  io: SocketIOServer,
  params: { sessaoId: string; texto: string; origem: "participante" | "ia" }
): Promise<MensagemDTO> {
  const salva = await prisma.mensagem.create({
    data: {
      sessaoId: params.sessaoId,
      origem: params.origem,
      texto: params.texto,
    },
  });

  const dto = paraDTO(salva);
  io.to(params.sessaoId).emit("nova_mensagem", dto);
  return dto;
}

/**
 * Chamado quando o PARTICIPANTE envia uma mensagem (venha do canal que vier).
 * 1. Persiste a mensagem do participante.
 * 2. Avisa a sala que a IA está "digitando" (o front usa isso pro loading).
 * 3. Gera a resposta automática (Ollama) seguindo a condição da sessão,
 *    enviando o texto parcial em tempo real ("assistente_trecho").
 * 4. Persiste a resposta completa e envia de volta ("nova_mensagem").
 *
 * Regra de ouro ao adicionar o canal WhatsApp depois: o webhook do
 * WhatsApp deve chamar esta função — nunca duplicar a lógica em outro
 * lugar.
 */
export async function receberMensagemParticipante(
  io: SocketIOServer,
  params: { sessaoId: string; texto: string }
): Promise<void> {
  await salvarMensagem(io, {
    sessaoId: params.sessaoId,
    texto: params.texto,
    origem: "participante",
  });

  io.to(params.sessaoId).emit("assistente_digitando");

  const sessao = await prisma.sessao.findUnique({
    where: { id: params.sessaoId },
    select: { condicao: true },
  });

  const historico = await prisma.mensagem.findMany({
    where: { sessaoId: params.sessaoId },
    orderBy: { timestamp: "asc" },
  });

  try {
    const textoResposta = await gerarSugestaoResposta({
      condicao: (sessao?.condicao as Condicao) ?? "correto",
      historico: historico.map((m) => ({
        origem: m.origem as "participante" | "ia",
        texto: m.texto,
      })),
      aoReceberTrecho: (textoParcial) => {
        io.to(params.sessaoId).emit("assistente_trecho", {
          sessaoId: params.sessaoId,
          texto: textoParcial,
        });
      },
    });

    await salvarMensagem(io, {
      sessaoId: params.sessaoId,
      texto:
        textoResposta ||
        "Desculpe, não consegui gerar uma resposta agora. Pode reformular sua pergunta?",
      origem: "ia",
    });
  } catch (erro) {
    console.error("Erro ao gerar resposta automática:", erro);
    await salvarMensagem(io, {
      sessaoId: params.sessaoId,
      texto:
        "Desculpe, tive um problema técnico ao gerar a resposta. Tente novamente em instantes.",
      origem: "ia",
    });
  }
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
