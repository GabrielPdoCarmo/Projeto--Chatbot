-- CreateTable
CREATE TABLE "Participante" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grupo" TEXT NOT NULL DEFAULT 'unico',
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Sessao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participanteId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "condicao" TEXT NOT NULL,
    "iniciadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" DATETIME,
    CONSTRAINT "Sessao_participanteId_fkey" FOREIGN KEY ("participanteId") REFERENCES "Participante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessaoId" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Mensagem_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "Sessao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
