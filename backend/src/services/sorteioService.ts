import { prisma } from "../db";
import { Personalidade, PERSONALIDADES } from "../types";

/**
 * Sorteio simples: cada sessão recebe uma personalidade ao acaso.
 * Em amostras pequenas, os grupos podem ficar desiguais.
 */
export function sortearPersonalidade(): Personalidade {
  return PERSONALIDADES[Math.floor(Math.random() * PERSONALIDADES.length)];
}

/**
 * Sorteio equilibrado: escolhe, entre as personalidades menos usadas até
 * agora, uma ao acaso. Mantém os 3 grupos com tamanhos quase iguais.
 */
export async function sortearPersonalidadeEquilibrada(): Promise<Personalidade> {
  const contagens = await prisma.sessao.groupBy({
    by: ["personalidade"],
    _count: { _all: true },
  });

  const usos = new Map<string, number>(
    contagens.map((c) => [c.personalidade, c._count._all])
  );

  const menorUso = Math.min(...PERSONALIDADES.map((p) => usos.get(p) ?? 0));
  const candidatas = PERSONALIDADES.filter((p) => (usos.get(p) ?? 0) === menorUso);

  return candidatas[Math.floor(Math.random() * candidatas.length)];
}
