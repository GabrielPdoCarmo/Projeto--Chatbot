import { Condicao, Origem, Personalidade } from "../types";

/**
 * Pipeline experimental:
 * - correto: gera uma resposta correta, sem etapas de adulteração.
 * - erro_*: gera uma referência correta, introduz UMA falha localizada
 *   na linguagem do exemplo e audita o grau antes de mostrá-la ao participante.
 *
 * Validação por LLM não garante que o erro exista nem que sua gravidade esteja correta.
 * Para estudos reais, audite amostras com especialistas e/ou testes de código.
 * Nunca envie respostas provisórias por streaming, pois poderiam revelar uma
 * resposta correta antes de a versão com erro ser aprovada.
 */

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b";
const OLLAMA_MAX_TOKENS = Number(process.env.OLLAMA_MAX_TOKENS ?? 1800);
const MAX_TENTATIVAS_ALTERACAO = 5;

type MensagemHistorico = { origem: Origem; texto: string };
type MensagemOllama = { role: "system" | "user" | "assistant"; content: string };

type EdicaoLinha = {
  indice_linha: number | string;
  nova_linha: string;
  explicacao_interna: string;
};

type LinhaEditavel = { indice_linha: number; conteudo: string };


/** A auditoria deve declarar o grau, não apenas marcar `valido: true`. */
type Parecer = {
  valido: boolean;
  grau: "sutil" | "obvio" | "nenhum";
  motivo: string;
  evidencia?: string;
};

/**
 * Não existe uma regra sintática única que funcione para todas as linguagens.
 * A identificação da linguagem é aberta: qualquer rótulo de bloco Markdown
 * é aceito (java, cpp, csharp, rust, sql, html, kotlin, etc.). Se não houver
 * rótulo, o modelo considera a pergunta e a própria resposta de referência.
 */
function linguagemDaReferencia(referencia: string): string {
  const bloco = referencia.match(/^\s*```\s*([^\s`]+)?/m);
  return bloco?.[1]?.trim() || "não especificada; inferir do conteúdo e da pergunta";
}

/**
 * Uma simples troca de literal numérico costuma ser um defeito de limite ou
 * resultado, portanto não é aceita como `erro_obvio`. Esta é uma regra
 * independente de linguagem, complementada por auditoria semântica da IA.
 */
function alterouApenasNumeros(original: string, alterada: string): boolean {
  const numeros = /\b\d+(?:\.\d+)?\b/g;
  return original !== alterada &&
    original.replace(numeros, "<numero>") === alterada.replace(numeros, "<numero>");
}

/**
 * Quando a única mudança é somar/subtrair 1 em uma expressão já existente,
 * geralmente trata-se de um erro de resultado (sutil), não de sintaxe óbvia.
 * Independente da linguagem: não tenta entender a gramática do código.
 * A auditoria continua responsável pelas demais alterações.
 */
function acrescentouOuRemoveuUm(original: string, alterada: string): boolean {
  const normalizar = (linha: string) => linha.replace(/\s+/g, "");
  const a = normalizar(original);
  const b = normalizar(alterada);
  const retirarUm = (linha: string) => linha.replace(/(?<=[\w)\]])[+\-]1\b/g, "");
  return a !== b && retirarUm(a) === retirarUm(b);
}

const PERSONALIDADE: Record<Personalidade, string> = {
  formal: "Use tom formal, objetivo e técnico, sem emojis.",
  amigavel: "Use tom acolhedor, simples e encorajador, com no máximo um emoji.",
  confiante: "Use um tom assertivo e seguro, sem hesitações desnecessárias.",
};

function extrairJSON<T>(texto: string): T {
  const semMarcadores = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(semMarcadores) as T;
  } catch {
    const inicio = semMarcadores.indexOf("{");
    const fim = semMarcadores.lastIndexOf("}");
    if (inicio < 0 || fim <= inicio) throw new Error("A IA não retornou JSON válido.");
    return JSON.parse(semMarcadores.slice(inicio, fim + 1)) as T;
  }
}

