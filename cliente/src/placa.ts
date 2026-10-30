/**
 * Placa 4×4 de Cabina y Turbina, sin Phaser (se prueba en test/placa.test.ts). El jugador arrastra
 * las dos cargas de la gaveta a la placa (cada una ocupa dos casillas en vertical) y une puntos con
 * cables rectos (ángulos de 90°). CARGAS = posición por defecto (columnas 1 y 2, filas 1 y 2), la que usan las pruebas.
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
 * Punto donde cae un cable soltado en (x, y): el aro de un pin (17 px) manda; si no, el carril si se suelta en su banda
 * (ampliada 6·K hacia la placa); si no, la casilla. Así soltar sobre el carril no se «engancha» al pin de una luz cercana.
 */
export function puntoSoltar(x: number, y: number): Punto | null {
  const p = puntoEn(x, y);
  if (!p) return null;
  if (p.includes(",") && Math.hypot(coord(p).x - x, coord(p).y - y) <= 17) return p;
  return x < 22 * K ? "+" : x >= 78 * K ? "-" : p;
}

export interface P2 { x: number; y: number }
const MEDIO = 8.5 * K; // de una casilla a la rendija (pasillo) entre columnas
const cuenta = (r1: P2[], r2: P2[]) => {
  let n = 0;
  for (let i = 0; i + 1 < r1.length; i++) for (let j = 0; j + 1 < r2.length; j++) {
    const [p, q, u, v] = [r1[i]!, r1[i + 1]!, r2[j]!, r2[j + 1]!];
    const hv = (h: [P2, P2], w: [P2, P2]) => h[0].y === h[1].y && w[0].x === w[1].x
      && w[0].x > Math.min(h[0].x, h[1].x) && w[0].x < Math.max(h[0].x, h[1].x) && h[0].y > Math.min(w[0].y, w[1].y) && h[0].y < Math.max(w[0].y, w[1].y);
    if (hv([p, q], [u, v]) || hv([u, v], [p, q])) n++;
  }
  return n;
};
const esRiel = (p: P2) => p.x < 50 || p.x > ANCHO - 50;
/** Rutas posibles de a a b con ángulos de 90°: recta, en Z por el pasillo junto a cada extremo, o en L. En la misma fila, también rodeando por el pasillo de arriba o de abajo. */
export function candidatas(a: P2, b: P2): P2[][] {
  const mismaFila = Math.abs(a.y - b.y) < 1, mismaCol = Math.abs(a.x - b.x) < 1;
  if (mismaCol && Math.abs(a.y - b.y) <= 17 * K + 1) return [[a, b]];
  if (mismaFila) {
    const s = Math.sign(b.x - a.x) || 1, xa = esRiel(a) ? a.x : a.x + s * MEDIO, xb = esRiel(b) ? b.x : b.x - s * MEDIO;
    return [[a, b], ...[-MEDIO, MEDIO].map((d) => [a, { x: xa, y: a.y }, { x: xa, y: a.y + d }, { x: xb, y: a.y + d }, { x: xb, y: b.y }, b])];
  }
  const s = mismaCol ? (a.x < ANCHO / 2 ? 1 : -1) : Math.sign(b.x - a.x);
  const z = (gx: number) => [a, { x: gx, y: a.y }, { x: gx, y: b.y }, b];
  return [z(a.x + s * MEDIO), z(b.x - s * MEDIO), [a, { x: b.x, y: a.y }, b], [a, { x: a.x, y: b.y }, b]];
}
const distSeg = (o: P2, p: P2, q: P2) => {
  const l2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2, t = l2 ? Math.max(0, Math.min(1, ((o.x - p.x) * (q.x - p.x) + (o.y - p.y) * (q.y - p.y)) / l2)) : 0;
  return Math.hypot(o.x - (p.x + t * (q.x - p.x)), o.y - (p.y + t * (q.y - p.y)));
};
/** Cuántos pines o cuerpos de piezas ajenas (no los extremos del cable) toca la ruta a menos de 22 px. */
export function pinesTocados(r: P2[], cargas: Carga[]): number {
  const [a, b] = [r[0]!, r.at(-1)!];
  const obst = cargas.flatMap((k) => { const A = coord(k.a), B = coord(k.b); return [A, B, { x: A.x, y: (A.y + B.y) / 2 }]; })
    .filter((o) => Math.hypot(o.x - a.x, o.y - a.y) > 2 && Math.hypot(o.x - b.x, o.y - b.y) > 2);
  return obst.filter((o) => r.slice(0, -1).some((p, i) => distSeg(o, p, r[i + 1]!) < 22)).length;
}
/** Ruta de cada cable: de las candidatas, la que menos pasa por pines ajenos y luego la que menos cruza a los cables anteriores (empate: la primera). */
export function rutas(cables: Cable[], cargas: Carga[] = []): P2[][] {
  const hechas: P2[][] = [];
  for (const c of cables) {
    const { a, b } = extremos(c);
    const peso = (r: P2[]) => 100 * pinesTocados(r, cargas) + hechas.reduce((n, h) => n + cuenta(r, h), 0);
    hechas.push(candidatas(a, b).reduce((m, r) => (peso(r) < peso(m) ? r : m)));
  }
  return hechas;
}
/** Puntos de una ruta cada ~6 px (para tocarla). */
const muestras = (r: P2[]): P2[] => r.slice(0, -1).flatMap((p, i) => {
  const q = r[i + 1]!, n = Math.max(1, Math.round(Math.hypot(q.x - p.x, q.y - p.y) / 6));
  return Array.from({ length: n }, (_, k) => ({ x: p.x + ((q.x - p.x) * k) / n, y: p.y + ((q.y - p.y) * k) / n }));
}).concat(r.slice(-1));

