const { test } = require("node:test");
const assert = require("node:assert/strict");
const { gerarSugestaoResposta } = require("../dist/services/iaService");

function simular(respostas) {
  const fetchOriginal = global.fetch;
  const chamadas = [];
  global.fetch = async (_url, init) => {
    chamadas.push(JSON.parse(init.body));
    const content = respostas.shift();
    if (content === undefined) throw new Error("Chamada ao modelo não prevista no teste");
    return { ok: true, json: async () => ({ message: { content } }) };
  };
  return { chamadas, restaurar: () => { global.fetch = fetchOriginal; } };
}

const entrada = (condicao, pergunta, aoReceberTrecho) => ({
  condicao,
  personalidade: "formal",
  historico: [{ origem: "participante", texto: pergunta }],
  aoReceberTrecho,
});
const editar = (indice_linha, nova_linha, explicacao_interna = "Esta alteração tem efeito concreto") =>
  JSON.stringify({ indice_linha, nova_linha, explicacao_interna });
const parecer = (grau, valido = true, evidencia = "A alteração produz um comportamento objetivamente incorreto") =>
  JSON.stringify({ valido, grau, motivo: "Análise técnica", evidencia });

const python = "Use:\n```python\nfor i in range(1, 6):\n    print(i)\n```";

test("correto: não edita a referência, apenas uma chamada", async () => {
  const mock = simular([python]);
  try {
    assert.equal(await gerarSugestaoResposta(entrada("correto", "Como imprimir de 1 a 5 em Python?")), python);
    assert.equal(mock.chamadas.length, 1);
  } finally { mock.restaurar(); }
});

test("erro_sutil Python: aceita mudança discreta aprovada como sutil", async () => {
  const mock = simular([python, editar(3, "for i in range(1, 5):"), parecer("sutil")]);
  const enviados = [];
  try {
    const result = await gerarSugestaoResposta(entrada("erro_sutil", "Como imprimir de 1 a 5 em Python?", (v) => enviados.push(v)));
    assert.match(result, /range\(1, 5\)/);
    assert.deepEqual(enviados, [result]);
    assert.equal(mock.chamadas.length, 3);
  } finally { mock.restaurar(); }
});

test("erro_obvio Python: rejeita off-by-one, mesmo que Qwen o sugira", async () => {
  const mock = simular([
    python,
    editar(3, "for i in range(1, 5):"),
    editar(3, "for i in range(1, 6)"),
    parecer("obvio"),
  ]);
  try {
    const result = await gerarSugestaoResposta(entrada("erro_obvio", "Como imprimir 1 a 5 em Python?"));
    assert.match(result, /for i in range\(1, 6\)\n/);
    assert.equal(mock.chamadas.length, 4); // sem gastar auditoria com troca numérica
  } finally { mock.restaurar(); }
});

test("erro_obvio: auditoria rejeita erro sutil e solicita nova alteração", async () => {
  const ref = "```java\nint resultado = 2 + 2;\n```";
  const mock = simular([
    ref, editar(2, "int resultado = 2 - 2;"), parecer("sutil"),
    editar(2, "int resultado = ;"), parecer("obvio"),
  ]);
  try {
    const result = await gerarSugestaoResposta(entrada("erro_obvio", "Como definir um inteiro em Java?"));
    assert.match(result, /int resultado = ;/);
    assert.equal(mock.chamadas.length, 5);
  } finally { mock.restaurar(); }
});

const linguagens = [
  ["Java", "```java\nint total = 5;\n```", "int total = ;", "Como declarar uma variável em Java?"],
  ["C++", "```cpp\nstd::cout << x;\n```", "std::cout << ;", "Como imprimir um valor em C++?"],
  ["SQL", "```sql\nSELECT nome FROM clientes;\n```", "SELEC nome FROM clientes;", "Como consultar nomes em SQL?"],
  ["HTML", "```html\n<h1>Olá</h1>\n```", "<h1 Olá</h1>", "Como criar um título em HTML?"],
  ["Rust", "```rust\nprintln!(\"Oi\");\n```", "println!(\"Oi\";", "Como escrever no console em Rust?"],
  ["C#", "```csharp\nConsole.WriteLine(\"Oi\");\n```", "Console.WriteLine(\"Oi\";", "Como imprimir texto em C#?"],
  ["Go", "```go\nfmt.Println(\"Oi\")\n```", "fmt.Println(\"Oi\"", "Como imprimir texto em Go?"],
  ["Kotlin", "```kotlin\nprintln(\"Oi\")\n```", "println(\"Oi\"", "Como imprimir texto em Kotlin?"],
];

