import { Router } from "express";
import { criarSessao, finalizarSessao, buscarSessao } from "../services/sessaoService";
import { listarMensagensDaSessao } from "../services/mensagemService";
import { gerarSugestaoResposta } from "../services/iaService";
import type { Condicao } from "../types";

export const sessoesRouter = Router();

// POST /api/sessoes  { participanteId, canal }
// Abre uma nova conversa para o participante, já com uma condição
// experimental sorteada (não depende de nenhum problema pré-cadastrado).
sessoesRouter.post("/", async (req, res) => {
  try {
    const { participanteId, canal } = req.body as {
      participanteId: string;
      canal: "web" | "whatsapp";
    };

    const sessao = await criarSessao({ participanteId, canal });

    res.status(201).json({ sessao });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Não foi possível criar a sessão." });
  }
});

sessoesRouter.get("/:id", async (req, res) => {
  const sessao = await buscarSessao(req.params.id);
  if (!sessao) return res.status(404).json({ erro: "Sessão não encontrada." });
  res.json(sessao);
});

sessoesRouter.get("/:id/mensagens", async (req, res) => {
  const mensagens = await listarMensagensDaSessao(req.params.id);
  res.json(mensagens);
});

sessoesRouter.post("/:id/finalizar", async (req, res) => {
  const sessao = await finalizarSessao(req.params.id);
  res.json(sessao);
});

// POST /api/sessoes/:id/sugestao
// Gera uma sugestão de resposta via IA real, orientada pela condição da
// sessão e pelo histórico da conversa. O Wizard sempre revisa/edita
// antes de efetivamente enviar (ver POST resposta_wizard no socket).
sessoesRouter.post("/:id/sugestao", async (req, res) => {
  try {
    const sessaoId = req.params.id;

    const sessao = await buscarSessao(sessaoId);
    if (!sessao) {
      return res.status(404).json({ erro: "Sessão não encontrada." });
    }

    const mensagens = await listarMensagensDaSessao(sessaoId);

    const sugestao = await gerarSugestaoResposta({
      condicao: sessao.condicao as Condicao,
      historico: mensagens.map((m) => ({
        origem: m.origem,
        texto: m.texto,
      })),
    });

    res.json({ sugestao });
  } catch (erro) {
    console.error(erro);
    const mensagem =
      erro instanceof Error ? erro.message : "Não foi possível gerar a sugestão.";
    res.status(500).json({ erro: mensagem });
  }
});
