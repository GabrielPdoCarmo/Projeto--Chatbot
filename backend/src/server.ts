import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

import { participantesRouter } from "./routes/participantes";
import { sessoesRouter } from "./routes/sessoes";
import {
  receberMensagemParticipante,
  enviarRespostaWizard,
} from "./services/mensagemService";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json());

app.use("/api/participantes", participantesRouter);
app.use("/api/sessoes", sessoesRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN ?? "*" },
});

/**
 * Eventos de socket — este é o canal "web" hoje. Quando o WhatsApp entrar
 * na jogada, ele NÃO vai usar socket: um webhook HTTP vai chamar
 * receberMensagemParticipante/enviarRespostaWizard diretamente. O painel
 * do Wizard nem percebe a diferença, porque ele só escuta a sala
 * "wizard_geral" e as salas por sessaoId.
 */
io.on("connection", (socket) => {
  // O cliente entra na "sala" da sua sessão (participante no chat web)
  // ou na sala geral do wizard (painel do pesquisador).
  socket.on("entrar_sessao", (payload: { sessaoId?: string; papel: "participante" | "wizard" }) => {
    if (payload.papel === "wizard") {
      socket.join("wizard_geral");
    }
    if (payload.sessaoId) {
      socket.join(payload.sessaoId);
    }
  });

  socket.on(
    "mensagem_participante",
    async (payload: { sessaoId: string; texto: string }) => {
      try {
        await receberMensagemParticipante(io, payload);
      } catch (erro) {
        console.error("Erro ao processar mensagem do participante:", erro);
      }
    }
  );

  socket.on(
    "resposta_wizard",
    async (payload: { sessaoId: string; texto: string }) => {
      try {
        await enviarRespostaWizard(io, payload);
      } catch (erro) {
        console.error("Erro ao processar resposta do wizard:", erro);
      }
    }
  );
});

const PORT = Number(process.env.PORT ?? 4000);
httpServer.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