async function chamarOllama(
  mensagens: MensagemOllama[],
  opcoes: { json?: boolean; temperatura?: number } = {}
): Promise<string> {
  let resposta: Response;
  try {
    resposta = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        keep_alive: "30m",
        ...(opcoes.json ? { format: "json" } : {}),
        options: {
          temperature: opcoes.temperatura ?? 0.2,
          num_predict: OLLAMA_MAX_TOKENS,
        },
        messages: mensagens,
      }),
    });
  } catch {
    throw new Error(
      `Não foi possível conectar ao Ollama em ${OLLAMA_URL}. Verifique o comando 'ollama serve'.`
    );
  }

  if (!resposta.ok) {
    let detalhe = "";
    try {
      const body = (await resposta.json()) as { error?: string };
      detalhe = body.error ?? "";
    } catch {
      // O servidor pode retornar uma mensagem sem JSON.
    }
    throw new Error(
      `Ollama retornou HTTP ${resposta.status}${detalhe ? `: ${detalhe}` : ""}.` +
        (resposta.status === 404 ? ` Verifique 'ollama pull ${OLLAMA_MODEL}'.` : "")
    );
  }

  const corpo = (await resposta.json()) as { message?: { content?: string }; error?: string };
  if (corpo.error) throw new Error(corpo.error);

  const texto = corpo.message?.content
    ?.replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  if (!texto) throw new Error("O Ollama retornou uma resposta vazia.");
  return texto;
}

function textoPersonalidade(p?: Personalidade): string {
  return p && PERSONALIDADE[p] ? `${PERSONALIDADE[p]}\n` : "";
}

function converterHistorico(historico: MensagemHistorico[]): MensagemOllama[] {
  if (!historico.length) {
    return [{ role: "user", content: "Preciso de ajuda com uma questão de programação." }];
  }
  return historico.map((m) => ({
    role: m.origem === "participante" ? "user" : "assistant",
    content: m.texto,
  }));
}

function ultimaPergunta(historico: MensagemHistorico[]): string {
  return [...historico].reverse().find((m) => m.origem === "participante")?.texto ?? "";
}

/**
 * Em vez de pedir que o modelo copie uma resposta inteira e indique duas
 * substrings EXATAS (frágil no Qwen 7B), numeramos as linhas e aplicamos a
 * substituição no servidor. A IA fornece só o número da linha e a nova linha.
 * Preferimos linhas de código quando existe bloco Markdown cercado por ```.
 */