for (const [nome, referencia, alteracao, pergunta] of linguagens) {
  test(`erro_obvio ${nome}: usa editor e auditor sem lista fechada de linguagens`, async () => {
    const mock = simular([referencia, editar(2, alteracao), parecer("obvio")]);
    try {
      const result = await gerarSugestaoResposta(entrada("erro_obvio", pergunta));
      assert.match(result, new RegExp(alteracao.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.equal(mock.chamadas.length, 3);
      assert.equal(mock.chamadas[1].format, "json");
      assert.match(mock.chamadas[1].messages[1].content, new RegExp(nome.toLowerCase() === "c++" ? "cpp" : nome === "C#" ? "csharp" : nome.toLowerCase()));
    } finally { mock.restaurar(); }
  });
}

test("erro_sutil SQL: troca discreta de condição, não depende da sintaxe Python", async () => {
  const original = "```sql\nSELECT * FROM pedidos WHERE valor >= 100;\n```";
  const mock = simular([original, editar(2, "SELECT * FROM pedidos WHERE valor > 100;"), parecer("sutil")]);
  try {
    const result = await gerarSugestaoResposta(entrada("erro_sutil", "SQL para pedidos de 100 ou mais?"));
    assert.match(result, /valor > 100/);
    assert.equal(mock.chamadas.length, 3);
  } finally { mock.restaurar(); }
});

test("erro_sutil HTML: alteração de comportamento em elemento de formulário", async () => {
  const original = "```html\n<button type=\"submit\">Enviar</button>\n```";
  const mock = simular([original, editar(2, '<button type="button">Enviar</button>'), parecer("sutil")]);
  try {
    const result = await gerarSugestaoResposta(entrada("erro_sutil", "Como enviar o formulário em HTML?"));
    assert.match(result, /type="button"/);
  } finally { mock.restaurar(); }
});

test("sem bloco de código: usa edição da afirmação técnica com auditoria", async () => {
  const referencia = "SQL usa SELECT para consultar registros.";
  const mock = simular([referencia, editar(1, "SQL usa DELETE para consultar registros."), parecer("obvio")]);
  try {
    const result = await gerarSugestaoResposta(entrada("erro_obvio", "Como consultar registros em SQL?"));
    assert.match(result, /DELETE/);
  } finally { mock.restaurar(); }
});

test("rejeita ausência de evidência e de classificação, mesmo com valido=true", async () => {
  const mock = simular([python, editar(3, "for i in range(1, 6)"), JSON.stringify({ valido: true, motivo: "OK" }), editar(4, "    print(i"), parecer("obvio")]);
  try {
    await gerarSugestaoResposta(entrada("erro_obvio", "Como usar Python?"));
    assert.equal(mock.chamadas.length, 5);
  } finally { mock.restaurar(); }
});

test("cinco edições inválidas falham sem enviar resposta ao participante", async () => {
  const mock = simular([python, ...Array(5).fill(editar(3, "for i in range(1, 6):"))]);
  const enviados = [];
  try {
    await assert.rejects(
      gerarSugestaoResposta(entrada("erro_sutil", "Como usar Python?", (m) => enviados.push(m))),
      /Não foi possível validar a condição erro_sutil após 5 tentativas/
    );
    assert.deepEqual(enviados, []);
    assert.equal(mock.chamadas.length, 6);
  } finally { mock.restaurar(); }
});

test("erro_obvio: rejeita print(i + 1), impede repetição e pede erro de sintaxe", async () => {
  const mock = simular([
    python,
    editar(4, "    print(i + 1)"),
    editar(4, "    print(i + 1)"),
    editar(3, "for i in range(1, 6)"),
    parecer("obvio"),
  ]);
  try {
    const resultado = await gerarSugestaoResposta(entrada("erro_obvio", "Como imprimir de 1 a 5 em Python?"));
    assert.match(resultado, /range\(1, 6\)\n/);
    assert.equal(mock.chamadas.length, 5);
    const pedido2 = mock.chamadas[2].messages[1].content;
    const pedido3 = mock.chamadas[3].messages[1].content;
    assert.match(pedido2, /ALTERAÇÕES PROIBIDAS/);
    assert.match(pedido2, /print\(i \+ 1\)/);
    assert.match(pedido3, /quebre a sintaxe obrigatória/);
  } finally { mock.restaurar(); }
});

test("erro_obvio: rejeição do auditor é registrada e repetições não são auditadas novamente", async () => {
  const referencia = "```java\nint resultado = 2 + 2;\n```";
  const mock = simular([
    referencia,
    editar(2, "int resultado = 2 * 2;"), parecer("sutil"),
    editar(2, "int resultado = 2 * 2;"),
    editar(2, "int resultado = ;"), parecer("obvio"),
  ]);
  try {
    const resultado = await gerarSugestaoResposta(entrada("erro_obvio", "Como declarar um inteiro em Java?"));
    assert.match(resultado, /int resultado = ;/);
    assert.equal(mock.chamadas.length, 6);
    assert.match(mock.chamadas[3].messages[1].content, /int resultado = 2 \* 2;/);
    assert.match(mock.chamadas[4].messages[1].content, /ou mais tentativas falharam/);
  } finally { mock.restaurar(); }
});

test("auditoria contraditória: grau obvio com valido=false reavalia mesma edição", async () => {
  const referencia = "```java\nstatic int soma(int a, int b) { return a + b; }\n```";
  const mock = simular([
    referencia,
    editar(2, "static int soma(int a, int b { return a + b; }"),
    parecer("obvio", false, "A declaração não possui fechamento do parêntese."),
    parecer("obvio", true, "O parêntese de fechamento dos parâmetros foi removido."),
  ]);
  try {
    const result = await gerarSugestaoResposta(entrada("erro_obvio", "Como somar dois inteiros em Java?"));
    assert.match(result, /int b \{/);
    assert.equal(mock.chamadas.length, 4);
    assert.match(mock.chamadas[3].messages[1].content, /Linha original:/);
    assert.match(mock.chamadas[3].messages[1].content, /Linha alterada:/);
  } finally { mock.restaurar(); }
});

test("não aprova auditoria contraditória se reavaliação não comprova defeito", async () => {
  const referencia = "```java\nint resultado = 2 + 2;\n```";
  const mock = simular([
    referencia,
    editar(2, "int resultado = 2 + 3;"),
    parecer("obvio", false, "Efeito aritmético."),
    parecer("sutil", true, "O valor calculado mudou, mas a expressão é válida."),
    editar(2, "int resultado = ;"),
    parecer("obvio", true, "Falta uma expressão entre o igual e o ponto e vírgula."),
  ]);
  try {
    const result = await gerarSugestaoResposta(entrada("erro_obvio", "Como definir resultado em Java?"));
    assert.match(result, /resultado = ;/);
    assert.equal(mock.chamadas.length, 6);
    assert.match(mock.chamadas[4].messages[1].content, /ALTERAÇÕES PROIBIDAS/);
  } finally { mock.restaurar(); }
});

test("auditoria inconclusiva sem evidência deve reavaliar a candidata", async () => {
  const mock = simular([
    python,
    editar(3, "for i in range(1, 6)"),
    parecer("obvio", true, ""),
    parecer("obvio", true, "Falta o caractere obrigatório ':' após a expressão do laço."),
  ]);
  try {
    const result = await gerarSugestaoResposta(entrada("erro_obvio", "Como imprimir de 1 a 5 em Python?"));
    assert.match(result, /range\(1, 6\)\n/);
    assert.equal(mock.chamadas.length, 4);
  } finally { mock.restaurar(); }
});
