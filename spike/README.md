# Demostración técnica de factibilidad: CircuitSync

Objetivo: comprobar con código que la arquitectura del anteproyecto (motor de simulación compartido + servicio árbitro + red en tiempo real) es viable, antes de pasar al desarrollo.

## Estado

| # | Pregunta de factibilidad | Estado | Evidencia |
|---|---|---|---|
| 1 | ¿El motor del pod calcula como el cálculo analítico, con error ≤ 1 % (RNF-01)? | **Probado** | `test/engine.test.ts`, 10 casos |
| 2 | ¿El árbitro es la única autoridad y rechaza controles ajenos (RF-03, RNF-06)? | **Probado** | `test/arbiter.test.ts`, 6 casos |
| 3 | ¿El motor y el árbitro cumplen la latencia de RNF-02 con 8 jugadores? | **Probado solo en red local** (línea base) | `npm run bench:local` |
| 4 | ¿Photon Realtime permite que un proceso Node.js actúe como árbitro dentro de la sala? | **Sin probar** | Ver "Pendiente: Photon" |
| 5 | ¿La latencia a través de Photon Cloud desde la red de la UDLA cumple RNF-02? | **Sin probar** | Ver "Pendiente: Photon" |
| 6 | ¿Las conexiones simultáneas alcanzan para una clase (el árbitro cuenta como una)? | **Sin probar** | Ver "Pendiente: Photon" |

## Cómo correrlo

```bash
npm install
npm test            # 16 pruebas: motor y árbitro
npm run typecheck
npm run bench:local # 8 jugadores en 4 salas, 10 s, WebSocket local
```

Resultado de la línea base local (8 jugadores, 304 mensajes): reflejo en el compañero p95 = 1,58 ms; decisión del árbitro p95 = 1,63 ms. Este número solo demuestra que el motor y el árbitro no son el cuello de botella. **No dice nada sobre Photon**: la red de Photon añade decenas de milisegundos.

## Estructura

- `src/engine/pod.ts`: motor de simulación, biblioteca pura (sin red ni gráficos).
- `src/arbiter/arbiter.ts`: autoridad de una sala de dos estaciones, independiente del transporte.
- `src/transport/local.ts`: transporte WebSocket local.
- `src/bench/latency.ts`: medición de latencia (reutilizable con Photon cambiando el transporte).

## Pendiente: Photon (requiere acción tuya)

1. En el panel de Photon, crear una aplicación de tipo **Realtime** (distinta de Fusion) y copiar su **App ID**. Guárdalo en un archivo `.env` que no se suba a git.
2. Descargar el **SDK de JavaScript de Photon Realtime** desde el sitio de Photon. No existe un paquete oficial en npm.
3. Con el SDK, probar en este orden:
   - **a. Cliente web:** dos pestañas del navegador se unen a la misma sala con un código.
   - **b. Árbitro en Node.js:** el SDK está hecho para el navegador. En Node, según los foros de Photon, hay que cargarlo con `fs` y `vm` y darle un adaptador de WebSocket (por ejemplo, el paquete `ws`). **Este es el mayor riesgo técnico del anteproyecto**: si no funciona, el árbitro tendría que ejecutarse en un navegador sin interfaz o cambiar de alternativa.
   - **c. Autoridad:** confirmar que el cliente puede identificar al emisor de cada evento y descartar los que no vengan del árbitro.
   - **d. Latencia y conexiones:** repetir `bench/latency.ts` con un `PhotonTransport`, desde la red WiFi de la UDLA y desde una red alterna, y comprobar cuántas conexiones consume cada sala con su árbitro.
4. Registrar los resultados en la tabla de arriba.

## Criterios para dar por demostrada la factibilidad

- Los puntos 1 a 6 en estado "Probado".
- Latencia con Photon: p95 ≤ 150 ms (Probar→resultado) y ≤ 250 ms (despacho→rival) con 8 jugadores.
- Si el punto 4 falla, documentar el hallazgo y proponer la alternativa antes de continuar.

## Limitaciones de esta demostración

- El modelo eléctrico es el del documento de diseño: baliza siempre en paralelo; Radar, Escudo y Propulsor según la topología elegida. No cubre el Nivel 3 (divisor de voltaje con potenciómetro ni reserva que baja por segundo).
- Los clientes del benchmark son simulados, no navegadores reales.
