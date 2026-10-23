// Copia del kit `arte/` solo lo que usa el cliente: PNG a public/arte/ y un atlas recortado a src/atlas.json.
// Reproducible: `npm run arte` (Node ≥ 18, sin dependencias). No modifica `arte/`.
// Para usar más sprites (p. ej. la carrera), añade su patrón a USADOS y vuelve a ejecutarlo.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliente = join(dirname(fileURLToPath(import.meta.url)), "..");
const arte = join(cliente, "..", "arte");
const destino = join(cliente, "public", "arte");

const USADOS = [
  /^pod\d_[a-z]+_(radar|cabina|turbina|reactor)_(sano|averiado|quemado|reparado)$/,
  /^pod\d_[a-z]+_(reparado_\d|mini_espera)$/,
  /^(fondo_taller|fondo_taller_ancho|globo_sintoma)$/,
  /^(bahia|bahia_ocupada|humo|humo_negro)_\d$/,
  /^(puesto_cola|contador_pods)_\d$/,
  /^tarjeta_quemado_(led|calefactor|cortocircuito)$/,
  /^(hud_barra|hud_barra_ancho|icono_(reloj|rival|bateria|turbina)|panel_oscuro|panel_alerta|medidor_fondo|medidor_aguja)$/,
  /^pestana_(radar|cabina|turbina|reactor)_(activa|inactiva|alerta|reparada)$/,
  /^boton_(probar|despachar)_(normal|presionado|deshabilitado)$/,
  /^boton_(primario|secundario)$/,
  /^(led_rojo|foco|calefactor)_(apagado|tenue|encendido|brillante|quemado|fundido)$/,
  /^(resistencia_(100|220|470|1k)|fusible_(fino|medio|grueso)|interruptor_cerrado)$/,
  /^bateria_(4_5v|9v|18v)$/,
  /^(placa_4x4|casilla_(vacia|valida|resaltada|ocupada))$/,
  /^(multimetro_modo_(tension|continuidad)|icono_(pasa|no_pasa))$/,
  /^(flecha_guia_\d|recuadro_resaltado)$/, // pistas del primer pod (modo demo)
];

const atlas = JSON.parse(readFileSync(join(arte, "atlas.json"), "utf8"));
const sprites = atlas.sprites
  .filter((s) => USADOS.some((re) => re.test(s.nombre)))
  .map(({ nombre, archivo, ancho, alto, origen, offset, puntos, nineSlice }) => ({ nombre, archivo, ancho, alto, origen, offset, puntos, nineSlice }));
const hay = new Set(sprites.map((s) => s.nombre));
const animaciones = atlas.animaciones.filter((a) => a.frames.every((f) => hay.has(f)));

rmSync(destino, { recursive: true, force: true });
for (const archivo of [...sprites.map((s) => s.archivo), "ui/fuente_pixel.png", "ui/fuente_pixel.xml"]) {
  mkdirSync(dirname(join(destino, archivo)), { recursive: true });
  copyFileSync(join(arte, archivo), join(destino, archivo));
}
const meta = { pods: atlas.meta.pods.map(({ id, nombre, orden }) => ({ id, nombre, orden })) };
writeFileSync(join(cliente, "src", "atlas.json"), JSON.stringify({ sprites, animaciones, meta }, null, 1) + "\n");
console.log(`arte: ${sprites.length} sprites, ${animaciones.length} animaciones y la fuente pixel → public/arte/, src/atlas.json`);
