# CircuitSync · árbitro, motor y pruebas

Lado Node del duelo 1 contra 1: motor de circuitos DC, generador de pods, árbitro (única fuente de verdad) y transportes (Photon Cloud y relé WebSocket local). El cliente de navegador está en `../cliente` (ver su README).

## Requisitos e instalación

Node 20 (el que usa el CI).

```bash
npm ci
```

`photon-realtime` 4.4.0 se instala desde npm; en Node se usa con el paquete `ws`.

## Variables de entorno

Copia `.env.example` a `spike/.env` (ignorado por git; no lo subas):

- `PHOTON_APP_ID`: App ID de una aplicación Photon **Realtime**. Es público por diseño (viaja dentro del cliente), pero no se versiona.
- `PHOTON_REGION`: región de Photon (vacío = `us`).
- `MAX_SALAS` (opcional): salas Photon simultáneas como máximo, por defecto 6. Cada sala usa 3 CCU (árbitro + 2 jugadores).
- `NIVEL`, `SEMILLA` y `DEMO=1` / `DEMO=radar` (opcionales): equivalen a `--nivel`, `--semilla`, `--demo` y `--demo radar` de `serve`.

`npm test` no lee `.env`: la prueba contra Photon Cloud solo corre si `PHOTON_APP_ID` está en el entorno.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm test` | Vitest: 99 pruebas pasan y 1 se omite (la de Photon, sin App ID). |
| `npm run lint` | ESLint. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run serve` | Relé local en `ws://localhost:8787` (`PORT` lo cambia) + árbitro con una sala; imprime el código. Al terminar la partida reabre la sala con el mismo código ("Volver a jugar" sin reiniciar). |
| `npm run serve:photon` | Árbitro en Photon Cloud (solo WSS:443). Siempre deja una sala libre; al llenarse una abre otra, hasta `MAX_SALAS`. |
| `npm run sim:duel` | Duelo simulado completo con aserciones sobre el relé local (sin red externa). |
| `npm run export:csv` | Lo mismo y guarda el registro de intentos en `bench-out/`. |
| `npm run validar:sorteos` | Valida 10 000 sorteos por nivel y de los dos demos, cableado y Radar (cantidad opcional: `-- 500`; solo los demos: `-- --demo`); sale con código 1 si alguno es inválido o no se regenera igual. |
| `npm run bench:local` | Latencia con 8 jugadores en 4 salas sobre el relé local. |
| `npm run bench:photon4` | 4 duelos simultáneos (12 CCU) en Photon; `-- --region sa` o `-- --local`. |
| `npm run poc:photon` | Prueba de concepto: árbitro y dos clientes en una sala Photon; mide RTT. |

`serve` y `serve:photon` aceptan `--nivel 1|2` (por defecto 1) y `--semilla N` (entero de 0 a 2^32-1; por defecto aleatoria):

```bash
npm run serve -- --nivel 2 --semilla 42
```

### Demo de 5 minutos (duración de la partida)

Solo para mostrar: `--limite-min N` (o `LIMITE_MIN=N`, de 1 a 30) cambia lo que dura la partida; por defecto son 12 min (el reglamento no cambia). El reloj del cliente y el desempate siguen al árbitro, así que quedan coherentes. Es independiente de `--demo` (que solo elige las mecánicas) y se pueden combinar.

```bash
npm run serve:demo5           # relé local, partida de 5 min
npm run serve:photon:demo5    # Photon, partida de 5 min
npm run serve -- --demo --limite-min 5   # con las mecánicas demo
```

### Modo demo (una sola mecánica, para mostrar)

Dos variantes; mismas reglas, penalizaciones, cola, carrera final y podio; ambos jugadores reciben la misma secuencia. El árbitro avisa al cliente con `demo: true` en el mensaje `start` (nunca la solución ni la semilla; el protocolo no cambió) y el cliente muestra solo las pestañas del pod y oculta el multímetro. Sin `--demo` todo funciona como antes.

- `--demo` (o `DEMO=1`): **cableado + componentes**. Cada pod trae Cabina (2 focos: montaje `luces`, gana paralelo) y/o Turbina (motor + interruptor: montaje `interruptor`, gana serie), batería de 9 V. Pods 1–3: una zona; pods 4–5: una o dos; las dos mecánicas salen en toda partida. El jugador arrastra las piezas a la placa y las une con cables; el cliente traduce eso a serie / paralelo / puente y el árbitro juzga como siempre.
- `--demo radar` (o `DEMO=radar`): el demo anterior. Los 5 pods traen **solo la zona Radar**: LED con resistencia limitadora, las 4 resistencias en la gaveta (100 Ω «frena poco», 220 Ω «frena algo», 470 Ω «frena medio», 1 kΩ «frena mucho») y batería de 4,5 o 9 V.

Dos pestañas de terminal:

```bash
# Pestaña 1 (en spike/): relé local + árbitro en modo demo; imprime el código de sala
npm run serve -- --demo            # cableado (Cabina y Turbina)
npm run serve -- --demo radar      # solo Radar
#   (o en Photon: npm run serve:photon -- --demo   /   -- --demo radar)

# Pestaña 2 (en cliente/): la página del juego contra el relé local
VITE_TRANSPORT=local npm run dev     # PowerShell: $env:VITE_TRANSPORT="local"; npm run dev
#   (con serve:photon basta npm run dev si cliente/.env.local tiene el App ID)
```

