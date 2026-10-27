# Contrato de datos del panel docente (D1)

Para Mauro (API Express D2 y panel D3). También es el «modelo de datos» de SCRUM-17. Sin PostgreSQL: solo archivos JSON.
Los tipos están en `src/docente/types.ts`; el almacén (lectura/escritura) en `src/docente/almacen.ts`; la analítica en `src/docente/analitica.ts`.

## Modelo de datos

- **Sesion** `{ codigo, nivel: 1|2, creada (ISO), estado: "abierta"|"cerrada" }`. La crea el docente (D2).
- **Partida** (la escribe el árbitro al terminar o anularse):
  `{ id, sala, sesion?, nivel, semilla, demo, inicio, fin (ISO UTC), fase: "fin"|"anulada", ganador: "A"|"B"|null, motivo, jugadores[] }`
  - `sesion` (opcional, `string|null`): código de la sesión docente; hoy = `sala` (null si no hay). Partidas viejas no lo traen.
  - `id` = `AAAAMMDDTHHMMSS-<sala>` (único, apto para nombre de archivo).
  - `demo`: `false | "cableado" | "radar"`. `ganador` null = empate o anulada.
  - jugador: `{ estacion: "A"|"B", alias, despachados, quemadas, repasar[], podMs[] }`.
  - `repasar[]`: `{ zona: "radar"|"cabina"|"turbina"|"reactor", circuito, fallos, quemadas }`, más fallos primero; vacío si no falló o si se anuló.
  - `podMs[]`: duración (ms) de cada pod despachado.
- **Intento**: una fila del CSV (`partidas/<id>.csv`, la copia exacta del CSV del árbitro; UTF-8 con BOM, separador `;`):
  `jugador;intento;zona;piezas;resultado;tiempo_ms;quemada;pod;tiempo_pod_ms;nivel;zona_nombre;pieza_correcta`.
  Las 3 últimas son nuevas (al final, retrocompatible): `nivel` = nivel real del pod (1/2; en «mixto» el pod 5 es 2; también en filas despacho), `zona_nombre` = radar|cabina|turbina|reactor (`zona` sigue siendo el índice numérico) y `pieza_correcta` = la solución del pod según el motor (en la encadenada, la de la segunda falla). Solo se escribe en CSV/JSON del servidor; nunca va por el protocolo al cliente. En filas despacho `zona_nombre` y `pieza_correcta` van vacías.
  `jugador` es la estación (A/B), `resultado` es `ok|fallo|despacho`; en las filas «despacho» `intento`, `zona` y `piezas` van vacíos.
- **EstadoVivo**: `{ sala, fase, restanteMs, jugadores: [{ alias, despachados, estado }], actualizado (ISO) }`.
  `fase`: `esperando|listo|cuenta|jugando|fin|anulada`; `estado`: `reparando|penalizado|sin-conexion`.
  No lleva piezas, soluciones ni semilla.

## Archivos (`DOCENTE_DATA`, por defecto `spike/data/docente/`, ignorado por git)

```
sesiones.json            Sesion[]
partidas/<id>.json       Partida
partidas/<id>.csv        copia del CSV del árbitro (el mismo que va a bench-out/)
vivo/<sala>.json         EstadoVivo
```

Quién escribe: el **árbitro** (`serve.ts`) escribe `partidas/` y `vivo/`; la **API** escribe solo `sesiones.json`. Dos procesos, cada uno dueño de sus archivos.

### Cuándo escribe el árbitro
- `vivo/<sala>.json`: en cada cambio de fase (incluye `fin`/`anulada`) y cada 5 s mientras la fase es `jugando`. Se borra cuando la sala se cierra (30 s tras el fin para dar tiempo a reconectar; 1 s si se anuló).
- `partidas/<id>.json` y `.csv`: al llegar a `fin` o `anulada`.
- Modo práctica (`arbiter.practica`): no escribe nada. Hoy `serve.ts` no abre salas de práctica (la corre el cliente).
- Si el disco falla, el árbitro solo avisa en consola: el juego sigue.
- Funciona igual con el relé local y con Photon (el hook está en `vigilar()`, que usan ambos).

