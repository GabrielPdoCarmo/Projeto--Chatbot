# Backend do experimento

Backend canal-agnóstico: hoje serve o piloto web, e quando a fase WhatsApp
começar, o *mesmo* backend recebe as mensagens — só muda como elas chegam
e saem (socket vs. webhook).

Não existe Wizard humano nem banco de problemas pré-cadastrado. O aluno
traz sua própria dúvida/problema livremente no chat, e a IA (Gemini)
responde automaticamente a cada mensagem — seguindo o roteiro da
**condição** sorteada pra aquela sessão (`correto`, `erro_sutil`,
`erro_obvio`), sem nunca revelar isso ao participante.

## Como rodar (piloto local)

```bash
cd backend
npm install
cp .env.example .env
# edite o .env e cole sua GEMINI_API_KEY (grátis em https://aistudio.google.com/apikey)

npm run prisma:migrate   # cria o banco SQLite e as tabelas

npm run dev                # sobe o servidor em http://localhost:4000
```

## Estrutura

```
backend/
  prisma/schema.prisma       -> modelo de dados (Participante, Sessao, Mensagem)
  src/
    server.ts                 -> Express + Socket.io (canal WEB de hoje)
    services/
      mensagemService.ts       -> lógica central: salva mensagem do participante e gera resposta automática
      sessaoService.ts          -> criação de participante e sessão (com condição sorteada)
      iaService.ts               -> chamada à API do Gemini
    routes/
      participantes.ts          -> POST /api/participantes
      sessoes.ts                 -> POST /api/sessoes, GET /:id, GET /:id/mensagens
```

## Fluxo esperado do app web (Inicio -> Instrucoes -> Chatbot)

1. Ao clicar "Iniciar experimento" em `Inicio.tsx`: `POST /api/participantes`
   → guarda o `participanteId` retornado para usar nas próximas telas.
2. Ao entrar em `Chatbot.tsx`: `POST /api/sessoes` com `{ participanteId, canal: "web" }`
   → recebe `{ sessao }` já com uma `condicao` sorteada (nunca exibida ao
   participante).
3. Conectar via socket.io, emitir `entrar_sessao` com `{ sessaoId }`.
4. Ao enviar mensagem: emitir `mensagem_participante` com `{ sessaoId, texto }`.
5. O backend salva a mensagem, emite `assistente_digitando` (pro chat
   mostrar um indicador de carregamento), chama o Gemini, e emite
   `nova_mensagem` com a resposta assim que ela chega.

## Migração futura para WhatsApp

Criar `src/routes/webhookWhatsapp.ts`, que:
1. Recebe o payload do webhook da Cloud API da Meta.
2. Identifica/cria a sessão correspondente ao número de telefone.
3. Chama `receberMensagemParticipante(io, { sessaoId, texto })` — a MESMA
   função usada pelo canal web (ela já cuida de gerar e emitir a
   resposta automática).
4. Nesse handler, além de emitir `nova_mensagem`, também chame a API do
   WhatsApp para efetivamente entregar o texto da resposta.
