# CircuitSync · cliente de navegador

Cliente Phaser (Vite + TypeScript) del duelo 1 contra 1. El árbitro corre en Node (`spike/`) y es la única fuente de verdad; el cliente solo envía "Probar" y pinta lo que el árbitro decide.

## Transporte

| Modo | Árbitro | Red |
|------|---------|-----|
| `photon` (por defecto si hay App ID) | `npm run serve:photon` en `spike/` | Photon Cloud, solo WSS por el puerto 443 |
| `local` | `npm run serve` en `spike/` | relé WebSocket en `ws://<host>:8787` (una sala por proceso) |

El navegador usa el mismo `spike/src/transport/photon.ts` que el árbitro: el paquete npm `photon-realtime` trae un envoltorio de Node con el paquete `ws`, y en el navegador se reemplaza por el WebSocket nativo.

## Variables de entorno

`spike/.env` (árbitro, ignorado por git):

- `PHOTON_APP_ID`: App ID de Photon Realtime.
- `PHOTON_REGION`: región (vacío = `us`).
- `MAX_SALAS`: salas Photon simultáneas como máximo (por defecto 6; cada sala usa 3 CCU y el plan gratuito admite 20).

`cliente/.env.local` (navegador, ignorado por git; plantilla en `.env.example`):

- `VITE_PHOTON_APP_ID`: el mismo App ID (es público: viaja dentro del cliente).
- `VITE_PHOTON_REGION`: la misma región que el árbitro.
- `VITE_TRANSPORT`: `photon` o `local`. Vacío: `photon` si hay App ID, si no `local`.

## Cómo correrlo

```bash
# 1) Árbitro (en spike/)
npm run serve:photon
#   Photon (us) · sala nueva, código: ENVQWJ · salas abiertas: 1
#   Siempre deja una sala libre: cuando una se llena abre otra con un código nuevo.
#   Al terminar cada partida guarda bench-out/intentos-<código>.csv.

# 2) Cliente (en cliente/)
npm install
npm run dev            # http://localhost:5173
```

Cada jugador abre la página, escribe el código de 6 caracteres y su alias. «Practicar» (con su nivel) juega solo, sin código ni rival: el árbitro corre en el navegador, no hay carrera ni CSV, y se sale tocando la línea «Práctica» del HUD o al despachar los 5 pods. Al terminar, "Volver a jugar" regresa a Entrar con el alias puesto; se usa el código de la sala libre que muestra la consola. El botón «Tutorial» abre una práctica guiada de 8 pasos (con «Saltar»), de semilla fija y opcional; vive en `cliente/src/tutorial.ts`.

Si se pierde la conexión durante la partida, el cliente vuelve solo a la misma sala con el mismo alias cada 2 s; el árbitro guarda el asiento 30 s.

## Arrastrar y soltar (todas las zonas)

Las piezas de la gaveta se **arrastran** con el dedo o el ratón: una vista previa («fantasma») sigue al puntero, la ranura válida se resalta y, si se suelta fuera, la pieza vuelve a la gaveta. El **toque** sigue valiendo: en Radar/Reactor tocar una pieza la pone en su ranura; en la placa, tocar una pieza y luego su casilla. En Cabina y Turbina las dos cargas (2 focos, o motor e interruptor) empiezan en una gaveta bajo la placa; cada una ocupa dos casillas en vertical y luego se unen con cables. «Probar» solo se activa con todo puesto y cableado.

## Modo demo

Para mostrar una sola mecánica. Se enciende en el árbitro; el cliente lo detecta solo (`demo: true` en el mensaje `start`) y muestra solo las pestañas de las zonas del pod, sin multímetro. En el primer pod aparece una pista sin narrador (texto amarillo, flecha y resalte con sprites del kit) que desaparece al primer intento. Cola, carrera final y podio siguen igual.

- `--demo` (nuevo): **cableado + componentes** en Cabina y Turbina. Pods 1–3 con una zona, 4–5 con una o dos. Pista: arrastrar las piezas a la placa → unirlas con cables → «Probar».
- `--demo radar` (el anterior): solo Radar, elegir la resistencia del LED. Pista: flecha a la gaveta → «Probar».

Dos pestañas de terminal:

```bash
# Pestaña 1 (en spike/): árbitro en modo demo con relé local; anota el código de sala que imprime
npm run serve -- --demo            # demo de cableado
npm run serve -- --demo radar      # demo anterior (solo Radar)

# Pestaña 2 (en cliente/): página del juego con el relé local
VITE_TRANSPORT=local npm run dev          # PowerShell: $env:VITE_TRANSPORT="local"; npm run dev
```

Abre `http://localhost:5173` en dos ventanas (o en dos equipos con `--host`), escribe el código y un alias en cada una y pulsa «Listo» en ambas. Con Photon: `npm run serve:photon -- --demo` (o `-- --demo radar`) en la pestaña 1 y `npm run dev` en la 2 (con App ID en `.env.local`). Para apagarlo, arranca el árbitro sin `--demo`. Si el relé usa otro puerto (`PORT=8797`), abre la página con `?relay=ws://localhost:8797`. En `.claude/launch.json` están `circuitsync-arbitro-demo` (8797), `circuitsync-arbitro-cable` (8807, semilla 3), `circuitsync-arbitro-radar` (8808), `circuitsync-cliente-demo` (5183) y `circuitsync-cliente-cable` (5193). Capturas del demo de cableado: `capturas/cable-*.jpg`.

## Dónde editar a mano

| Quiero cambiar… | Archivo |
|---|---|
| Textos del Taller (reto del globo, gaveta, mensajes de veredicto, nombres «frena …», pistas del demo) | `src/vista.ts` (`RETO`, `GAVETA`, `CARGA`, `FRENA`, `PISTA_DEMO`) |
| Cuándo sale la pista del demo | `src/pantalla.ts` (`pistaDemo`); qué falta en cada zona: `src/taller.ts` (`falta`) |
| Dónde se ven la flecha y el resalte de cada pista | `src/taller.ts`, `pintar()` (`recuadro`, `flechaPlaca`) |
| Arrastre: cuánto mover para que deje de ser toque, fantasma y regreso a la gaveta | `src/arrastre.ts` (`UMBRAL`, `arrastrable`) |
| Ranura del circuito donde se suelta la pieza (Radar, Reactor) | `src/taller.ts` (`RANURA`) |
| Gaveta de la placa (posición y tamaño de los huecos), textos de colocar | `src/tablero.ts` (`GAVETA_PLACA`, `TC`) |
| Qué casillas acepta una pieza de la placa y cómo se traduce a serie/paralelo/puente | `src/placa.ts` (`ranuraValida`, `ranuraEn`, `montaje`) |
| Textos de carrera y podio | `src/podio.ts` (`TXT`, `CONCEPTO`) |
| Textos del multímetro y de la placa | `src/multimetro.ts` (`T`), `src/tablero.ts` (`TC`) |
| Posición de cada cosa en el Taller (pestañas, globo, gaveta, botones, flecha) | `src/taller.ts`, método `create()` (coordenadas en un bloque de 360 px) y `pintar()` |
| Posición en carrera y podio | `src/carrera.ts` |
| Qué sprite pinta cada pieza/estado | `src/sprites.ts` |
| Glifos que faltan en la fuente pixel (º, •, =…) | `src/arte.ts` (`aPixel`) |
| Sprites (dibujos) | edita `../arte/` (o `../arte/generar.mjs`) y ejecuta `npm run arte`: copia a `public/arte/` y regenera `src/atlas.json`. Para usar un sprite nuevo del kit, añade su nombre a `USADOS` en `scripts/copiar-arte.mjs`. El juego solo sirve `public/arte/`; `../arte/` (fuera de git) solo hace falta para `npm run arte`. |

Los textos del cliente se copiaron del prototipo de diseño `prototipo-v3/textos.js` (cada archivo dice de qué sección).

## Probar desde un celular

Photon funciona entre redes distintas (el celular puede estar en datos móviles). Lo que necesita estar en la misma red es la página: Vite debe escuchar en la LAN.

```bash
npm run dev -- --host     # muestra la URL Network, p. ej. http://192.168.1.20:5173
```

Abre esa URL en el celular (misma Wi-Fi que el computador). Para jugar desde otra red, publica el build (`npm run build`, carpeta `dist/`) en cualquier hosting estático. El modo `local` no sirve fuera de la LAN porque el relé está en el puerto 8787 del computador.

## Comandos

```bash
npm test            # lógica de pantalla y cliente contra el árbitro en memoria
npx tsc --noEmit
npm run build       # el App ID queda dentro de dist/: no versionar dist/
```
