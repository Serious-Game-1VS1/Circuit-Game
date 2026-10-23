// src/multimetro.ts

export const MEDIR_MS = 1000;

export interface Medida {
  t?: 'medida';
  seq?: number;
  modo?: 'tension' | 'continuidad';
  pasa?: boolean;
  tension?: 'nada' | 'parte' | 'toda';
  fraccion?: number;
  punto?: string;
  vPila?: number;
  vMedido?: number;
  v?: number;
}

export function anguloTension(v: number): number {
  if (v <= 0) return -60;
  if (v >= 1) return 60;
  return -60 + v * 120;
}

export function textoMedida(medida?: Medida): string {
  if (!medida) return '';
  if (medida.modo === 'continuidad') {
    return medida.pasa ? 'Pasa: hay continuidad' : 'No pasa: el camino está cortado';
  }
  if (medida.tension === 'toda' || medida.vMedido === 1 || medida.v === 1 || medida.pasa === false) {
    return 'El camino está cortado';
  }
  if (medida.fraccion !== undefined) {
    const vPila = medida.vPila ?? 0;
    return `${(vPila * medida.fraccion).toFixed(2)} V`;
  }
  const valor = medida.vMedido ?? medida.v ?? 0;
  return `${valor.toFixed(2)} V`;
}

export function textoModo(modo: 'continuidad' | 'tension'): string {
  return modo === 'continuidad'
    ? 'Batería desconectada para medir continuidad'
    : 'Batería conectada para medir tensión';
}

export function lecturaLista(
  solicitud: { seq: number; desde: number; punto: string },
  respuesta: Medida | undefined,
  ahora: number
): Medida | null {
  if (!respuesta || respuesta.seq !== solicitud.seq) return null;
  if (ahora - solicitud.desde < MEDIR_MS) return null;
  return respuesta;
}

export class Multimetro {
  private modo: 'VOLT' | 'AMP' | 'OFF' = 'OFF';

  public setModo(nuevoModo: 'VOLT' | 'AMP' | 'OFF'): void {
    this.modo = nuevoModo;
  }

  public medir(voltaje: number, corriente: number): string {
    if (this.modo === 'OFF') return '0.00';
    if (this.modo === 'VOLT') return `${voltaje.toFixed(2)} V`;
    if (this.modo === 'AMP') return `${(corriente * 1000).toFixed(1)} mA`;
    return '0.00';
  }
}