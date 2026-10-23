# Medir la latencia p95 desde la UDLA

Objetivo: saber si la red de la UDLA (WiFi) y los datos móviles cumplen las metas del anteproyecto: "Probar" → resultado p95 ≤ 150 ms y despacho → rival p95 ≤ 250 ms. La última medición (en el PC del desarrollador) dio p95 ≈ 199 ms en `us` y 355 ms en `sa`.

## Qué mide `bench:photon4`

4 duelos simultáneos (8 clientes bot + 4 árbitros = 12 CCU, de 20 gratis) contra Photon Cloud. Árbitro y clientes corren en un solo proceso Node de **tu equipo**, así que lo medido es: tu equipo ↔ Photon (ida y vuelta) pasando por la red desde la que lo ejecutes. Cada duelo juega partidas seguidas hasta juntar 300 muestras por indicador.

## Requisitos (una vez)

- Node 22, y `npm ci` hecho en `spike/`.
- `spike/.env` con `PHOTON_APP_ID` (copia de `.env.example`). No lo subas ni lo pegues en chats o tablas.
- Cerrar VPN, descargas y videollamadas durante la prueba.

## Pasos

Desde `spike/`:

```
npm run bench:photon4 -- --region us
npm run bench:photon4 -- --region sa
npm run bench:photon4 -- --region eu
```

- La región se elige con `--region <código>` (si no, usa `PHOTON_REGION` del `.env`; si tampoco, `us`). Códigos de Photon habituales: `us` (este de EE. UU.), `usw`, `cae`, `sa` (São Paulo), `eu`, `asia`, `jp`, `au`, `in`, `kr`, `rue`, `za`, `cn`. Solo funcionan las regiones habilitadas en tu aplicación Photon; si una falla, revisa el panel de Photon.
- Cada corrida dura hasta 15 min (`BENCH_MAX_MS` lo cambia) y deja `bench-out/photon4-photon-<región>-<fecha>.md` y `.json` (sin el App ID).
- Repite **3 veces por región y red**, en horas distintas si puedes (por ejemplo con clase y sin clase). Un solo valor no sirve: el p95 varía entre corridas.
- Orden sugerido: (1) WiFi UDLA con `us`, `sa`, `eu`; (2) datos móviles (hotspot del celular) con las mismas regiones.

## Qué anotar de cada corrida

Del `.md` generado (tabla "RNF-02"):

- Para "Probar → resultado" y "Despacho → rival": **n, p50, p95, p99, máx** y el % sobre 150/250 ms.
- Partidas fallidas (campo "fallidas") y "mismo estado en todas".
- Red (WiFi UDLA / datos móviles / otra), lugar (aula, biblioteca), hora, región.

Meta: p95 de "Probar → resultado" ≤ 150 ms y p95 de despacho → rival ≤ 250 ms.

## Tabla para pegar resultados

| Fecha y hora | Red | Lugar | Región | Corrida | Probar p50 | Probar p95 | Probar p99 | Probar máx | Despacho p50 | Despacho p95 | Despacho p99 | Despacho máx | Fallidas | Cumple 150 / 250 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | WiFi UDLA | | us | 1 | | | | | | | | | | |
| | WiFi UDLA | | us | 2 | | | | | | | | | | |
| | WiFi UDLA | | us | 3 | | | | | | | | | | |
| | WiFi UDLA | | sa | 1 | | | | | | | | | | |
| | WiFi UDLA | | eu | 1 | | | | | | | | | | |
| | Datos móviles | | us | 1 | | | | | | | | | | |
| | Datos móviles | | sa | 1 | | | | | | | | | | |
| | Datos móviles | | eu | 1 | | | | | | | | | | |

## Cómo leer el resultado

- Si el p95 baja en la UDLA respecto al PC de casa, el problema era el enlace del desarrollador.
- Si todas las regiones superan la meta, la red no es el cuello: la causa es la distancia al servidor de Photon o la propia ida y vuelta del árbitro. Entonces conviene acercar el árbitro a Photon (ver opciones en el informe de T6) y volver a medir.
- Recuerda que el bench pone árbitro y clientes en la misma máquina: en producción el árbitro estará en otro lugar y el jugador en otra red, así que el camino real puede ser distinto (jugador → Photon → árbitro → Photon → jugador).
