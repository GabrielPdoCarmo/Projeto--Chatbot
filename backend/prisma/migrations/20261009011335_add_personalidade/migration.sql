-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Sessao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participanteId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "condicao" TEXT NOT NULL,
    "personalidade" TEXT NOT NULL DEFAULT 'formal',
    "iniciadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEm" DATETIME,
    CONSTRAINT "Sessao_participanteId_fkey" FOREIGN KEY ("participanteId") REFERENCES "Participante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Sessao" ("canal", "condicao", "finalizadaEm", "id", "iniciadaEm", "participanteId") SELECT "canal", "condicao", "finalizadaEm", "id", "iniciadaEm", "participanteId" FROM "Sessao";
DROP TABLE "Sessao";
ALTER TABLE "new_Sessao" RENAME TO "Sessao";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
