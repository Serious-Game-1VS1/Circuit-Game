# SCRUM-166 «Cumplir»: acción, progreso y recompensa

## Definiciones del tutor (resumidas)

1. **Acción**: el jugador realiza las acciones principales para cumplir un objetivo (acertijos, misiones, obstáculos).
2. **Progreso**: avances **medibles**: puntos de experiencia (XP), desbloquear niveles, mejorar habilidades, objetivos parciales.
3. **Recompensa**: puntos o monedas, trofeo o insignia, desbloquear un personaje, zona o equipo.

## Tutor → implementación → dónde se ve

| Definición | Implementación | Dónde se ve |
|---|---|---|
| Acción | Taller: elegir pieza, cablear, medir, Probar, Despachar; «Objetivo: repara Radar, Cabina». | Taller. |
| Progreso: XP y rangos | XP = puntaje de la partida; rangos Aprendiz 0, Técnico 300, Experto 800, Maestro 1500. | Entrar y panel «Recompensas». |
| Progreso: nivel | **Cumple.** Criterio: terminar con todos los pods despachados (5/5) una partida de nivel 1, práctica o duelo (no Oleadas, no el tutorial) abre el nivel 2 (`nivelDesbloqueado = 2`, en `localStorage`), con aviso «¡Nivel 2 desbloqueado!» e insignia. Entrar muestra el selector de nivel de la práctica; el 2 sale con candado («Completa el nivel 1 para abrirlo»). Límite: el duelo usa el nivel que fija el servidor (`--nivel`/`NIVEL`), el selector solo afecta a la práctica. | Entrar (selector), «Recompensas» y «Logros». |
| Progreso: habilidades | Dominio por concepto de «Qué repasar» (`src/dominio.ts`): aciertos/(aciertos+fallos), mínimo 3 intentos; ★ 60 %, ★★ 80 %, ★★★ 95 % con ≥5 intentos. | «Recompensas» («Luces en paralelo ★★☆ ↑») y «Logros». |
| Progreso: objetivos parciales | «Pod n/5», «Zonas reparadas n/m». | HUD del Taller. |
| Recompensa: puntos | «+100» (+120 si el pod sale limpio) al despachar; «+N XP» al terminar. | Taller y «Recompensas». |
| Recompensa: insignias | 7 en `INSIGNIAS`: Primer pod, Sin quemadas, Racha limpia, Ganador, Constante, **Dominio** (3 estrellas en un concepto), **Nivel 2 abierto** (despachar todos los pods del nivel 1). | «Recompensas» y «Logros». |
| Recompensa: equipo | Naves por rango (Aprendiz→1 Cometa, Técnico→2 Burbuja, Experto→3 Aguijón, Maestro→4 Yunque); la 5 Raya con las 7 insignias. El Podio dibuja tu mejor nave. | «Nave nueva desbloqueada», candados en «Logros», Podio. |

## Cómo funciona

- Puntaje (`src/progreso.ts`): 100 por pod, +20 por pod limpio, −10 por quemada, mínimo 0.
- Conteo de habilidades: el cliente cuenta lo que manda el árbitro, igual en práctica y en duelo: +1 acierto por cada zona de un pod despachado y +1 fallo por cada veredicto distinto de «correcto». Led y cabina comparten concepto.
- Solo cuentan partidas terminadas: el tutorial, una práctica abandonada o una partida anulada no suman. Un End reenviado al reentrar no se cuenta dos veces (firma `ultimoEnd`).
- Perfil en `localStorage` (clave `circuitsync.perfil.<alias>`), con try/catch; si falla, solo memoria. Lógica en `src/perfil.ts` y `src/dominio.ts`; paneles en `src/recompensas.ts`; pruebas en `test/perfil.test.ts` y `test/dominio.test.ts`.

## Demo de 1 minuto

1. Entrar con un alias nuevo: «Aprendiz · 0 XP · 0/7 insignias»; «Ver logros» muestra naves con candado.
2. «Practicar», reparar y despachar los 5 pods (cometer algún fallo).
3. Sale «Recompensas»: XP, insignias y habilidades con estrellas. Volver a Entrar y abrir «Logros».
4. Con rival (duelo): al terminar, el Podio dibuja tu mejor nave. Arranque: `npm run serve -- --demo --limite-min 5` en `spike/`; `$env:VITE_TRANSPORT="local"; npm run dev -- --host` en `cliente/`.

## Provisional y límites

- `PUNTOS`, `RANGOS`, `INSIGNIAS`, `NAVES`, `UMBRALES` y `MIN_INTENTOS` son valores de partida, cada uno en un solo sitio.
- Todo se guarda solo en este dispositivo: sin cuentas, ranking ni sincronización; el mismo alias comparte perfil.
- Recargar la página en plena partida pierde los aciertos y fallos contados antes (el puntaje sí se conserva).
- Personajes y equipos propios llegarán con los sprites propios: hoy las naves reutilizan los 5 sprites del kit y no hay selector.