Cada jugador abre `http://localhost:5173`, escribe el código y su alias. La lógica está en `generar(semilla, nivel, demo)` de `src/engine/generador.ts` (`demo` = `false` | `"cableado"` | `"radar"`).

**Dónde editar a mano (demo):** zonas y familias del demo de cableado en `ZONAS_CABLEADO` y el bloque `demo === "cableado"` de `generar()` (cuántas zonas por pod) y de `validarPartida()`; voltajes del demo Radar en `VOLTS_DEMO`; cómo se lee la opción en `src/serve.ts` (`demoTxt`).

La semilla se imprime en consola y va en el nombre del CSV, pero nunca se envía a los clientes. Con `--semilla` en Photon todas las salas usan la misma. Todo lo que generan los scripts queda en `bench-out/` (ignorado por git); los bancos nunca escriben el App ID.

## Flujo de la partida

Fases del árbitro: `esperando` → `listo` (2 jugadores) → `cuenta` (ambos pulsaron Listo; 3-2-1) → `jugando` → `fin` | `anulada`.

- Ambos jugadores reciben los mismos 5 pods (generados con la semilla y el nivel); cada pod tiene de 1 a 4 zonas dañadas (radar, cabina, turbina, reactor). Gana quien despacha los 5.
- El cliente manda la pieza elegida y recibe solo el veredicto; la solución nunca viaja.
- Reparar la última zona no despacha: el jugador manda `despachar`. El árbitro responde `despachado` (con el pod siguiente) o lo rechaza si faltan zonas. El rival ve el progreso solo tras un despacho aceptado; si dos llegan casi a la vez, gana el primero que llega al árbitro.
- Penalizaciones (solo cuestan tiempo): enfriamiento por zona de 2, 4 y 8 s en fallos seguidos (8 s del tercero en adelante; se reinicia con cada pod). Una pieza quemada bloquea "Probar" 4 s en todo el pod.
- Reloj de 12 min por partida. Si un jugador se desconecta, el árbitro le guarda el asiento 30 s; vuelve con el mismo alias y recupera su progreso.
- Al terminar, `serve` guarda `bench-out/intentos-<código>-nivel<N>-semilla<S>.csv`: UTF-8 con BOM, separador `;`, sin datos personales.

## Estructura

- `src/protocol.ts`: tipos de mensajes cliente↔árbitro y validaciones puras (lo importa también el cliente).
- `src/engine/circuit.ts`: motor DC (análisis nodal modificado), compartido por árbitro y cliente.
- `src/engine/pods.ts`: circuito de cada familia de falla y su veredicto con la pieza elegida.
- `src/engine/generador.ts`: generador determinista de pods por semilla y nivel; `validar-sorteos.ts` es su CLI.
- `src/arbiter/arbiter.ts`: árbitro del duelo, sin red y con reloj inyectable. `penalties.ts`: enfriamientos, bloqueo y CSV.
- `src/transport/`: interfaz `Transport`, `photon.ts` (Photon Cloud, puerto 443 forzado), `local.ts` y `ws-client.ts` (relé local que imita Photon), `room.ts` (códigos de 6 caracteres y sala con árbitro).
- `src/serve.ts`: punto de entrada de `serve` y `serve:photon`.
- `src/sim/`: `bot.ts` (jugador simulado con el protocolo real), `duel.ts` y `cli.ts` (duelo de extremo a extremo).
- `src/bench/`: `latency.ts`, `photon4.ts`, `photon-poc.ts`, `session.ts` y `stats.ts` (percentiles).
- `test/`: circuit, generador, penalties, arbiter y transport; `src/bench/stats.test.ts`.
- Restos del diseño anterior: `src/engine/pod.ts` no lo usa ningún módulo; `test/engine.test.ts` todavía corre, pero solo prueba ese archivo.

## Latencia medida (`bench:photon4`)

4 duelos simultáneos, 8 clientes, al menos 300 muestras por indicador y duelo. Metas: "Probar" → resultado p95 ≤ 150 ms; despacho → rival p95 ≤ 250 ms.

| Transporte | Probar → resultado p95 | Despacho → rival p95 |
|---|---|---|
| Relé local | 3,8 ms | 4,3 ms |
| Photon, región `us` | 199 ms (**incumple**) | 199 ms (cumple) |
| Photon, región `sa` | 355 ms (**incumple**) | 355 ms (**incumple**) |

El árbitro y los 8 clientes corrieron en un solo proceso Node del mismo equipo, no en un servidor cercano ni desde la red de la UDLA.

## Límites conocidos

- No hay voltímetro ni nivel 3; solo niveles 1 y 2.
- No hay API ni PostgreSQL: los resultados quedan en CSV locales.
- El CI solo cubre `spike/` (lint, typecheck y pruebas); no corre `validar:sorteos` ni las pruebas del cliente.
