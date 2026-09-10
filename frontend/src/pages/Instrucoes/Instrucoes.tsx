import "./Instrucoes.css";

function Instrucoes({
  onContinuar,
}: {
  onContinuar: () => void;
}) {
  return (
    <main className="instrucoes-page">
      <h1>Instruções</h1>

      <p>
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
        >
          Começar experimento
        </button>
      </div>
    </main>
  );
}

export default Instrucoes;