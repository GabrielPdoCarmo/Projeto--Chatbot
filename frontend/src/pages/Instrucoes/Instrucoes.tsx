import "./Instrucoes.css";

function Instrucoes({
  onContinuar,
  carregando = false,
}: {
  onContinuar: () => void;
  carregando?: boolean;
}) {
  return (
    <div className="instrucoes-fundo">
      <main className="instrucoes-page">
        <h1>Instruções</h1>

        <p className="instrucoes-destaque">
          Antes de iniciar, leia atentamente as instruções do experimento.
        </p>

        <p>
          Você deverá analisar os problemas apresentados e utilizar o
          sistema para auxiliar na resolução.
        </p>

        <p>
          Procure responder às atividades de acordo com seu próprio
          entendimento.
        </p>

        <div className="instrucoes-button-container">
          <button
            type="button"
            className="instrucoes-button"
            onClick={onContinuar}
            disabled={carregando}
          >
            {carregando ? "Carregando..." : "Começar experimento"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default Instrucoes;