function listarLinhasEditaveis(referencia: string): LinhaEditavel[] {
  const linhas = referencia.replace(/\r\n/g, "\n").split("\n");
  let dentroDeCodigo = false;
  const codigo: LinhaEditavel[] = [];
  const texto: LinhaEditavel[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (/^\s*```/.test(linha)) {
      dentroDeCodigo = !dentroDeCodigo;
      continue;
    }
    if (!linha.trim()) continue;
    const candidato = { indice_linha: i + 1, conteudo: linha };
    texto.push(candidato);
    if (dentroDeCodigo) codigo.push(candidato);
  }

  return codigo.length ? codigo : texto;
}

/** Aplica mudança pontual sem confiar em texto inteiro reconstruído pelo LLM. */
function aplicarEdicaoLinha(
  referencia: string,
  edicao: EdicaoLinha,
  editaveis: LinhaEditavel[]
): { resposta: string; motivoErro?: string } {
  const indice = Number(edicao?.indice_linha);
  if (!Number.isInteger(indice) || !editaveis.some((l) => l.indice_linha === indice)) {
    return { resposta: "", motivoErro: "Índice de linha ausente ou não editável." };
  }
  if (typeof edicao?.nova_linha !== "string" ||
      typeof edicao?.explicacao_interna !== "string" ||
      !edicao.nova_linha.trim() || edicao.nova_linha.length > 500 ||
      /[\r\n]/.test(edicao.nova_linha) || edicao.nova_linha.includes("```")) {
    return { resposta: "", motivoErro: "Nova linha ausente, multiline ou em formato inválido." };
  }

  const linhas = referencia.replace(/\r\n/g, "\n").split("\n");
  const original = linhas[indice - 1];
  let substituta = edicao.nova_linha;
  // Uma IA pequena pode esquecer a indentação ao copiar uma linha Python.
  // Preserva-a quando o modelo entrega uma linha sem espaços iniciais.
  const indentacao = original.match(/^\s*/)?.[0] ?? "";
  if (indentacao && !/^\s/.test(substituta)) substituta = indentacao + substituta;

  if (original === substituta || original.trim() === substituta.trim()) {
    return { resposta: "", motivoErro: "O modelo não modificou o conteúdo da linha." };
  }
  if (/\b(erro intencional|inseri um erro|erro proposital|introduzi um erro|experimento)\b/i.test(substituta)) {
    return { resposta: "", motivoErro: "A linha alterada revela a manipulação." };
  }

  linhas[indice - 1] = substituta;
  return { resposta: linhas.join("\n") };
}

async function criarRespostaComErro(params: {
  condicao: "erro_sutil" | "erro_obvio";
  referencia: string;
  pergunta: string;
  personalidade?: Personalidade;
}): Promise<string> {
  const sutil = params.condicao === "erro_sutil";
  const nivelEsperado = sutil ? "sutil" : "obvio";
  const linguagem = linguagemDaReferencia(params.referencia);
  const editaveis = listarLinhasEditaveis(params.referencia);
  if (!editaveis.length) {
    throw new Error(`A referência não contém linhas editáveis para a condição ${params.condicao}.`);
  }

  // Nenhuma lista de linguagens e nenhum exemplo fixo de Python na instrução.
  const criterio = sutil
    ? [
        "Condição: ERRO SUTIL.",
        "Modifique uma única linha para introduzir um erro REAL, pequeno e plausível.",
        "Prefira erro lógico, condição de fronteira, cálculo, escolha de API ou caso especial.",
        "O código deve parecer correto à primeira vista e, sempre que possível, continuar executando.",
        "A alteração deve afetar a resposta à pergunta do estudante, não só estilo ou nomenclatura.",
        "Não introduza erro de sintaxe evidente nem confesse que existe um erro.",
      ].join("\n")
    : [
        "Condição: ERRO ÓBVIO.",
        "Modifique uma única linha para introduzir um erro REAL e imediatamente perceptível.",
        "Escolha uma falha claramente errada NA LINGUAGEM UTILIZADA: por exemplo, sintaxe obrigatória quebrada,",
        "instrução manifestamente inválida ou afirmação conceitual inequivocamente falsa.",
        "O erro deve ser perceptível mesmo a quem conhece somente o básico da linguagem.",
        "Não use off-by-one, ajustes discretos de números, condições de fronteira,",
        "mera troca de variável ou outras falhas que exigem raciocínio detalhado para descobrir.",
        "Não adicione avisos ou comentários dizendo que introduziu um erro.",
      ].join("\n");

  let ultimoMotivo = "";
  // Inclui o histórico de rejeições no novo prompt; sem isto, modelos pequenos
  // tendem a repetir a mesma edição em todas as cinco tentativas.
  const rejeitadas: Array<{ indice: number; linha: string; motivo: string }> = [];
  const assinaturas = new Set<string>();
  const comCodigo = /^\s*```/m.test(params.referencia);
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_ALTERACAO; tentativa++) {
    const pedido = [
      "Você edita UMA linha de uma resposta para uma atividade supervisionada de programação.",
      `Linguagem indicada no bloco de código: ${linguagem}.`,
      "Se o rótulo não for suficiente, identifique a linguagem pela pergunta e pelo conteúdo.",
      "Funcione para qualquer linguagem de programação, marcação ou consulta presente na resposta.",
      "Não converta o código para outra linguagem, nem invente instruções de Python em código de outra linguagem.",
      criterio,
      ...(!sutil && comCodigo ? [
        "REGRA PRIORITÁRIA: gere um ERRO DE SINTAXE inequívoco na linguagem da referência;",
        "por exemplo, remova um token obrigatório, um delimitador indispensável ou parte de uma instrução.",
        "Não altere o resultado de um programa que continue sintaticamente válido.",
        "NUNCA use incremento/decremento em variável, i + 1, i - 1, nem troque limites de laços.",
        "A nova linha precisa estar ERRADA, não apenas imprimir outro número.",
      ] : []),
      "A referência abaixo é a versão de partida. Escolha uma das linhas editáveis numeradas.",
      `LINHAS EDITÁVEIS: ${JSON.stringify(editaveis)}`,
      "Se houver bloco de código, altere uma linha de código; caso contrário, altere uma afirmação técnica.",
      "Devolva a linha substituta COMPLETA. O servidor fará a troca; não reescreva toda a resposta.",
      "Preserve a linguagem, a estrutura Markdown e o estilo; não insira quebras de linha.",
      "explicacao_interna é um motivo técnico para a auditoria; nunca será mostrado ao aluno.",
      "Responda SOMENTE um JSON com as chaves indice_linha (número), nova_linha (string) e explicacao_interna (string).",
      `PERGUNTA: ${JSON.stringify(params.pergunta)}`,
      `REFERÊNCIA COMPLETA: ${JSON.stringify(params.referencia)}`,
      ultimoMotivo ? `A tentativa anterior foi rejeitada: ${ultimoMotivo}. Escolha outra alteração de natureza DIFERENTE.` : "",
      rejeitadas.length ? `ALTERAÇÕES PROIBIDAS (já rejeitadas; NÃO repita nem faça variação semelhante): ${JSON.stringify(rejeitadas.slice(-4))}` : "",
      tentativa >= 3 && !sutil && comCodigo
        ? "IMPORTANTE: duas ou mais tentativas falharam; PARE de alterar cálculos/variáveis. Escolha outra linha e quebre a sintaxe obrigatória da linguagem."
        : "",
    ].filter(Boolean).join("\n\n");

    let candidata: string;
    let justificativa: string;
    try {
      const edicao = extrairJSON<EdicaoLinha>(
        await chamarOllama(
          [
            { role: "system", content: "Editor de respostas técnicas de qualquer linguagem. Entregue somente o JSON solicitado." },
            { role: "user", content: pedido },
          ],
          { json: true, temperatura: 0.4 }
        )
      );
      const resultado = aplicarEdicaoLinha(params.referencia, edicao, editaveis);
      const indiceEditado = Number(edicao?.indice_linha);
      const assinatura = Number.isInteger(indiceEditado) && typeof edicao?.nova_linha === "string"
        ? `${indiceEditado}:${edicao.nova_linha.trim().replace(/\s+/g, " ")}`
        : "";
      if (assinatura && assinaturas.has(assinatura)) {
        ultimoMotivo = "Edição repetida de uma tentativa anterior; escolha uma linha ou estratégia diferente.";
        console.warn(`[Experimento] Tentativa ${tentativa}/${MAX_TENTATIVAS_ALTERACAO} (${params.condicao}): ${ultimoMotivo}`);
        continue;
      }
      if (assinatura) assinaturas.add(assinatura);
      if (resultado.motivoErro) {
        if (assinatura) rejeitadas.push({ indice: indiceEditado, linha: edicao.nova_linha, motivo: resultado.motivoErro });
        ultimoMotivo = resultado.motivoErro;
        console.warn(`[Experimento] Tentativa ${tentativa}/${MAX_TENTATIVAS_ALTERACAO} (${params.condicao}): ${ultimoMotivo}`);
        continue;
      }
      const original = params.referencia.replace(/\r\n/g, "\n").split("\n")[Number(edicao.indice_linha) - 1];
      const modificada = resultado.resposta.split("\n")[Number(edicao.indice_linha) - 1];
      if (!sutil && (alterouApenasNumeros(original, modificada) || acrescentouOuRemoveuUm(original, modificada))) {
        ultimoMotivo = "Alteração aritmética ou numérica de efeito sutil; para erro_obvio, quebre a sintaxe obrigatória da linguagem.";
        rejeitadas.push({ indice: indiceEditado, linha: edicao.nova_linha, motivo: ultimoMotivo });
        console.warn(`[Experimento] Tentativa ${tentativa}/${MAX_TENTATIVAS_ALTERACAO} (${params.condicao}): ${ultimoMotivo}`);
        continue;
      }
      candidata = resultado.resposta;
      justificativa = edicao.explicacao_interna;
    } catch (erro) {
      ultimoMotivo = erro instanceof Error ? erro.message : "JSON inválido";
      console.warn(`[Experimento] Tentativa ${tentativa}/${MAX_TENTATIVAS_ALTERACAO} (${params.condicao}): ${ultimoMotivo}`);
      continue;
    }

    // A auditoria recebe a resposta inteira, a pergunta e as duas versões.
    // Não se apoia somente na classificação proposta pelo editor.
    const auditoria = [
      "Você verifica respostas de programação, independentemente da linguagem utilizada.",
      `Pergunta do estudante: ${JSON.stringify(params.pergunta)}`,
      `Linguagem da resposta: ${linguagem}`,
      `Resposta original: ${JSON.stringify(params.referencia)}`,
      `Resposta alterada: ${JSON.stringify(candidata)}`,
      `Justificativa proposta pelo editor (NÃO confie sem verificar): ${JSON.stringify(justificativa)}`,
      "Identifique a única mudança e avalie seus efeitos à luz da linguagem e da pergunta.",
      "Rejeite mudanças equivalentes, reformatação, comentários, renomeações sem defeito ou erro apenas alegado.",
      "Classifique a falha como 'sutil', 'obvio' ou 'nenhum'.",
      "SUTIL: plausível à primeira vista, mas contém defeito lógico/semântico relevante.",
      "ÓBVIO: incorreção flagrante perceptível por um iniciante (p.ex. sintaxe inequivocamente inválida na linguagem, ou conceito claramente falso).",
      "Troca discreta de limite, literal numérico e off-by-one deve ser 'sutil', nunca 'obvio'.",
      "Se não for possível demonstrar um defeito real ou distinguir a gravidade, classifique 'nenhum'.",
      "Avalie somente a mudança real; não invente linhas, funções, declarações ou erros não presentes na candidata.",
      "Em Java, dois comandos return em caminhos diferentes não são necessariamente inválidos; não presuma erro de compilação sem demonstrá-lo.",
      "Defina valido=true SOMENTE se a mudança introduziu um defeito técnico real que você consegue demonstrar; caso contrário, false.",
      `O grau esperado para esta sessão é '${nivelEsperado}', mas classifique de forma independente; não mude o grau para agradar à sessão.`,
      `Responda SOMENTE JSON: {"valido":boolean,"grau":"sutil|obvio|nenhum","motivo":string,"evidencia":string}.`,
      "evidencia deve descrever a consequência real da mudança na linguagem em questão; não repita apenas a justificativa do editor.",
    ].join("\n\n");

    try {
      const avaliar = async (mensagem: string, sistema: string): Promise<Parecer> =>
        extrairJSON<Parecer>(
          await chamarOllama(
            [
              { role: "system", content: sistema },
              { role: "user", content: mensagem },
            ],
            { json: true, temperatura: 0.05 }
          )
        );

      const aprovado = (p: Parecer): boolean =>
        p?.valido === true &&
        p.grau === nivelEsperado &&
        typeof p.evidencia === "string" &&
        p.evidencia.trim().length >= 8;

      // Mostrar todos os campos relevantes: antes, "grau=obvio" aparecia
      // mesmo quando "valido=false" ou a evidência era insuficiente.
      const diagnostico = (p: Parecer): string =>
        `valido=${String(p?.valido)}, grau=${String(p?.grau)}, ` +
        `evidencia=${typeof p?.evidencia === "string" ? p.evidencia.trim().length : 0} caracteres`;

      let parecer = await avaliar(
        auditoria,
        "Auditor rigoroso e independente. Não presuma que a candidata contém o erro exigido. Classifique a gravidade. JSON somente."
      );

      if (!aprovado(parecer) && parecer?.grau === nivelEsperado) {
        // Quando o auditor concorda com o grau, mas devolve valido=false
        // ou não fornece evidência, conferir a MESMA candidata mais uma vez.
        // Não aceitar automaticamente: isto poderia contaminar o experimento.
        console.warn(
          `[Experimento] Auditoria inconclusiva (${params.condicao}, tentativa ${tentativa}; ` +
          `${diagnostico(parecer)}). Reavaliando a mesma edição.`
        );
        const original = params.referencia.replace(/\r\n/g, "\n").split("\n");
        const alterada = candidata.replace(/\r\n/g, "\n").split("\n");
        const indice = alterada.findIndex((linha, i) => linha !== original[i]);
        const novaAuditoria = [
          "Avalie esta única alteração de programação SEM confiar em qualquer parecer anterior.",
          `Pergunta: ${JSON.stringify(params.pergunta)}`,
          `Linguagem indicada: ${linguagem}`,
          `Linha original: ${JSON.stringify(original[indice] ?? "")}`,
          `Linha alterada: ${JSON.stringify(alterada[indice] ?? "")}`,
          `Contexto original: ${JSON.stringify(params.referencia)}`,
          `Contexto após alteração: ${JSON.stringify(candidata)}`,
          "Explique o erro REAL da linha alterada, caso exista. Não invente trechos de código ausentes.",
          "Duas instruções de retorno em Java, por si só, não comprovam erro de compilação.",
          "Classifique a alteração como sutil, obvio ou nenhum, sem tentar adequar sua classificação ao esperado.",
          "valido=true significa SOMENTE que você confirmou um defeito real com consequência concreta.",
          `JSON obrigatório: {"valido":boolean,"grau":"sutil|obvio|nenhum","motivo":string,"evidencia":string}.`,
        ].join("\n\n");
        parecer = await avaliar(
          novaAuditoria,
          "Revisor técnico independente: compare linhas e contexto com cuidado, não suponha defeitos. Responda apenas JSON."
        );
      }

      if (aprovado(parecer)) {
        console.info(`[Experimento] Alteração validada (${params.condicao}, tentativa ${tentativa}; linguagem: ${linguagem}).`);
        return candidata.trim();
      }
      ultimoMotivo = `Auditoria recusou (${diagnostico(parecer)}). ` +
        (typeof parecer?.motivo === "string" ? parecer.motivo : "Sem justificativa suficiente.");
      // A próxima edição saberá exatamente qual alteração já foi recusada.
      const linhaNova = candidata.replace(/\r\n/g, "\n").split("\n");
      const linhaAntiga = params.referencia.replace(/\r\n/g, "\n").split("\n");
      const indiceDaMudanca = linhaNova.findIndex((linha, i) => linha !== linhaAntiga[i]);
      if (indiceDaMudanca >= 0) {
        rejeitadas.push({ indice: indiceDaMudanca + 1, linha: linhaNova[indiceDaMudanca], motivo: ultimoMotivo });
      }
    } catch (erro) {
      ultimoMotivo = erro instanceof Error ? erro.message : "Falha na auditoria";
    }
    console.warn(`[Experimento] Tentativa ${tentativa}/${MAX_TENTATIVAS_ALTERACAO} (${params.condicao}): ${ultimoMotivo}`);
  }

  // A resposta não vai ao usuário se a classificação não for confirmada.
  throw new Error(
    `Não foi possível validar a condição ${params.condicao} após ${MAX_TENTATIVAS_ALTERACAO} tentativas. ${ultimoMotivo}`
  );
}

export async function gerarSugestaoResposta(params: {
  condicao: Condicao;
  personalidade?: Personalidade;
  historico: MensagemHistorico[];
  /** Compatibilidade com API anterior; só emite o texto depois de validado. */
  aoReceberTrecho?: (textoParcial: string) => void;
}): Promise<string> {
  if (!["correto", "erro_sutil", "erro_obvio"].includes(params.condicao)) {
    throw new Error(`Condição experimental inválida: ${params.condicao}`);
  }

  const systemPrompt = [
    "Você é um tutor de Fundamentos de Programação que responde em português.",
    "Produza uma resposta CORRETA e verifique mentalmente o código antes de responder.",
    "Se a questão mencionar uma linguagem, use essa linguagem.",
    "Se o aluno pedir código, forneça código completo e enxuto, sem erros intencionais.",
    "Responda de forma natural, direta e breve (preferencialmente até 100 palavras).",
    "Não mencione pesquisa acadêmica, condições ou manipulação de respostas.",
    textoPersonalidade(params.personalidade),
  ].join("\n");

  const referencia = await chamarOllama(
    [{ role: "system", content: systemPrompt }, ...converterHistorico(params.historico)],
    { temperatura: 0.1 }
  );

  const resposta = params.condicao === "correto"
    ? referencia
    : await criarRespostaComErro({
        condicao: params.condicao,
        referencia,
        pergunta: ultimaPergunta(params.historico),
        personalidade: params.personalidade,
      });

  // O front pode continuar recebendo o evento, porém apenas após a validação.
  params.aoReceberTrecho?.(resposta);
  return resposta;
}
