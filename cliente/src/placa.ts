/**
 * Placa 4×4 de Cabina y Turbina, sin Phaser (se prueba en test/placa.test.ts). El jugador arrastra
 * las dos cargas de la gaveta a la placa (cada una ocupa dos casillas en vertical) y une puntos con
 * cables curvos. CARGAS = posición por defecto (columnas 1 y 2, filas 1 y 2), la que usan las pruebas.
 * El cliente no decide si está bien: traduce los cables al montaje que entiende el árbitro.
 *
 * Coordenadas: las del sprite `placa_4x4` (100×80, casillas de 16 px cada 17 px, riel + a la
 * izquierda y riel − a la derecha) multiplicadas por la escala K.
 */
import type { Circuito } from "../../spike/src/protocol";

/** "+" y "-" son los rieles; "f,c" una casilla (fila, columna de 0 a 3). */
export type Punto = string;
export interface Cable { a: Punto; b: Punto }
export interface Carga { punto: "carga1" | "carga2"; col: number; a: Punto; b: Punto }

export const K = 3;
export const ANCHO = 100 * K, ALTO = 80 * K;
export const CASILLAS: Punto[] = [0, 1, 2, 3].flatMap((f) => [0, 1, 2, 3].map((c) => `${f},${c}`));
export const PUNTOS: Punto[] = ["+", "-", ...CASILLAS];
export const CARGAS: Carga[] = [
  { punto: "carga1", col: 1, a: "1,1", b: "2,1" },
  { punto: "carga2", col: 2, a: "1,2", b: "2,2" },
];

/** Solo Cabina (luces) y Turbina (interruptor) llevan placa con cables. */
export const conPlaca = (c: Circuito) => c === "luces" || c === "interruptor";

const fc = (p: Punto) => p.split(",").map(Number) as [number, number];
/** Centro de una casilla, o del riel a la altura `y` (por defecto, el centro del riel). */
export function coord(p: Punto, y = ALTO / 2): { x: number; y: number } {
  if (p === "+") return { x: 9 * K, y };
  if (p === "-") return { x: 91 * K, y };
  const [f, c] = fc(p);
  return { x: (24 + 17 * c) * K, y: (14 + 17 * f) * K };
}
/** Extremos de un cable: en un riel, el cable llega a la altura del otro extremo. */
export const extremos = (c: Cable) => ({ a: coord(c.a, coord(c.b).y), b: coord(c.b, coord(c.a).y) });

/** Punto bajo (x, y). Casillas de 17·K px de paso (≥ 44 px con K = 3); los rieles ocupan los bordes. */
export function puntoEn(x: number, y: number): Punto | null {
  if (y < 4 * K || y > 76 * K) return null;
  if (x < -4 * K || x > ANCHO + 4 * K) return null; // los rieles se tocan también un poco por fuera
  if (x < 16 * K) return "+";
  if (x >= 84 * K) return "-";
  const c = Math.floor((x - 16 * K) / (17 * K)), f = Math.floor((y - 6 * K) / (17 * K));
  return f >= 0 && f <= 3 && c >= 0 && c <= 3 ? `${f},${c}` : null;
}

/**
 * Control de la curva cuadrática (la del prototipo v3, más arqueada): curvos para distinguir los que
 * se cruzan, y con el medio entre filas/columnas para poder tocarlos sin tocar una casilla.
 */
export function control(x1: number, y1: number, x2: number, y2: number, i: number) {
  const recto = Math.abs(y1 - y2) < 1;
  return { x: (x1 + x2) / 2 + (i % 2 ? 40 : -40) * (recto ? 0 : 1), y: (y1 + y2) / 2 + (recto ? -50 : 0) };
}
/** Puntos de la curva del cable i (para pintarla y para tocarla). */
export function curva(c: Cable, i: number, n = 20) {
  const { a, b } = extremos(c), q = control(a.x, a.y, b.x, b.y, i);
  return Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n, u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * q.x + t * t * b.x, y: u * u * a.y + 2 * u * t * q.y + t * t * b.y };
  });
}

// Un cable se toca a ≤ 22 px de su curva (objetivo de 44 px) y lejos de sus extremos (allí manda la casilla).
/** Índice del cable bajo (x, y), o -1. */
export function cableEn(cables: Cable[], x: number, y: number): number {
  let mejor = -1, dMin = 22;
  cables.forEach((c, i) => {
    const pts = curva(c, i), ini = pts[0]!, fin = pts.at(-1)!;
    for (const p of pts) {
      if (Math.hypot(p.x - ini.x, p.y - ini.y) < 26 || Math.hypot(p.x - fin.x, p.y - fin.y) < 26) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= dMin) { dMin = d; mejor = i; }
    }
  });
  return mejor;
}

/** Cable que quita un toque en (x, y), o -1: cerca del centro de una casilla manda la casilla (un cable puede pasar por encima). */
export function cableTocado(cables: Cable[], x: number, y: number): number {
  const p = puntoEn(x, y);
  if (p && p.includes(",") && Math.hypot(coord(p).x - x, coord(p).y - y) < 18) return -1;
  return cableEn(cables, x, y);
}

