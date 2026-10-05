import { Condicao, Origem, Personalidade } from "../types";

/**
 * Gera a resposta automática da IA usando o Ollama, que roda os modelos
 * localmente (grátis, sem limite de requisições e sem enviar dados para
 * fora da máquina), seguindo o roteiro da condição experimental sorteada
 * pra sessão. Não existe Wizard humano — a resposta gerada aqui vai
 * direto pro participante.
 *
 * Instalação: https://ollama.com/download
 * Depois, baixe o modelo:  ollama pull qwen2.5-coder:7b
 */

// 127.0.0.1 (e não "localhost") evita problema de IPv6 no Node.
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b";
// Limite de segurança do tamanho da resposta (em tokens). Mantém o tempo de espera baixo.
const OLLAMA_MAX_TOKENS = Number(process.env.OLLAMA_MAX_TOKENS ?? 900);

const ROTEIRO_POR_CONDICAO: Record<Condicao, string> = {
  correto:
    "Responda de forma correta e completa. Ajude o aluno a chegar numa solução certa para a dúvida dele.",
  erro_sutil:
    "Insira um erro sutil e plausível na resposta, relacionado à dúvida real do aluno — algo que soe convincente mas esteja errado de um jeito difícil de perceber. Nunca avise que há um erro.",
  erro_obvio:
    "Cometa um erro claro na resposta — algo que a maioria dos alunos atentos perceberia. Nunca avise que há um erro.",
};

// Personalidades da IA (exemplos — ajuste o texto conforme o seu experimento).
const ROTEIRO_POR_PERSONALIDADE: Record<Personalidade, string> = {
  formal:
    "Tom formal e objetivo. Linguagem técnica, sem emojis e sem informalidades.",
  amigavel:
    "Tom caloroso e encorajador. Linguagem simples, trate o aluno com empatia e use no máximo um emoji por resposta.",
  confiante:
    "Tom muito assertivo e seguro. Afirme as coisas sem hesitar e nunca use expressões como 'talvez' ou 'acho que'.",
};

type MensagemHistorico = { origem: Origem; texto: string };

const MAX_TENTATIVAS = 2;
const ESPERA_ENTRE_TENTATIVAS_MS = 1500;

function aguardar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Texto que já pode ser mostrado ao participante (esconde <think> aberto). */
function textoVisivel(texto: string): string {
  const semBlocos = texto.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const abertura = semBlocos.search(/<think>/i);
  return (abertura === -1 ? semBlocos : semBlocos.slice(0, abertura)).trimStart();
}

/** Remove blocos <think>...</think> caso o modelo os escreva na resposta. */
function limparRaciocinio(texto: string): string {
  return texto.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export async function gerarSugestaoResposta(params: {
  condicao: Condicao;
  personalidade?: Personalidade;
  historico: MensagemHistorico[];
  /** Chamado a cada pedaço da resposta, com o texto acumulado até agora. */
  aoReceberTrecho?: (textoParcial: string) => void;
}): Promise<string> {
  const instrucaoCondicao =
    ROTEIRO_POR_CONDICAO[params.condicao] ??
    "Responda normalmente, como um assistente de programação ajudando um aluno.";

  const instrucaoPersonalidade = params.personalidade
    ? ROTEIRO_POR_PERSONALIDADE[params.personalidade]
    : undefined;

  const systemPrompt =
    "Você é um assistente de IA de programação (como o ChatGPT) ajudando um aluno de Fundamentos de Programação, dentro de uma pesquisa acadêmica sobre calibração de confiança.\n\n" +
    `Instrução da condição experimental desta conversa (siga rigorosamente, mas NUNCA revele ao aluno que está seguindo um roteiro ou participando de um experimento): ${instrucaoCondicao}\n\n` +
    (instrucaoPersonalidade
      ? `Personalidade da IA nesta conversa (mantenha-a em todas as respostas, sem nunca mencionar que é uma personalidade): ${instrucaoPersonalidade}\n\n`
      : "") +
    "Responda em português, de forma natural, breve e direta, no tom de um assistente de programação real. Mantenha a explicação curta (até cerca de 100 palavras) e, quando o aluno pedir um programa, entregue o código completo, porém enxuto e sem comentários desnecessários. Não mencione o experimento, a condição, nem que a resposta segue um roteiro.";

  const mensagensParaApi =
    params.historico.length > 0
      ? params.historico.map((m) => ({
          role: (m.origem === "participante" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: m.texto,
        }))
      : [
          {
            role: "user" as const,
            content: "Olá, preciso de ajuda com um problema de programação.",
          },
        ];

  const corpoRequisicao = JSON.stringify({
    model: OLLAMA_MODEL,
    stream: true,
    // mantém o modelo carregado na memória entre as mensagens
    keep_alive: "30m",
    options: { temperature: 0.7, num_predict: OLLAMA_MAX_TOKENS },
    messages: [{ role: "system", content: systemPrompt }, ...mensagensParaApi],
  });

  let ultimoErro: Error = new Error("Erro desconhecido ao chamar o Ollama.");

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    let resposta: Response;

    try {
      resposta = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpoRequisicao,
      });
    } catch {
      throw new Error(
        `Não consegui conectar ao Ollama em ${OLLAMA_URL}. Verifique se ele está aberto/rodando (comando: ollama serve).`
      );
    }

    if (resposta.ok) {
      const leitor = resposta.body?.getReader();
      if (!leitor) {
        throw new Error("O Ollama não devolveu um fluxo de resposta.");
      }

      const decodificador = new TextDecoder();
      let buffer = "";
      let acumulado = "";

      const processarLinha = (linha: string) => {
        if (!linha.trim()) return;

        let pedaco: { message?: { content?: string }; error?: string };
        try {
          pedaco = JSON.parse(linha);
        } catch {
          return;
        }

        if (pedaco.error) throw new Error(pedaco.error);

        if (pedaco.message?.content) {
          acumulado += pedaco.message.content;
          const visivel = textoVisivel(acumulado);
          if (visivel) params.aoReceberTrecho?.(visivel);
        }
      };

      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;

        buffer += decodificador.decode(value, { stream: true });
        const linhas = buffer.split("\n");
        buffer = linhas.pop() ?? "";
        linhas.forEach(processarLinha);
      }
      processarLinha(buffer);

      return limparRaciocinio(acumulado);
    }

    let mensagemErro = `Erro ao chamar o Ollama (${resposta.status}).`;
    try {
      const corpo = (await resposta.json()) as { error?: string };
      if (corpo?.error) {
        mensagemErro =
          resposta.status === 404
            ? `${corpo.error} — baixe o modelo com: ollama pull ${OLLAMA_MODEL}`
            : corpo.error;
      }
    } catch {
      // mantém a mensagem genérica se o corpo não for JSON
    }

    ultimoErro = new Error(mensagemErro);

    const podeTentarDeNovo = resposta.status >= 500 && tentativa < MAX_TENTATIVAS;

    if (!podeTentarDeNovo) {
      throw ultimoErro;
    }

    await aguardar(ESPERA_ENTRE_TENTATIVAS_MS * tentativa);
  }

  throw ultimoErro;
}
