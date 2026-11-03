# Informe de auditoría: mecánicas por modo (solo lectura)

Fecha: 2026-10-30. Alcance: `cliente/src` (Phaser) y `spike/src` (árbitro). No se modificó código; este es el único archivo creado.
Todas las rutas son relativas a la raíz del repo; los números de línea son del estado actual de la rama `audio`.

## 0. Hallazgos que cambian el planteamiento

1. **Solo hay UNA escena de juego**: `cliente/src/taller.ts` (clase `Taller`) pinta tutorial, práctica, bot y 1v1. No hay código duplicado entre `tutorial.ts` y `taller.ts`: `tutorial.ts` es solo datos + máquina de pasos (`MECANICAS`, `avanzar`, `permite`) y `taller.ts` lo dibuja. La desviación entre modos NO viene de copias de código sino de **un `if` que bifurca el flujo de la resistencia**: `conValidacion()` en `cliente/src/vista.ts:68-70`, que `Taller.validar()` (`taller.ts:63-66`) consulta en ~15 sitios.
2. `conValidacion` solo da `true` para (a) el tutorial `resistencia` con circuito `led`, o (b) PRÁCTICA nivel 1, sin Oleadas, circuito `led`/`cabina`. Por eso **el "gesto bueno" de la resistencia (arrastrar al hueco rojo, luz verde/ámbar/rojo, botón CHECK) no existe en: Jugar solo (bot), 1v1, práctica nivel 2, ni en ninguna otra mecánica.**
3. Confusión de nombres: el botón **JUGAR SOLO** (`inicio.ts:233`) llama a `net.jugarSolo` = **ContraBotTransport** (duelo contra bot, `practica=false`). El botón **PRACTICAR** (`inicio.ts:278`) = **PracticaTransport** (`practica=true`). Son modos distintos con reglas distintas.
4. **Jugar solo (bot) siempre es nivel 1**: `inicio.ts:233` pasa `nivelElegido(pf, 1)` (=1) y `ContraBotTransport` crea `new Arbiter({nivel})` → `generar(semilla, 1)` → solo `led` y `cabina`. Fusible, cable roto, LED girado y placa **nunca aparecen contra el bot**.
5. **Sabotaje no existe en el juego actual.** Solo aparece en documentos y en el código legado `juego/server/sala.js:365-368` (Vórtice, GDD v5) y en `decisiones-circuitsync*.md`. En `cliente/src` y `spike/src` no hay ni la palabra. Hay que diseñarlo desde cero (sección E).
6. **Oleadas no tiene entrada de menú**: `grep olead cliente/src/inicio.ts` = 0 resultados. Solo se llega con "OTRA" tras terminar unas Oleadas (`main.ts:55`, `net.practicar(..., oleadas)`). Es de facto código huérfano; aprovecharlo o retirarlo.
7. `PODS_TO_WIN = 5` (`arbiter.ts:9`) está **declarado y sin uso**; la condición real de fin es `s.despachados >= this.pods.length` (`arbiter.ts:362`) y el texto `"5 pods despachados"` está escrito a mano. La duración real de la partida está en `MATCH_LIMIT_MS` (`arbiter.ts:11`, 12 min).
8. Las **mejoras** (enfriamiento corto, escudo, doble puntos, multímetro rápido: `mejoras.ts:9-14`) solo existen en PRÁCTICA: se ofrecen en `taller.ts:600` (`limpio && p.practica`), y `Arbiter.ajustar` retorna si no es práctica (`arbiter.ts:114-118`); `net.elegirMejora` solo ajusta si `transport instanceof PracticaTransport` (`net.ts:214`). En bot y 1v1 **no hay ninguna recompensa en partida**.

---

## A) Tabla mecánica × modo

Leyenda: **Val** = flujo de validación (arrastrar al hueco = probar, luz del multímetro, CHECK). **Probar** = flujo clásico (elegir en gaveta, botón Probar, botón Despachar). En todos los modos la gaveta ya es arrastrable (`arrastrable` en `taller.ts:297-304`, `tablero.ts:108-125`), con toque corto como respaldo; lo que cambia es **qué hace el soltar**.

Render común: `cliente/src/taller.ts` (`pintar` L472-578, `update` L391-456, `pintarMedidor` L783-802, bloque del circuito L499-505, gaveta L536-549). Placa: `cliente/src/tablero.ts` + `placa.ts`.

