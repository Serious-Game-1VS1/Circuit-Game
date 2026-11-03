/** Reloj de la partida: igual que Date.now() pero se detiene mientras la guía «NUEVO» está abierta (solo en solitario; en duelo nunca se pausa). */
let desfase = 0, desde = 0;
export const ahoraJuego = (): number => Date.now() - desfase - (desde ? Date.now() - desde : 0);
export function pausarJuego(v: boolean): void {
  const t = Date.now();
  if (v && !desde) desde = t;
  else if (!v && desde) { desfase += t - desde; desde = 0; }
}
export const juegoPausado = (): boolean => desde > 0;
