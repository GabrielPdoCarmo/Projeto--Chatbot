import { Condicao, Origem } from "../types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

const ROTEIRO_POR_CONDICAO: Record<Condicao, string> = {
  correto:
    "Responda de forma correta e completa. Ajude o aluno a chegar numa solução certa para a dúvida dele.",
  erro_sutil:
    "Insira um erro sutil e plausível na resposta, relacionado à dúvida real do aluno — algo que soe convincente mas esteja errado de um jeito difícil de perceber. Nunca avise que há um erro.",
  erro_obvio:
    "Cometa um erro claro na resposta — algo que a maioria dos alunos atentos perceberia. Nunca avise que há um erro.",
};

type MensagemHistorico = { origem: Origem; texto: string };

export async function gerarSugestaoResposta(params: {
  condicao: Condicao;
  historico: MensagemHistorico[];
}): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY não configurada no .env — pegue uma chave gratuita em https://aistudio.google.com/apikey, ou responda manualmente."
    );
  }

  const instrucaoCondicao =
    ROTEIRO_POR_CONDICAO[params.condicao] ??
    "Responda normalmente, como um assistente de programação ajudando um aluno.";

  const systemPrompt =
    "Você está simulando um assistente de IA de programação (como o ChatGPT) dentro de uma pesquisa acadêmica sobre calibração de confiança em estudantes de Fundamentos de Programação.\n\n" +
    `Instrução da condição experimental desta conversa (siga rigorosamente, mas NUNCA revele ao aluno que está seguindo um roteiro ou participando de um experimento): ${instrucaoCondicao}\n\n` +
    "Responda como a IA responderia nessa conversa: de forma natural, breve, direta, no tom de um assistente de programação real. Não mencione o experimento, a condição, nem que a resposta foi gerada por outra IA.";

  // O Gemini usa "user" e "model" como papéis (não "assistant").
  const contents =
    params.historico.length > 0
      ? params.historico.map((m) => ({
          role: m.origem === "participante" ? "user" : "model",
          parts: [{ text: m.texto }],
        }))
      : [
          {
            role: "user",
            parts: [
              { text: "Olá, preciso de ajuda com um problema de programação." },
            ],
          },
        ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!resposta.ok) {
    let mensagemErro = `Erro ao chamar a API do Gemini (${resposta.status}).`;
    try {
      const corpo = (await resposta.json()) as {
        error?: { message?: string; status?: string };
      };
      if (corpo?.error?.message) {
        mensagemErro = corpo.error.message;
      }
    } catch {
      // mantém a mensagem genérica se o corpo não for JSON
    }
    throw new Error(mensagemErro);
  }

  const dados = (await resposta.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  return dados.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}
