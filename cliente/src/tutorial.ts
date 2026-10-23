/**
 * Tutorial opcional: lista de pasos y su avance, sin Phaser (el Taller solo dibuja el estado).
 * Corre sobre una práctica con semilla fija; «Saltar» deja la práctica libre.
 */

/** Semilla fija de la práctica del tutorial: todos ven el mismo primer pod. */
export const SEMILLA_TUTORIAL = 3;

/** Qué elemento del Taller se resalta en cada paso. */
export type Objetivo = "pestanas" | "gaveta" | "placa" | "multimetro" | "aguja" | "probar" | "contador";

export interface Paso { titulo: string; texto: string; objetivo: Objetivo }

const PASOS: Paso[] = [
  { titulo: "Tu objetivo", texto: "Repara las zonas marcadas en cada pod. Lo que pide cada zona está en su pestaña.", objetivo: "pestanas" },
  { titulo: "Pon una pieza", texto: "Elige una pieza de la gaveta. Arrástrala al circuito, o tócala.", objetivo: "gaveta" },
  { titulo: "Une con cables", texto: "Arrastra de un punto a otro, o toca un punto y luego otro. Une los rieles + y -.", objetivo: "placa" },
  { titulo: "Mide con el multímetro", texto: "Primero pon una pieza. Luego toca Tensión y toca la pieza.", objetivo: "multimetro" },
  { titulo: "Lee la aguja", texto: "Poco, correcto o demasiado. Busca el mensaje «¡Correcto!».", objetivo: "aguja" },
  { titulo: "Pieza quemada", texto: "Si se quema, queda bloqueada unos segundos. Prueba otra pieza.", objetivo: "gaveta" },
  { titulo: "Despacha el pod", texto: "Pulsa Probar en cada zona. Con todas reparadas, pulsa Despachar.", objetivo: "probar" },
  { titulo: "La carrera final", texto: "Tus pods reparados suman en el marcador. Al final, carrera y podio.", objetivo: "contador" },
];

export interface Tutorial { pasos: Paso[]; i: number; activo: boolean }

/** `omitir`: objetivos sin elemento en pantalla (modo demo sin multímetro; pods sin placa de cables). */
export const iniciar = (omitir: Objetivo[] = []): Tutorial => ({ pasos: PASOS.filter((p) => !omitir.includes(p.objetivo)), i: 0, activo: true });
export const actual = (t: Tutorial) => t.pasos[t.i]!;
export const esUltimo = (t: Tutorial) => t.i === t.pasos.length - 1;
/** En el último paso no avanza: el botón pasa a ser «Empezar a jugar». */
export const siguiente = (t: Tutorial): Tutorial => (esUltimo(t) ? t : { ...t, i: t.i + 1 });
export const saltar = (t: Tutorial): Tutorial => ({ ...t, activo: false });
export const textoPaso = (t: Tutorial) => `${t.i + 1}/${t.pasos.length} ${actual(t).titulo}`;