| Mecánica | Tutorial (Aprender) | Práctica (PRACTICAR, PracticaTransport) | Jugar solo (bot) | 1v1 (sala, Photon) |
|---|---|---|---|---|
| **1 Resistencia** (`led`, `cabina`; en N2 también `combinar`, `divisor`, `protegido`) | **Val** solo `resistencia`/`led`. Arrastre al hueco rojo (`taller.ts:327,537`). Multímetro = luz verde/ámbar/rojo (`luzValidacion`, `multimetro.ts:66`), botones de modo ocultos (`taller.ts:552`). CHECK (`taller.ts:329-331`). Faltante: **hueco rojo parpadeante + "?"** (L502-503). Los tutoriales `multimetro`, `combinar`, `divisor`, `protegido` van en **Probar** con toque (`pide("1000")` etc.). | **Val** en nivel 1 (`led`/`cabina`); **Probar** en nivel 2 y en Oleadas. Misma pantalla que el tutorial en N1. Faltante: hueco rojo + "?" (N1) o caja gris + "?" (N2). | **Probar**. Arrastre solo "elige" (no prueba) y hay que pulsar Probar (`taller.ts:293` solo prueba si `val`). Multímetro con botones Tensión/Continuidad y aguja poco/correcto/demasiado tras Probar. Faltante: caja gris con "?" (`taller.ts:502`), sin hueco rojo. Sin puertas, sin mejoras. | Igual que bot, pero en `mixto`: pods 1-2 `led`, pod 3 `cabina`, 4-5 N2 (`generador.ts:96,141`). |
| **2 Fusible** (`fusible`, Reactor) | **Probar**, selección por toque (`tutorial.ts:92-99`). Multímetro con modos; texto fijo "fusible sano" (`multimetro.ts:23`). Faltante: caja gris + "?"; **sin hueco rojo**. | **Probar**; aparece desde N2 (`familias.json`, zona 3 en `sinCables` y `conCables`). | **No aparece** (bot = N1). | **Probar**; aparece en pods 4-5 con `mixto` (Reactor, `familias.json`). |
| **3 Placa / interruptor** (`luces`, `interruptor`) | **Probar** con placa 4x4 (`tablero.ts`): arrastre de piezas a la placa y cables por arrastre/toques; multímetro: tocar la pieza con un modo activo (`tablero.ts:234-237`). Faltante: pieza en la gaveta de la placa + flecha demo; texto `faltaColocar` (`placa.ts:236`). | Igual, desde N2 pods 4-5 (`conCables`). | **No aparece**. | Igual, pods 4-5 en `mixto`. |
| **4 Cable roto / LED girado** (`abierto`, `invertido`) | **Probar** con gaveta de 2 opciones (`dejar/empalmar`, `directa/inversa`), multímetro (continuidad) guiado. El tutorial oculta la pista del aviso (`taller.ts:459-461`). | **Probar**; aparece N2 pods 4-5 (`conCables` Radar/Turbina). **El aviso del árbitro regala la causa** ("está al revés", "cortado": `vista.ts:103-104`). | **No aparece**. | Igual que práctica (regala la causa). |
| **5 Sabotaje** | No existe. | No existe. | No existe. | No existe. |

### Qué difiere respecto del tutorial (lo que ve el dueño)

Cuando el dueño dice "el tutorial está bien en la resistencia y en solo/1v1 no se ve igual", se refiere a esto, todo en `taller.ts` bajo `validar()`:

| Elemento | Tutorial `resistencia` / Práctica N1 | Bot / 1v1 / Práctica N2 / otras mecánicas |
|---|---|---|
| Soltar la pieza | prueba al soltar (`taller.ts:293`, con la misma espera y "sin cambios" que Probar: L285-289) | solo elige; hay que pulsar Probar (L336-347) |
| Hueco "falta la pieza" | rectángulo rojo parpadeante + "?" (`taller.ts:327-328,537`) | caja gris `boton_secundario` + "?" (L502-503) |
| Multímetro | luz verde/ámbar/rojo + aguja teñida (L790-794); modos ocultos (L552) | aguja poco/correcto/demasiado tras Probar; botones Tensión/Continuidad con textos estáticos |
| Botones inferiores | CHECK de ancho completo (L570-574) | Probar + Despachar (L567-569) |
| Texto del aviso | "Arrastra una resistencia al hueco rojo" / "Multímetro en verde: pulsa CHECK" (L425-426) | "Elige y pulsa Probar" |
| Chispa | guía con avatar en la caja del tutorial (`crearGuia` L699-730) | no existe fuera del tutorial |
| Puertas, mejoras | puertas y mejoras solo en práctica (`abrirPuerta` L832-843, `ofertar` L621) | ninguna |

### Código duplicado y punto único de unificación

- `tutorial.ts` vs `taller.ts`: **no hay duplicación**; hay acoplamiento (los pasos usan `Accion` `{elegir}` / `{arrastrar}` según `val`: `taller.ts:283`). Si se unifica el flujo hay que cambiar los `pide(...)` de los tutoriales a `arrastra(...)` (`tutorial.ts:41-43`).
- Duplicación real dentro de `taller.ts`: dos flujos completos (`val` vs no-`val`) con botones, avisos y multímetro distintos; el indicador de pieza faltante dibujado en dos formas (`hueco` L327 vs caja gris L502); mensajes del veredicto en `vista.ts:98-109` (`CARGA`) duplican a los de `multimetro.ts:10-30` (`T`).
- `tablero.ts` tiene su propio arrastre (L108-125), distinto del de la gaveta (`taller.ts:297`), pero ambos usan `arrastre.ts` (único mecanismo; bien).
- `vista.ts` / `placa.ts` / `multimetro.ts` / `tablero.ts` son lógica pura o dibujo de componente; no se duplican entre sí.
- **Punto único donde unificar**: `conValidacion` (`vista.ts:68-70`). Basta con que devuelva `true` para todo circuito con gaveta (no `luces`/`interruptor`) y en todos los modos para que fusible, cable roto, LED girado, combinar, divisor y protegido adopten el gesto de la resistencia, **siempre que antes se extraigan de `val` dos comportamientos que no deben desaparecer**: (1) `this.modo = null` y ocultar los botones de modo (L477, L552), porque en la mecánica 4 el multímetro libre ES la herramienta; (2) la luz de validación necesita convivir con las lecturas del modo. Esfuerzo: M.

