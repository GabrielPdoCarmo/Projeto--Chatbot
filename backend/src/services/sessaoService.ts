import { prisma } from "../db";
import { Canal, Condicao } from "../types";

const CONDICOES: Condicao[] = ["correto", "erro_sutil", "erro_obvio"];

/**
 * Sorteia uma condição para a nova sessão. Isso é o ponto que o protocolo
 * de pesquisa deve formalizar: hoje é aleatório uniforme, mas pode virar
 * um sorteio balanceado (round-robin) ou fixo por grupo do participante
 * (ex: todo participante do grupo "A" sempre recebe "erro_sutil"), a
 * depender do desenho definido com o CEP.
 */
function sortearCondicao(): Condicao {
  const indice = Math.floor(Math.random() * CONDICOES.length);
  return CONDICOES[indice];
}

/**
 * Cria um novo participante. O "grupo" pode ser usado se o desenho for
 * entre-sujeitos; por padrão fica "unico".
 */
export async function criarParticipante(grupo: string = "unico") {
  return prisma.participante.create({ data: { grupo } });
}

/**
 * Abre uma nova sessão para o participante, no canal informado, já com
 * uma condição experimental sorteada. Não depende de nenhum problema
 * pré-cadastrado — o aluno traz sua própria dúvida na conversa.
 */
export async function criarSessao(params: {
  participanteId: string;
  canal: Canal;
}) {
  return prisma.sessao.create({
    data: {
      canal: params.canal,
      condicao: sortearCondicao(),
      participante: {
        connect: { id: params.participanteId },
      },
    },
  });
}

export async function finalizarSessao(sessaoId: string) {
  return prisma.sessao.update({
    where: { id: sessaoId },
    data: { finalizadaEm: new Date() },
  });
}

export async function buscarSessao(sessaoId: string) {
  return prisma.sessao.findUnique({
    where: { id: sessaoId },
    include: { participante: true },
  });
}