// Un cable se toca a ≤ 22 px de su ruta (objetivo de 44 px) y lejos de sus extremos (allí manda la casilla).
/** Índice del cable bajo (x, y), o -1. */
export function cableEn(cables: Cable[], x: number, y: number, cargas: Carga[] = []): number {
  let mejor = -1, dMin = 22;
  rutas(cables, cargas).forEach((r, i) => {
    const ini = r[0]!, fin = r.at(-1)!;
    for (const p of muestras(r)) {
      if (Math.hypot(p.x - ini.x, p.y - ini.y) < 26 || Math.hypot(p.x - fin.x, p.y - fin.y) < 26) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= dMin) { dMin = d; mejor = i; }
    }
  });
  return mejor;
}

/** Cable que quita un toque en (x, y), o -1: cerca del centro de una casilla manda la casilla (un cable puede pasar por encima). */
export function cableTocado(cables: Cable[], x: number, y: number, cargas: Carga[] = []): number {
  const p = puntoEn(x, y);
  if (p && p.includes(",") && Math.hypot(coord(p).x - x, coord(p).y - y) < 18) return -1;
  return cableEn(cables, x, y, cargas);
}

/** Un riel no se une consigo mismo; cualquier otro punto distinto del origen sirve (el árbitro decide el resto). */
export const esDestino = (a: Punto | null | undefined, p: Punto | null | undefined) => !!a && !!p && a !== p;

/** Solo los rieles y los bornes de las piezas puestas admiten cable: una casilla vacía no (soltar ahí dejaba un cable fantasma). */
export const conectable = (puestas: Puestas, p: Punto | null | undefined) =>
  !!p && (!p.includes(",") || cargasPuestas(puestas).some((k) => k.a === p || k.b === p));
/** ¿Sirve soltar un cable de a en p? Distintos y ambos conectables. */
export const destinoValido = (puestas: Puestas, a: Punto | null | undefined, p: Punto | null | undefined) =>
  esDestino(a, p) && conectable(puestas, a) && conectable(puestas, p);

/** Cables con uno nuevo de a a b; null si no sirve (mismo punto o cable repetido). */
export function ponerCable(cables: Cable[], a: Punto, b: Punto): Cable[] | null {
  if (!esDestino(a, b) || cables.some((k) => (k.a === a && k.b === b) || (k.a === b && k.b === a))) return null;
  return [...cables, { a, b }];
}
/** Por qué no sirve un cable de a a b (para decirlo al jugador). */
export const motivoCableNoValido = (cables: Cable[], a: Punto, b: Punto) =>
  a === b ? "Ese es el mismo punto: une un punto amarillo con un carril u otra pieza."
    : cables.some((k) => (k.a === a && k.b === b) || (k.a === b && k.b === a)) ? "Esos dos puntos ya tienen cable: toca el cable para quitarlo o une otro par."
    : "Une un punto amarillo con un carril.";
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