---

## B) Multímetro

### Qué muestra hoy

- Árbitro (`spike/src/engine/medir.ts:16-45`): Continuidad devuelve `{pasa}`; Tensión devuelve `{tension: nada|parte|toda, fraccion}` (fracción de la batería en décimas). Mide `montar(z, pieza)` con el calefactor en falla. Puntos: `pieza`, `carga1`, `carga2`.
- Cliente (`multimetro.ts`): `textoMedida` (L42-53) elige un texto fijo por tramo (`TRAMO`, L32-36). **La cifra `fraccion` solo mueve la aguja** (`anguloTension`, L39); no se escribe nunca.

### Por qué "siempre repite lo mismo"

1. En `led`/`cabina`, Tensión en `pieza` (la resistencia) da casi siempre "parte" ("Aquí cae parte de la batería", `multimetro.ts:34`) y Continuidad en la resistencia siempre "Pasa" (`multimetro.ts:17`) sin importar el valor: el texto no cambia entre 100 Ω y 1000 Ω; solo cambia el ángulo de la aguja (que el jugador no sabe interpretar).
2. Tensión en el LED (`carga1`): el LED conduce y cae ~2 V fijos → mismo texto siempre.
3. Fusible: Continuidad siempre "Pasa: el fusible está sano" (`multimetro.ts:45`, el probador de 3 mA nunca funde). En Tensión, `medir.ts:38` resuelve con el calefactor en falla: el 3 A lee "nada" y el 1 A y el 0,5 A leen ambos "toda" ("camino cortado"), así que 1 A y 0,5 A son indistinguibles con el multímetro.
4. En Probar-flow, el modo del multímetro oculta el veredicto de la aguja; al salir del modo la aguja vuelve a "poco/correcto/demasiado" (L798-802), pero el aviso del árbitro lo borra todo (`taller.ts:395`).

### Propuesta mínima de estado claro (sin filtrar la solución en partidas reales)

Principio: **lo legítimo es lo que daría un multímetro real**: tensión en un punto (con número), continuidad (cerrado/abierto) y polaridad. Lo ilegítimo es traducir una medición en "esta pieza es la correcta". Dos usos separados:

1. **Luz de validación (verde/ámbar/rojo)**: es el veredicto de un Probar, así que **solo se enciende al soltar la pieza** (el soltar = probar, con enfriamiento). Ya existe (`luzValidacion`). Se reutiliza tal cual para todas las mecánicas de gaveta. Estados: verde = correcto; ámbar = cerca (poco o demasiado, con la dirección en la aguja `poco`/`demasiado` ya existente); rojo = se quema/corto. Costo: 0 protocolo.
2. **Lecturas libres (botones Tensión/Continuidad)**, sin protocolo nuevo, solo cambio de cliente (`multimetro.ts` + `pintarMedidor`):
   - Tensión: escribir el número: `fraccion * z.volts` ("≈ 6,3 V de 9 V"), `z.volts` es público (`ZonaView.volts`). Legítimo: es lo que mostraría el aparato, y el jugador debe aplicar Ohm para decidir.
   - Delta frente a la lectura anterior en el mismo punto: "Más que antes / Menos que antes / Igual" (estado del cliente, no del árbitro).
   - Continuidad: chip "Cerrado" (verde) / "Abierto" (rojo); en LED, "Bloqueado por polaridad" (ya hay texto `ledSentido`, `multimetro.ts:26`).
   - Fusible: sustituir "sano" fijo por la lectura de tensión en el fusible **en operación normal** (nueva `Lectura` en `medir.ts`, caso `fusible`: calefactor `HEATER_OHMS.normal` en vez de falla) para que 0,5 A ("corta aun sin falla": lee "toda") se distinga de 1 A y 3 A ("nada"); el 3 A seguirá siendo malo solo al fallar. Tamaño: S en `medir.ts`.
3. **Qué NO mostrar nunca en partida real**: corriente en mA con etiqueta de rango correcto, "valor recomendado", o cualquier cosa que sea función solo de la solución. El tutorial sí puede hacerlo (texto `T`), porque `net.tutorial` ya distingue.

---

## C) Recompensas, enfriamiento y rachas con autoridad del árbitro

### Qué hay hoy

