import { useState } from "react";
import Inicio from "./pages/Inicio/Inicio";
import Instrucoes from "./pages/Instrucoes/Instrucoes";
import Chatbot from "./pages/ChatBox/Chatbot";
import "./App.css";

function App() {
  const [pagina, setPagina] = useState<
    "inicio" | "instrucoes" |   "chatbot"
  >("inicio");

  if (pagina === "inicio") {
    return (
      <Inicio
        onIniciar={() => setPagina("instrucoes")}
      />
    );
  }

  if (pagina === "instrucoes") {
    return (
      <Instrucoes
        onContinuar={() => setPagina("chatbot")}
      />
    );
  }


  return <Chatbot />;
}

export default App;