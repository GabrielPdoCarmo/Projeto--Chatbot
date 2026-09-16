import { PrismaClient } from "@prisma/client";

// Singleton simples — evita múltiplas conexões no modo dev com hot-reload.
export const prisma = new PrismaClient();