- `cliente/src/recompensas.ts`: **no** son recompensas en partida; son paneles de fin de partida (XP, rango, insignias: `panelRecompensas` L50, `panelLogros` L103).
- **Enfriamiento de fallo**: `spike/src/arbiter/penalties.ts`.
  - `COOLDOWNS_MS = [2000, 4000, 8000]` (L7): 2 s, 4 s, luego 8 s por zona. No existe un 6 s; el "6 s → 3 s" del dueño no coincide con la tabla actual (a aclarar con el dueño: 4→2 s o 8→4 s).
  - `BURN_BLOCK_MS = 4000` (L8): bloqueo de todo el pod tras una pieza quemada; `BURN_CARD_MS = 3000` es la tarjeta.
  - Dónde se aplica: `PenaltyTracker.canTest` (L40-48) devuelve `enfriamiento`/`quemada`/`sin-cambios`; `registerFailure` (L57-64) escala `fails` y multiplica por `cooldownFactor` (L33, L60); `registerBurn` (L67-70). `Arbiter.test` (`arbiter.ts:284-325`) rechaza con `reject` y devuelve `waitMs` en el `Result` (`protocol.ts:87`); el cliente solo pinta `esperaHasta` (`pantalla.ts:158`, `taller.ts:396-399`).
  - `newPod` (L78-81) reinicia contadores en cada despacho.
- Recompensas en partida: `llamas` (pods limpios, `arbiter.ts:353`, solo visual y +20 puntos), mejoras (solo práctica, fuera del árbitro excepto `ajustar`), "puerta" de preguntas con `puertaRacha` (cliente, solo práctica: `taller.ts:839`).

### Cómo añadir rachas con autoridad del árbitro

Todo el estado va en el `Seat` y en `PenaltyTracker` (ambos jugadores usan el mismo código; no hay rama por jugador, así que es justo por construcción).

1. `penalties.ts`: contador `aciertosSeguidos` (se incrementa en `registerSuccess`, se pone a 0 en `registerFailure`/`registerBurn`). Constante `RACHA_PERDON = 3` y `PERDON_FACTOR = 0.5`. Campo `perdon: boolean`: al llegar a `RACHA_PERDON` se arma; el **próximo** `registerFailure` consume el perdón (aplica el factor al `ms` y limpia `perdon` y `aciertosSeguidos`). Máximo una carga guardada (no se acumula).
2. `arbiter.ts` (`test`, L284-325): después de `registerSuccess`/`registerFailure` leer el resultado y mandar en el `Result` un campo opcional `bono?: "perdon-listo" | "perdon-usado"` y `racha?: number` (aditivo, compatible con clientes viejos).
3. `Snapshot` (reconexión): incluir `racha` y `perdon` para que quien vuelve vea el mismo estado (`arbiter.ts:419-426`).
4. Cliente: solo muestra ("¡Racha 3! Tu próximo fallo espera la mitad" con la llama del HUD, `taller.ts:615`); nunca calcula el tiempo. Lo ya existente `mejoras.ts` (cooldownFactor) queda para práctica; en bot/1v1 las rachas reemplazan a las mejoras, que no existen ahí.
5. Justicia: el perdón se gana por aciertos propios, no depende del rival, con el mismo umbral para ambos; no se hereda entre pods si no se quiere (decisión: reiniciar en `newPod()` o conservar; recomiendo conservar el contador pero perder el perdón armado al despachar, para evitar "reservarlo").
6. Tests: `spike/test/arbiter.test.ts` y `penalties` (patrón actual: reloj inyectable).

Esfuerzo: S (árbitro) + S (cliente: toast + llama). Riesgo bajo.

---

## D) Oleadas en 1v1 (5 pods iniciales hasta 10 según nivel de ambos)

### Estado actual

- Oleadas (`PracticaTransport(nivel, semilla, oleadas=true)`, `practica.ts:17`): `Arbiter` con `oleadas` (`arbiter.ts:109`: `this.oleadas = this.practica && ...`; solo con práctica) llena `pods` a demanda con `podAt` → `generarOleada(semilla, nivel, i+1)` (`generador.ts:160-173`): cada 3 pods sube un escalón (1→4 zonas), falla encadenada desde la oleada 3 (`ENCADENADAS`, L179), sin fin; termina con `QUEMADAS_OLEADAS = 3` (`penalties.ts:11`).
- 1v1 (y bot): `generar(semilla, nivel)` devuelve **exactamente 5** pods (`generador.ts:126`, `PODS_POR_PARTIDA = 5` L11) y `validarPartida` lo exige ("no son 5 pods", L219). Fin: `s.despachados >= this.pods.length` (`arbiter.ts:362`) o `MATCH_LIMIT_MS` (L175, 12 min) con desempate por pods y luego menos quemadas (L367-371). `Snapshot.total` ya existe en el protocolo (`protocol.ts:82`, `arbiter.ts:423`) y el cliente lo usa casi en todo (`textoPod`, `casillas`, `textoRival`, `cola`).
- Nivel del servidor, no del jugador: `serve.ts:35-37` (`--nivel` o `mixto`) → `hostRoom(..., {nivel,...})` (`serve.ts:101`); lo único que viaja es `SalaInfo.nivel` (1|2, `room.ts:33`). `Hello` solo lleva `alias` (`protocol.ts:62`): **el árbitro no conoce el perfil de nadie** (el perfil vive en localStorage del cliente: `perfil.ts:168-191`).

### Qué cambia