/** Pieza puesta cuyo cuerpo (entre sus dos bornes, sin 8 px de radio alrededor de cada pin; ~35 px tocables de 51) está bajo (x, y); null si no hay. */
export const piezaEn = (puestas: Puestas, x: number, y: number): Carga["punto"] | null =>
  cargasPuestas(puestas).find((k) => {
    const A = coord(k.a), B = coord(k.b);
    return Math.abs(x - A.x) <= 26 && y >= A.y && y <= B.y && Math.hypot(x - A.x, y - A.y) >= 8 && Math.hypot(x - B.x, y - B.y) >= 8;
  })?.punto ?? null;
/** Devuelve la pieza a la gaveta y quita los cables de sus dos bornes. */
export function quitarPieza(puestas: Puestas, cables: Cable[], carga: Carga["punto"]): { puestas: Puestas; cables: Cable[] } {
  const p = puestas[carga];
  if (!p) return { puestas, cables };
  const { [carga]: _fuera, ...resto } = puestas, bornes = [p, abajo(p)];
  return { puestas: resto, cables: cables.filter((c) => !bornes.includes(c.a) && !bornes.includes(c.b)) };
}

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

// ---- Mensajes específicos del cableado (solo texto: no cambian qué circuitos valen) ----
const NOMBRES: Record<"luces" | "interruptor", [string, string]> = { luces: ["la luz 1", "la luz 2"], interruptor: ["el motor", "el interruptor"] };
const mayus = (t: string) => t[0]!.toUpperCase() + t.slice(1);
/** Piezas sin colocar en la placa, con su nombre («Falta colocar: la luz 2.»); null si ya están todas. */
export function faltaColocar(puestas: Puestas, circuito: Circuito): string | null {
  const nombres = NOMBRES[circuito === "interruptor" ? "interruptor" : "luces"];
  const faltan = CARGAS.flatMap((k, i) => (puestas[k.punto] ? [] : [nombres[i]!]));
  return faltan.length ? `Falta colocar: ${faltan.join(" y ")}.` : null;
}
/** Cómo nombrar un punto: riel, punto superior/inferior de una pieza, o casilla libre. */
export function etiquetaPunto(circuito: Circuito, p: Punto, cargas: Carga[] = CARGAS): string {
  if (p === "+") return "el riel +";
  if (p === "-") return "el riel −";
  const nombres = NOMBRES[circuito === "interruptor" ? "interruptor" : "luces"];
  for (const k of cargas) {
    const n = nombres[CARGAS.findIndex((x) => x.punto === k.punto)]!;
    if (p === k.a) return `el punto superior (${n.replace(/^(el|la) /, "")})`;
    if (p === k.b) return `el punto inferior (${n.replace(/^(el|la) /, "")})`;
  }
  return "una casilla libre";
}
const unen = (cables: Cable[]) => montaje(cables) === "puente";
/** Cable que provoca el corto (+ con −): el primero que, al quitarlo, ya no lo hay. null si no hay corto. */
export function cableDelCorto(cables: Cable[]): Cable | null {
  if (!unen(cables)) return null;
  return cables.find((_, i) => !unen(quitarCable(cables, i))) ?? cables[0] ?? null;
}
export const textoCorto = (c: Cable, circuito: Circuito, cargas: Carga[] = CARGAS) =>
  `Ojo: el cable entre ${etiquetaPunto(circuito, c.a, cargas)} y ${etiquetaPunto(circuito, c.b, cargas)} hará corto. Tócalo para quitarlo.`;

/** Qué hay que corregir en el cableado para poder probar (texto para el botón CHECK gris). */
export function faltaCablear(cables: Cable[], circuito: Circuito, cargas: Carga[] = CARGAS): string {
  const corto = cableDelCorto(cables);
  if (corto) return textoCorto(corto, circuito, cargas);
  if (cargas.length < 2) return faltaColocar(Object.fromEntries(cargas.map((k) => [k.punto, k.a])), circuito) ?? "Arrastra cada pieza a la placa.";
  const nombres = NOMBRES[circuito === "interruptor" ? "interruptor" : "luces"];
  for (const k of cargas) {
    const n = nombres[CARGAS.findIndex((x) => x.punto === k.punto)]!;
    const arriba = cables.some((c) => c.a === k.a || c.b === k.a), abajo = cables.some((c) => c.a === k.b || c.b === k.b);
    if (!arriba || !abajo) return `${mayus(n)} necesita un cable en ${!arriba && !abajo ? "sus dos puntos" : arriba ? "su punto inferior" : "su punto superior"}.`;
  }
  return "Todas las piezas tienen cable, pero no están unidas bien: cada pieza debe quedar entre el riel + y el riel −. Toca un cable para quitarlo y prueba otra unión.";
}