### Reglas de escritura segura
- Escribir siempre con `escribirAtomico`/`escribirJsonAtomico`: archivo temporal `<destino>.<pid>.tmp` y `rename`. El lector nunca ve JSON a medias.
- Leer con `leerJson` (si falta o está dañado devuelve el valor por defecto). Ignorar archivos `*.tmp`.
- Un `vivo` con `actualizado` de más de ~15 s es viejo (el árbitro pudo caerse sin borrarlo): no mostrarlo como en juego.
- `leerPartida(id)` solo acepta ids `[\w-]+` (evita `../`). Úsalo también para `/csv`.

## API propuesta (D2, Express)
Todo bajo `/api`, JSON salvo el CSV. Salvo `login`, exige `Authorization: Bearer <token>`; sin token válido, 401.

| Método y ruta | Respuesta |
|---|---|
| `POST /api/login` `{usuario, clave}` | `{token}` (200) o 401 |
| `GET /api/sesiones` | `Sesion[]` (`leerSesiones`) |
| `POST /api/sesiones` `{nivel, codigo?}` | `Sesion` creada (201); código aleatorio si no viene; 409 si ya existe; 400 si nivel no es 1 o 2 |
| `GET /api/partidas` | `Partida[]` más recientes primero (`listarPartidas`), con alias |
| `GET /api/partidas/:id` | `Partida` o 404 |
| `GET /api/partidas/:id/csv` | `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<id>.csv"` (stream de `rutaCsv(id)`), o 404 |
| `GET /api/vivo` | `EstadoVivo[]` (`listarVivo`, sin los viejos); el panel hace polling cada ≈5 s |
| `GET /api/analitica/fallos` | `FilaFallos[]` = `{zona, circuito, fallos, quemadas, jugadores}` (`fallosPorZona(listarPartidas())`) |

Analítica: ignora las partidas demo; `jugadores` = cuántos jugadores fallaron ahí al menos una vez.

## Autenticación mínima
- Variables de entorno `DOCENTE_USER` y `DOCENTE_PASS_HASH` (hash, p. ej. `scrypt` de `node:crypto` con sal; nunca la clave en claro). Nunca en el repo: solo los nombres están en `spike/.env.example`.
- `POST /api/login` compara usuario y `scryptSync(clave)` con `timingSafeEqual`; genera un token aleatorio (`randomBytes(24)`) guardado en un `Set` en memoria (se pierde al reiniciar, es aceptable).
- Sin registro de cuentas: una sola cuenta precargada. El panel usa HTTPS en producción.

## Cómo llega una sesión al árbitro (trabajo de D2/D3, no de D1)
Propuesta simple: el árbitro lee `sesiones.json` (por ejemplo cada pocos segundos) y, por cada sesión `abierta` sin sala, abre una sala con ese `codigo` y `nivel` (`crearConCodigo` + `hostRoom` ya existen en `serve.ts`; hoy el nivel es global por proceso). Al cerrar la sala, la API marca la sesión `cerrada`. Hoy no está implementado: D1 solo deja el contrato.

## Decisiones a confirmar
1. **Privacidad**: el CSV no lleva alias (columna `jugador` = estación A/B). El panel mostraría alias solo en la lista de partidas y en el detalle, no en el CSV ni en la tabla de fallos. Confirmar con el tutor/usuario.
2. La analítica excluye partidas demo (son ensayos). ¿Se prefiere incluirlas?
3. Las partidas anuladas se guardan (`fase: "anulada"`). ¿Se muestran en la lista?
4. Retención: no hay borrado automático de `partidas/`; con 2 equipos por aula el volumen es pequeño.
5. Vincular partida con sesión (qué `Sesion` la originó): hoy se enlazan solo por `sala` = `codigo`.