| Capa | Cambio | Archivos | Tamaño |
|---|---|---|---|
| Protocolo | `Hello.rango?: 0-3` (índice en `RANGOS`) y opcional `nivel2?: boolean`; `Snapshot.total` ya sirve (5..10). `Result` sin cambios. | `protocol.ts` | S |
| Árbitro | Guardar `rango` en el `Seat`; en `start()` (L275) calcular `total` (ver fórmula) y `limitMs`; sustituir `this.pods.length` por `this.total` en `dispatch` (L362), `snapshot` (L423), `podView` (L402-406, el `Math.min(despachados, length-1)`) y el texto del fin ("N pods despachados"); `podAt` ya existe y genera a demanda. Sanear `rango` (entero 0-3, el cliente no es de confianza). | `arbiter.ts` | M |
| Generador | `generar(semilla, nivel, demo, total=5)` con pods 6-10 (continuar la rampa N2 `conCables`); o usar `generarOleada` para los pods > 5 (ya valida cada zona). `validarPartida` pasa de `PODS_POR_PARTIDA` a `total`; presupuesto del pod 6+ (`presupuesto <= 7`, L251); `validar-sorteos.ts`. | `generador.ts`, `validar-sorteos.ts` | M |
| Cliente (HUD) | `contador_pods_0..5` es un sprite fijo (`taller.ts:480`: `Math.min(p.despachados, 5)`); `MAX_LLAMAS = 5` (`progreso.ts:24`); casillas del rival miden 20 px (`taller.ts:587`: 10 caben pero ajustados); `textoRival` ya usa `total`. `podDe(n)` usa módulo (`sprites.ts:19`), seguro para n>5. `Carril.pod` documenta "1-5" (`protocol.ts:99`) pero es `1+floor(azar*despachados)` (OK). | `taller.ts`, `progreso.ts`, `sprites.ts` | M |
| Bot | `ContraBotTransport` crea el árbitro sin pasar rango (`contraBot.ts:57`); usar el rango del jugador local. | `contraBot.ts`, `net.ts` | S |
| Pruebas | Tests con `pods.length === 5` en `spike/test/arbiter.test.ts`, `generador`; `MATCH_LIMIT_MS` L260. | `spike/test/*` | M |

### Cómo definir "nivel de ambos" con lo que existe

- Fuente: `RANGOS` (`perfil.ts:13-18`, índices 0-3 por XP; `rangoDe`, L124) y `nivelDesbloqueado` (1|2, `perfil.ts:24`).
- Regla justa y simétrica: `rango_partida = min(rangoA, rangoB)` (el más débil fija la dificultad: nadie es aplastado) y `total = 5 + round(5 * rango_partida / 3)` → Aprendiz 5, Técnico 7, Experto 8, Maestro 10. Nivel de familias (`nivelDePod`): `mixto` si ambos tienen `nivelDesbloqueado === 2`, si no `1`. Un jugador que declare un rango falso solo puede bajar la dificultad **para los dos**: no hay ventaja relativa (el único daño es XP fácil; se puede mitigar derivando el rango del alumno en el servidor desde `spike/src/docente/alumnos.ts`, fase 2).
- Duración: `limitMs = max(12, 1.5 * total) minutos` (`total=10` → 15 min). Hoy el límite de 12 min está sin validar con el tutor (`arbiter.ts:10`).

### Riesgos

- **Justicia**: ambos reciben los mismos pods (ya cierto con `generar`/`podAt`); el `total` se fija antes de la cuenta y no cambia durante la partida.
- **Duración / demo**: 10 pods ≈ 10+ min; la demo del comité es de 5 min (`serve.ts` `--demo`). Mantener `total = 5` en demo (`demo !== false`).
- **Reconexión**: el `Snapshot` ya manda todo lo necesario si incluye `total`; los pods se regeneran de la semilla (`podAt`). Bajo riesgo.
- **Límite de partida**: con `tiempo`, el desempate usa pods despachados (OK con total variable).
- **Crecimiento dinámico** (que el total suba durante la partida): peor idea; desalineado con "primero en llegar gana" y con el protocolo de `total`. Descartar.

**Viabilidad: sí, con total estático decidido al empezar. Esfuerzo global M (3-5 días), no L**, siempre que el HUD de 10 pods se acepte con casillas pequeñas.

---

## E) Sabotaje (no existe; diseñarlo)

Dónde está hoy: solo en `juego/server/sala.js:365-368` (legado Vórtice) y en `decisiones-circuitsync*.md` (A3, A13, P3, P5). Nada en el cliente ni en el árbitro actuales.

### Mecanismo propuesto (árbitro decide, mismo contador para ambos)

- Disparo: `dispatch()` del `Seat` (`arbiter.ts:346-363`) ya sabe si el pod fue limpio (`s.podFallos === 0`, L353). Añadir `rachaLimpia` en el `Seat`; al llegar a 3 pods limpios seguidos se concede **un** sabotaje que se aplica al rival (en 1v1 y bot; en práctica no hay rival).
- Mensaje nuevo (aditivo): `Sabotaje { t: "sabotaje"; tipo: TipoSabotaje; ms: number; de: Station }` ServerMsg al rival, y `SabotajeEnviado` (o reutilizar `Result.bono`) al atacante. El rival no puede rechazarlo ni disparar uno: sin mensaje cliente→árbitro nuevo.
- Quién decide: el árbitro. El tipo se elige **al azar entre 2 candidatos** con la semilla del árbitro (`this.azar`, `arbiter.ts:104`), para que no sea determinista ni "dirigido".
- El árbitro lleva `sabotajesRecibidos`, `inmuneHasta` y reglas anti-frustración (abajo). Todo el estado en `Seat`.

