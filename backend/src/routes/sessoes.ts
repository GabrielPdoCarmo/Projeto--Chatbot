import { Router } from "express";
import { criarSessao, finalizarSessao, buscarSessao } from "../services/sessaoService";
import { listarMensagensDaSessao } from "../services/mensagemService";

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
