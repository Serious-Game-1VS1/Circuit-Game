import type { FilaFallos, Partida } from "./types.js";

/**
 * Tabla de fallos por zona/circuito a partir de `repasar` de cada jugador. Las partidas demo se ignoran
 * (son ensayos). `jugadores` = cuántos jugadores fallaron ahí al menos una vez. Más fallos primero.
 */
export function fallosPorZona(partidas: readonly Partida[]): FilaFallos[] {
  const filas = new Map<string, FilaFallos>();
  for (const p of partidas) {
    if (p.demo) continue;
    for (const j of p.jugadores) {
      for (const r of j.repasar) {
        const f = filas.get(`${r.zona}/${r.circuito}`) ?? { zona: r.zona, circuito: r.circuito, fallos: 0, quemadas: 0, jugadores: 0 };
        f.fallos += r.fallos;
        f.quemadas += r.quemadas;
        f.jugadores++;
        filas.set(`${r.zona}/${r.circuito}`, f);
      }
    }
  }
  return [...filas.values()].sort((a, b) => b.fallos - a.fallos);
}