### Opciones (6-8)

| # | Efecto | Implementación | Riesgo injusticia/frustración | Mitigación |
|---|---|---|---|---|
| 1 | **Humo**: nubla bahía y gaveta ~6 s | Cliente: overlay con `tween`/alpha sobre `escena`/`panel`; árbitro solo manda `ms` | Medio: no se ve la pieza | Despeja con 3 toques ("limpiar visor"); 6 s máx; no cubre el botón Probar ni el HUD |
| 2 | **Enfriamiento largo**: el siguiente fallo del rival espera +2 s (o ×1,5) | `PenaltyTracker.penalizaProximo` consumido en `registerFailure` (`penalties.ts:57`) | Bajo: solo duele si falla | Una sola carga; no se acumula; el aviso lo dice |
| 3 | **Sin pista de zona dañada**: pestañas y humo de zona sin marcar ~8 s | Cliente: `pestanasArte`/`estadoZona` devuelven neutro; el texto "Objetivo: repara X" (`progreso.ts:39`) se oculta | Bajo-medio | Duración 8 s; el mapa vuelve al acertar |
| 4 | **Interferencia en el multímetro**: rechaza `medir` 8 s ("interferencia") | `Arbiter.measure` (`arbiter.ts:332`) responde `reject` | Medio: en mecánica 4 el multímetro es la herramienta | Duración 6 s; que no aplique si el rival ya midió en esta zona |
| 5 | **Reloj oculto del pod** ~10 s (solo cosmético) | Cliente: oculta `ui.podT` | Muy bajo (poco efecto) | — |
| 6 | **Gaveta barajada**: reorden aleatorio de las opciones de la zona activa | Árbitro: `podView` con otro `shuffle` (pero rompe la regla de que ambos reciben el mismo orden y los jugadores memorizan posiciones) | Medio: los sorteos justos son "mismas opciones, orden propio"; hoy ya es aleatorio | Solo una vez por pod |
| 7 | **Falla extra**: añade una zona dañada más al pod del rival (como `encadenada`) | `Pod.encadenada`/`generarOleada` adaptado; cambia `podView` | **Alto**: puede decidir la partida | Excluir; solo si el rival lleva ventaja |
| 8 | **Chispa distraída**: Chispa dice un consejo falso no informativo | Cliente | Bajo, pero poco sentido | — |

### Reglas de justicia comunes (obligatorias)

- Máx. 1 sabotaje recibido por pod; máx. 3 por partida por jugador.
- Inmunidad de 20 s tras recibir uno.
- No se concede si el rival va 2 o más pods por detrás de quien lo ganaría (anti bola de nieve) o si el rival ya está bloqueado/penalizado (`penalUntil`).
- Duración corta (≤ 8 s) y avisada en pantalla ("Rival: ¡humo!") para que parezca juego y no castigo del sistema.
- Contrarrestable (opción 1: limpiar; opción 3: se recupera al acertar).

### Recomendación: las 3 mejores

1. **Humo (1)**: el más legible y "de juego", puro cliente, nada de lógica de piezas; con limpieza por toques es contrarrestable.
2. **Enfriamiento largo en el próximo fallo (2)**: sobre un sistema que ya existe (`registerFailure`), afecta solo si el rival falla, esfuerzo S, sin nuevas pantallas.
3. **Sin pista de zona dañada (3)**: no bloquea nada, solo quita ayuda visual (el jugador sigue teniendo la lista y las pestañas); bajo riesgo de frustración.

Dejar fuera la 7 (falla extra) y la 4 (multímetro) de entrada: la 4 es dura en mecánica 4 y la 7 decide partidas.

---

## F) Mecánica 4 (cable roto / LED girado)

### Por qué se siente repetida

1. **Mismo verbo que resistencia y fusible**: "elige 1 de N en la gaveta y pulsa Probar". Aquí N=2 (`PIEZAS.invertido = ["directa","inversa"]`, `PIEZAS.abierto = ["empalmar","dejar"]`, `pods.ts:23-24`), o sea un 50 % de acertar sin pensar: el multímetro no es necesario.
2. **El aviso regala la causa** tras el primer Probar: `CARGA.invertido.poco = "El LED no enciende: está al revés ... Prueba girarlo"` y `CARGA.abierto.poco = "... el circuito está cortado ... Prueba cerrar el corte"` (`vista.ts:103-104`). Solo el tutorial lo oculta (`taller.ts:459-461`); en 1v1 y práctica el diagnóstico llega gratis en 2 s.
3. Fallar solo cuesta 2 s (no quema: el veredicto es `poco`, `pods.ts:110`), así que adivinar es la estrategia óptima.
4. Los componentes son constantes (R = 470 Ω fija en `invertido`, `abierto`): no hay variación de valores como en resistencia (sorteo de 3,7/4,5/9 V).
5. Solo aparece en los pods 4-5 de `mixto` o en N2 (`familias.json:5`), pocas veces por partida.

