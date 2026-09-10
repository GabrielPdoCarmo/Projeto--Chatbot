import "./Inicio.css";

type InicioProps = {
  onIniciar: () => void;
};

function Inicio({ onIniciar }: InicioProps) {
  return (
    <main className="inicio-page">
      <h1>
        Experimento de Programação e Inteligência Artificial
      </h1>

      <p className="welcome">
        Bem-vindo(a)!
      </p>

      <p>
        Você participará de um experimento relacionado à resolução de
        problemas de programação e à interação com uma ferramenta de
        inteligência artificial.
      </p>

      <p>
        Durante o experimento, serão apresentados problemas que deverão
        ser analisados e resolvidos com o auxílio do sistema.
      </p>

      <p>
        Leia atentamente as instruções apresentadas antes de iniciar.
      </p>

      <div className="inicio-button-container">
        <button
          type="button"
          className="inicio-button"
          onClick={onIniciar}
        >
          Iniciar experimento
        </button>
      </div>
    </main>
  );
}

export default Inicio;