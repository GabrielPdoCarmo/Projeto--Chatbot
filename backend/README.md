# Backend do experimento (Wizard of Oz)

Backend canal-agnóstico: hoje serve o piloto web, e quando a fase WhatsApp
começar, o *mesmo* backend recebe as mensagens — só muda como elas chegam
e saem (socket vs. webhook).

Não existe mais um banco de problemas pré-cadastrado: o aluno traz sua
própria dúvida/problema livremente no chat. O que o pesquisador controla é
a **condição** de cada sessão (sorteada ao abrir a conversa): como o
Wizard deve se comportar (`correto`, `erro_sutil`, `erro_obvio`),
independente do que o aluno perguntar.

## Como rodar (piloto local)

```bash
cd backend
npm install
cp .env.example .env

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
      mensagemService.ts       -> lógica central: receber msg do participante / responder como wizard
      sessaoService.ts          -> criação de participante e sessão (com condição sorteada)
    routes/
      participantes.ts          -> POST /api/participantes
      sessoes.ts                 -> POST /api/sessoes, GET /:id, GET /:id/mensagens
```

## Fluxo esperado do app web (Inicio -> Instrucoes -> Chatbot)

1. Ao clicar "Iniciar experimento" em `Inicio.tsx`: `POST /api/participantes`
   → guarda o `participanteId` retornado para usar nas próximas telas.
2. Ao entrar em `Chatbot.tsx`: `POST /api/sessoes` com `{ participanteId, canal: "web" }`
   → recebe `{ sessao }` já com uma `condicao` sorteada (o aluno nunca vê
   esse campo — ele é só para o painel do Wizard).
3. Conectar via socket.io, emitir `entrar_sessao` com `{ sessaoId, papel: "participante" }`.
4. Ao enviar mensagem: emitir `mensagem_participante` com `{ sessaoId, texto }`.
5. Escutar o evento `nova_mensagem` para exibir tanto a própria mensagem
   confirmada quanto a resposta do Wizard.

## Painel do Wizard (próxima peça a construir)

Vai ser um segundo app/rota React que:
- conecta via socket.io com `entrar_sessao` e `papel: "wizard"`
- escuta `mensagem_para_wizard` para ver, em tempo real, mensagens de
  *qualquer* sessão ativa, junto com a `condicao` daquela sessão (para o
  pesquisador saber que tipo de resposta deve dar: sempre correta, com
  erro sutil, ou com erro óbvio)
- ao responder, também precisa dar `entrar_sessao` com o `sessaoId`
  específico daquela conversa antes de emitir `resposta_wizard`

## Migração futura para WhatsApp

Criar `src/routes/webhookWhatsapp.ts`, que:
1. Recebe o payload do webhook da Cloud API da Meta.
2. Identifica/cria a sessão correspondente ao número de telefone.
3. Chama `receberMensagemParticipante(io, { sessaoId, texto })` — a MESMA
   função usada pelo canal web.
4. Quando o Wizard responder (via `enviarRespostaWizard`), esse handler
   também precisa, nesse caso, chamar a API do WhatsApp para efetivamente
   entregar a mensagem.