### Tres rediseños con verbos distintos

| # | Verbo | Descripción | Viabilidad (qué toca) | Esfuerzo |
|---|---|---|---|---|
| 1 | **Localizar y reparar** (diagnosticar → elegir) | El circuito tiene 3-4 tramos/piezas en serie (batería → cable A → resistencia → cable B → LED). El jugador **toca el tramo con la falla** usando continuidad o tensión por tramo (medidas ilimitadas), y recién al marcarlo aparece la gaveta de reparación (empalmar, girar, cambiar). Marcar mal cuesta enfriamiento. | `pods.ts` (`montar`, más `puntos`, p. ej. `tramo1..4`), `medir.ts` (ya acepta `punto` arbitrario), `protocol.ts` (`TestMsg.pieza` = `"tramo2:empalmar"`), `PIEZAS`, `validarZona` (fuera de la regla "una sola correcta entre opciones"), dibujo en `taller.ts` (bloque circuito L499-505, `medirToque` L253-264). | M-L |
| 2 | **Ordenar pasos** | Tarjetas arrastrables que hay que dejar en orden: desconectar batería → medir continuidad → reparar → reconectar → probar. Se ordena arrastrando. | Nueva familia `procedimiento` en `PIEZAS`/`evaluar`; el árbitro evalúa una permutación; cliente: lista arrastrable (similar a `arrastre.ts`). No usa el solver. | M; riesgo: es memorística y se aparta de "circuito". |
| 3 | **Cambiar la pieza muerta** (localizar entre varias) | Cadena visible de 3-4 piezas (LED, diodo, resistencia, fusible) con **una abierta por dentro**. Se usa Continuidad por pieza (`carga1`, `carga2`, `pieza`) para encontrarla y se arrastra un repuesto sobre ella. | `montar` con varias piezas ya existe (`protegido` L62-63), `medir.ts` tiene puntos por pieza; cliente: arrastre de repuesto a una ranura por pieza (reusa `arrastrable` y `dentro` de `arrastre.ts`). | M |

**Recomendación: #3 (cambiar la pieza muerta)**, o #1 si hay tiempo. #3 reutiliza mecanismos ya presentes (varios puntos de medida, arrastre, `protegido` como base) y transforma el multímetro en el núcleo de la jugada: ya no se adivina entre 2 sino que hay que medir cada pieza. Además hereda la unificación de arrastre. Quitar también el texto que regala la causa (`vista.ts:103-104`) en modos reales.

---

## G) Placa/protoboard más difícil y realista

Nota sobre la fuente: la página de areatecnologia.com (leída con WebFetch) **no trata protoboard, fusible, serie/paralelo ni multímetro**; sí trata resistencias (código de colores), polaridad de diodo/LED, divisor de tensión, interruptores vía relé/transistor, condensador. Las reglas de protoboard (tiras de 5 contactos, canal central, rieles de alimentación) vienen de conocimiento general, no de esa página.

### Qué existe

- Motor: `spike/src/engine/circuit.ts` soporta batería, resistor, lámpara, motor, LED, diodo, cable, calefactor, fusible, `solve()` nodal, `classify()` serie/paralelo/mixto (L170), polaridad del LED y del diodo (L54-66), cortocircuito (L141). **No hay**: interruptor como pieza propia (hoy `wire` = cerrado, ausente = abierto), condensador, tira de contactos.
- Placa del cliente: 4x4 casillas independientes, riel + izquierda y − derecha (`placa.ts:1-16`); dos cargas verticales; cables en ángulo recto; `montaje()` (L211-230) **reduce el cableado a 3 valores** (`serie`, `paralelo`, `puente`) y el árbitro solo evalúa eso (`PIEZAS.luces`, `PIEZAS.interruptor`, `pods.ts:18-19`). `validarZona` exige una única opción correcta con margen ±5 % (`generador.ts:205-215`); un cableado libre no encaja.
- Falta: tiras conectadas por columna, canal central, piezas colocables además de las 2 cargas, giro de polaridad, valores de resistencia en placa, interruptor con estado.

### Escalera de 5 niveles

| Nivel | Meta | Qué se practica | Ya existe | Hay que añadir |
|---|---|---|---|---|
| P1 Primer circuito | Batería + LED + resistencia dada en la placa | Colocar, cableado + − , polaridad del LED (girarlo) | Piezas LED/R en solver; arrastre; rieles | Piezas LED y R colocables en `placa.ts` (hoy solo `carga1/carga2`); gesto de girar; `montaje` → netlist `Part[]` |
| P2 Resistencia limitadora | Elegir el valor de R para un LED con 3,7/4,5/9 V | Ohm y límite de corriente | Familia `led` y veredicto (`pods.ts:50`) | Mostrar R en la placa y arrastrarla a su sitio; reutiliza el sorteo |
| P3 Tiras reales | El mismo circuito pero la casilla de arriba y abajo de una columna están unidas por una tira; hay un canal central | Que dos terminales en la misma tira están en cortocircuito | Unión-find de `montaje` | Pre-unir casillas por tira en `montaje()`; cargas deben cruzar el canal (cambio de `ranuraValida`, `placa.ts:176`); `tablero.ts` dibujo del canal |
| P4 Serie / paralelo e interruptor | Luces en serie y paralelo; interruptor en serie con motor | Topología, interruptor abierto/cerrado, rieles | `luces`, `interruptor`, `classify` | Interruptor con estado (`wire` vs omitido en `montar`); tests |
| P5 Mixto con protección | Rama con diodo/fusible en serie y otra en paralelo; resistencias limitadoras | Combinar, polaridad de diodo, fusible en serie | `protegido`, `fusible` y `classify` "mixto" | Evaluador `evaluarMontaje(netlist, objetivo)` en el árbitro (en lugar de elegir 1 de N): "LED 10-20 mA, motor ≥ 90 %, sin corto" |

