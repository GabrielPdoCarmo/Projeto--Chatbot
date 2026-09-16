import { io, Socket } from "socket.io-client";

const API_URL = "http://localhost:4000";

let socket: Socket | null = null;

// Reaproveita a mesma conexão em todo o app — evita abrir um socket novo
// a cada re-render do Chatbot.
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL);
  }
  return socket;
}
