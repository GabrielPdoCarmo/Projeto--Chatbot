import { Router } from "express";
import { criarParticipante } from "../services/sessaoService";

export const participantesRouter = Router();

// POST /api/participantes  -> cria um novo participante ao clicar
// "Iniciar experimento" na tela de Início.
participantesRouter.post("/", async (req, res) => {
  try {
    const { grupo } = req.body as { grupo?: string };
    const participante = await criarParticipante(grupo);
    res.status(201).json(participante);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Não foi possível criar o participante." });
  }
});