### Qué cambia estructuralmente

- Para pasar de P3, el cliente deja de mandar `"serie|paralelo|puente"` y manda un **netlist validado** (piezas + casillas + cables) en `TestMsg`; el árbitro lo traduce a `Part[]` y usa `solve()` (autoridad en el árbitro, ya es la regla). Además `validarZona` se reemplaza por "existe al menos un cableado que cumple". Esfuerzo L, es el mayor cambio de la lista; P1-P2 son M, P3 M, P4 S-M, P5 L.
- Recomendación: hacer **P3 + P4** primero (valor realista alto, mantienen el protocolo y el modelo de 3 montajes con pequeñas extensiones) y dejar P1/P5 (netlist libre) como fase 2.

---

## H) Plan de implementación en bloques (sin pisar archivos)

Regla: cada archivo tiene un dueño por bloque. `taller.ts` (883 líneas, monolítico) se toca **solo en serie**, un agente a la vez. `protocol.ts` y `arbiter.ts` solo en el bloque B.

| Bloque | Contenido | Archivos (dueño exclusivo) | Depende de | Paralelo con | Esfuerzo |
|---|---|---|---|---|---|
| **A1 Motor** | Fusible: lectura de tensión en operación normal; `generar(..., total)`; `validarPartida(total)`; pods 6-10 | `spike/src/engine/generador.ts`, `medir.ts`, `pods.ts`, `familias.json`, `validar-sorteos.ts`, `spike/test/{generador,medir,nivel2-*}.test.ts` | — | C1 | M |
| **C1 Lógica cliente pura** | Multímetro con números y delta; `conValidacion` para todas las gavetas; textos de veredicto no filtran causa fuera del tutorial; rachas HUD (puro) | `cliente/src/{multimetro,vista,progreso,pantalla,tutorial}.ts` + sus tests | — | A1 | M |
| **B Árbitro + protocolo** | Hello.rango, total variable, límite escalado, rachas (perdón), `Result.bono`, `Sabotaje`, `Snapshot` ampliado, `contraBot` con rango | `spike/src/protocol.ts`, `arbiter/arbiter.ts`, `arbiter/penalties.ts`, `transport/room.ts`, `serve.ts`, `cliente/src/{contraBot,practica,net}.ts`, `spike/test/arbiter.test.ts` | A1 | C1 | M |
| **D1 Taller: unificar flujo** | Un solo flujo de colocar/probar/CHECK en todas las gavetas; hueco "?" para fusible y demás; multímetro con estado; tutoriales a `arrastra()` | `cliente/src/taller.ts`, `cliente/src/tutorial.ts` (pasos `pide`→`arrastra`) | C1 | — | M |
| **D2 Taller: fusible y Chispa** | Animación del fusible viejo (cuelga 2-3 s y cae, objeto independiente con vida en tiempo real, como `carteles` L409-415); Chispa señalando el objetivo bajo el globo (reutiliza `rectas()` L733-748 y `pistaDemo` generalizado) | `cliente/src/taller.ts`, `chispa.ts`, `pantalla.ts` (solo `pistaDemo`) | D1 | `tablero.ts`/`placa.ts` (D3) | M |
| **D3 Placa** | Tiras/canal central y arrastre unificado (P3), interruptor con estado (P4) | `cliente/src/{placa,tablero}.ts`, `spike/src/engine/pods.ts` (solo casos `luces`/`interruptor`, coordinar con A1) | A1 | D2 | M |
| **D4 Taller: rachas, sabotaje, HUD de 10 pods** | Toasts de racha, humo, sin pista, casillas/contador variables | `cliente/src/taller.ts`, `sprites.ts`, `arte.ts` | B, D2 | — | M |
| **E Mecánica 4 rediseño (#3)** | Nueva familia con varias piezas y reparación por arrastre | `pods.ts`, `generador.ts`, `familias.json`, `protocol.ts` (`Circuito`), `taller.ts` | B, D4 | — | M |
| **F Oleadas de menú** | Decidir si Oleadas se expone o se elimina | `inicio.ts`, `main.ts` | — | cualquiera | S |

Orden recomendado: (1) A1 ‖ C1, (2) B, (3) D1, (4) D2 ‖ D3, (5) D4, (6) E, (7) F. Verificar al terminar cada bloque con `npm test` en `spike` y `cliente`, y `graphify update .` al final.