/** Un riel no se une consigo mismo; cualquier otro punto distinto del origen sirve (el árbitro decide el resto). */
export const esDestino = (a: Punto | null | undefined, p: Punto | null | undefined) => !!a && !!p && a !== p;

/** Cables con uno nuevo de a a b; null si no sirve (mismo punto o cable repetido). */
export function ponerCable(cables: Cable[], a: Punto, b: Punto): Cable[] | null {
  if (!esDestino(a, b) || cables.some((k) => (k.a === a && k.b === b) || (k.a === b && k.b === a))) return null;
  return [...cables, { a, b }];
}
export const quitarCable = (cables: Cable[], i: number) => cables.filter((_, k) => k !== i);

/** Color del cable: rojo si toca el +, azul si toca el −, amarillo entre casillas. */
export const colorCable = (c: Cable) => (c.a === "+" || c.b === "+" ? 0xe8363c : c.a === "-" || c.b === "-" ? 0x3e6af0 : 0xf6c63a);

/** La carga que tiene un borne en ese punto (para medirla al tocarlo). */
export const cargaEn = (p: Punto | null, cargas: Carga[] = CARGAS) => cargas.find((k) => k.a === p || k.b === p);

/**
 * Piezas arrastradas a la placa: casilla de arriba de cada carga (ocupa esa y la de abajo, en vertical).
 * Si falta una, sigue en la gaveta. La gaveta trae las dos cargas de CARGAS (2 focos, o motor e interruptor).
 */
export type Puestas = Partial<Record<Carga["punto"], Punto>>;
const abajo = (p: Punto) => { const [f, c] = fc(p); return `${f + 1},${c}`; };
/** Cargas ya puestas, con sus bornes (lo que entiende `montaje`). */
export const cargasPuestas = (puestas: Puestas): Carga[] => CARGAS.flatMap((k) => {
  const p = puestas[k.punto];
  return p ? [{ ...k, col: fc(p)[1], a: p, b: abajo(p) }] : [];
});
export const todasPuestas = (puestas: Puestas) => CARGAS.every((k) => !!puestas[k.punto]);
/** ¿Puede ir la carga con su borne de arriba en `p`? Casilla de las filas 0 a 2 y libre de la otra carga. */
export function ranuraValida(puestas: Puestas, carga: Carga["punto"], p: Punto | null): boolean {
  if (!p || !p.includes(",") || fc(p)[0] < 0 || fc(p)[0] > 2) return false;
  const ocupadas = cargasPuestas(puestas).filter((k) => k.punto !== carga).flatMap((k) => [k.a, k.b]);
  return !ocupadas.includes(p) && !ocupadas.includes(abajo(p));
}
/** Ranura bajo el centro de la pieza que se arrastra (el centro queda entre sus dos casillas). */
export function ranuraEn(x: number, y: number): Punto | null {
  const p = puntoEn(x, y);
  if (!p || !p.includes(",")) return null;
  const f = Math.min(2, Math.max(0, Math.round((y / K - 22.5) / 17)));
  return `${f},${fc(p)[1]}`;
}
/** Puestas con la carga en `p`, o null si no cabe ahí (la pieza vuelve a la gaveta). */
export const poner = (puestas: Puestas, carga: Carga["punto"], p: Punto | null): Puestas | null =>
  ranuraValida(puestas, carga, p) ? { ...puestas, [carga]: p! } : null;

/**
 * Montaje que el árbitro entiende ("serie" | "paralelo" | "puente") a partir de los cables, o null
 * si las cargas no quedan conectadas en ninguno de ellos (falta un cable, carga puenteada, etc.).
 */
// supuesto: el protocolo solo admite tres montajes; cualquier cable que una + con − cuenta como «puente» (corto), sea cual sea el resto.
export function montaje(cables: Cable[], cargas: Carga[] = CARGAS): "serie" | "paralelo" | "puente" | null {
  const padre = new Map(PUNTOS.map((p) => [p, p]));
  const raiz = (p: Punto): Punto => { const q = padre.get(p)!; return q === p ? p : raiz(q); };
  for (const c of cables) padre.set(raiz(c.a), raiz(c.b));
  const mas = raiz("+"), menos = raiz("-");
  if (mas === menos) return "puente";
  if (cargas.length < 2) return null; // falta poner una pieza en la placa
  const bornes = cargas.map((k) => [raiz(k.a), raiz(k.b)] as const);
  if (bornes.some(([a, b]) => a === b)) return null;
  const rieles = (a: Punto, b: Punto) => (a === mas && b === menos) || (a === menos && b === mas);
  if (bornes.every(([a, b]) => rieles(a, b))) return "paralelo";
  // Serie: las dos cargas comparten un nodo que no es riel, y sus otros bornes van uno al + y otro al −.
  const [[a1, b1], [a2, b2]] = bornes as [readonly [Punto, Punto], readonly [Punto, Punto]];
  for (const m of [a1, b1]) {
    if (m === mas || m === menos || (m !== a2 && m !== b2)) continue;
    const o1 = m === a1 ? b1 : a1, o2 = m === a2 ? b2 : a2;
    if (rieles(o1, o2)) return "serie";
  }
  return null;
}
