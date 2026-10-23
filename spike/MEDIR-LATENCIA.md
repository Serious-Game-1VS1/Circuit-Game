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
| 2026-10-23 06:40 UTC | Este PC, red actual (casa/otra, no UDLA) | PC del desarrollador | us | 1 | 190.46 | 199.75 | 203.93 | 283.85 | 190.44 | 199.25 | 203.43 | 290.34 | 0 | Probar NO / Despacho sí |
| 2026-10-23 06:41 UTC | Este PC, red actual (casa/otra, no UDLA) | PC del desarrollador | us | 2 | 190.07 | 197.36 | 203.33 | 206.58 | 190.48 | 198.34 | 206.11 | 219.08 | 0 | Probar NO / Despacho sí |
| 2026-10-23 06:43 UTC | Este PC, red actual (casa/otra, no UDLA) | PC del desarrollador | us | 3 | 188.86 | 198.65 | 201.21 | 201.88 | 189.19 | 197.61 | 200.26 | 200.83 | 0 | Probar NO / Despacho sí |
| 2026-10-23 06:44 UTC | Este PC, red actual (casa/otra, no UDLA) | PC del desarrollador | sa | 1 | 348.97 | 355.53 | 358.49 | 391.26 | 349.25 | 356.09 | 360.12 | 391.21 | 0 | NO / NO |
| 2026-10-23 06:46 UTC | Este PC, red actual (casa/otra, no UDLA) | PC del desarrollador | eu | 1 | 356.25 | 371.22 | 383.34 | 449.36 | 357.36 | 370.67 | 373.14 | 394.38 | 0 | NO / NO |

## Cómo leer el resultado

- Si el p95 baja en la UDLA respecto al PC de casa, el problema era el enlace del desarrollador.
- Si todas las regiones superan la meta, la red no es el cuello: la causa es la distancia al servidor de Photon o la propia ida y vuelta del árbitro. Entonces conviene acercar el árbitro a Photon (ver opciones en el informe de T6) y volver a medir.
- Recuerda que el bench pone árbitro y clientes en la misma máquina: en producción el árbitro estará en otro lugar y el jugador en otra red, así que el camino real puede ser distinto (jugador → Photon → árbitro → Photon → jugador).

## Medir contra un árbitro alojado en otro lugar

`bench:photon4` pone árbitro y bots en tu PC. Para medir el trayecto real (jugador → Photon → árbitro remoto → Photon → jugador) usa `bench:remoto`:

1. En el servidor: `npm run serve:photon:demo5` (misma región que vas a medir; la imprime junto con «sala nueva, código: XXXXXX»).
2. Aquí, en `spike/` (con `PHOTON_APP_ID` en `.env`):
   ```
   npm run bench:remoto -- --codigo XXXXXX --region us --muestras 100
   ```
   `--max-seg` (por defecto 300) limita el tiempo. El informe sale en consola y en `bench-out/remoto-<región>-<código>-<fecha>.md/.json`.
- La sala necesita 2 jugadores: el script mete dos en su proceso, el «medidor» (el que se mide) y un «rival» local que también juega. El árbitro remoto cuenta como una partida normal; el modo demo de 5 minutos limita cuánto se puede medir (si termina antes, el informe lo indica).
- Compara el p50/p95 de «Probar → resultado» con los ≈190 ms de `bench:photon4` en este PC (`us`): si el servidor US East queda claramente por debajo, acercar el árbitro a Photon funciona; la meta es p95 ≤ 150 ms.

## Árbitro alojado en US East (GitHub Codespace, Virginia)

Contexto (2026-10-23):

- Árbitro: `serve:photon:demo5` en un GitHub Codespace en Boydton, Virginia (Azure East US, confirmado con ipinfo).
- Jugadores: 2 bots locales de `bench:remoto` en el PC del desarrollador, red de casa (**no** UDLA). Región Photon `us`.
- 3 corridas contra salas nuevas. El Codespace fue eliminado al terminar. Una partida demo da pocas muestras.

| Corrida | Sala | Indicador | n | p50 (ms) | p95 (ms) | p99 (ms) | máx (ms) | % sobre meta |
|---|---|---|---|---|---|---|---|---|
| 1 | HNBS55 | Probar → resultado | 11 | 99.68 | 100.31 | 100.31 | 100.31 | 0 % (>150) |
| 1 | HNBS55 | Despacho → rival | 5 | 99.08 | 100.24 | 100.24 | 100.24 | 0 % (>250) |
| 2 | no registrada | Probar → resultado | 7 | 100.36 | 104.66 | 104.66 | 104.66 | 0 % (>150) |
| 2 | no registrada | Despacho → rival | 4 | 105.38 | 105.87 | 105.87 | 105.87 | 0 % (>250) |
| 3 | W7HQXX | Probar → resultado | 11 | 104.72 | 105.88 | 105.88 | 105.88 | 0 % (>150) |
| 3 | W7HQXX | Despacho → rival | 5 | 99.6 | 102.03 | 102.03 | 102.03 | 0 % (>250) |

Resumen:

- Probar → resultado: 29 muestras; mediana de los p95 = 104.66 ms (meta 150 ms: **cumple**).
- Despacho → rival: 14 muestras; mediana de los p95 = 102.03 ms (meta 250 ms: **cumple**).
- Peor valor observado: 105.88 ms. 0 % de muestras sobre 150 ms.

Comparación con la línea base (misma herramienta, árbitro en el PC del desarrollador, red de casa, región `us`): p95 ≈ 193-199 ms en «Probar → resultado» y ≈ 200 ms en despacho. Alojar el árbitro cerca de Photon (US East) reduce la latencia a la mitad aprox. (≈ 100 ms), porque el trayecto jugador → Photon → árbitro → Photon → jugador cruza la distancia a Photon una vez en vez de dos.

Limitaciones:

- Una sola red (casa, no UDLA).
- Pocas muestras por corrida: el p95 coincide con el máximo, así que es un indicio y no una cifra estadística.
- 1 duelo, no los 4 duelos simultáneos ni las ≥300 muestras que pide el método formal del RNF-02.
- Los bots son locales y comparten proceso.
- El árbitro corre en un Codespace que se apaga por inactividad (no sirve para la demo).
- Pendiente: medir desde la red de la UDLA y con 4 duelos.
