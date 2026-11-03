# Pruebas de usuario con personas ajenas al proyecto

Referencia: Jira SCRUM-144 (feedback del tutor: probar con gente que no conoce el proyecto).

## 1. Objetivo y qué se mide

Comprobar si una persona sin conocer el proyecto entiende las mecánicas de CircuitSync (resistencia, fusible, placa, multímetro), puede usar la interfaz sin ayuda y se divierte. Se mide:

- Comprensión de las mecánicas (preguntas de aprendizaje y lo que dice en voz alta).
- Usabilidad: SUS, tareas completadas sin ayuda, errores de interacción.
- Tiempo hasta la primera reparación de un pod.
- Errores y puntos de duda (dónde se atasca y por qué).
- Diversión y frustración (preguntas de cierre).

No se evalúa a la persona, sino el juego. Si algo falla, el fallo es del juego.

## 2. Participantes

- Mínimo 8 personas: al menos 5 sin electrónica previa y al menos 3 con algo de electrónica (curso básico, afición, técnico).
- No deben ser del equipo, ni docentes del proyecto, ni haber visto el juego antes.
- Reclutamiento: compañeros de otras carreras, familiares o amigos que no sean del equipo, y gente de la biblioteca o del campus. Anotar solo el código P1, P2... y el perfil (sin nombre ni contacto en la hoja de resultados).
- Consentimiento informado (una frase, leer antes de empezar):

> «Participas por voluntad propia, puedes parar cuando quieras, y solo anotamos lo que haces en el juego, sin tu nombre ni grabación de video: ¿aceptas?»

Si dice que no, se le agradece y no se registra nada.

## 3. Preparación técnica

- Build local: en `cliente/` ejecutar `npm run build` y luego `npm run preview -- --host`. Abrir `http://localhost:4173` en el PC. Para celular en la misma WiFi, usar la URL «Network» que muestra la consola. También vale el sitio publicado.
- Navegador: Chrome o Edge actualizados, en el celular el navegador por defecto. Probar antes en el dispositivo que se usará.
- Volumen: subir el volumen y comprobar que suena la música. El botón ♪/× silencia todo.
- Saltar la intro: abrir la URL con `?intro=0` (por ejemplo `http://localhost:4173/?intro=0`). Sin el parámetro la intro se muestra solo la primera vez.
- Reiniciar el perfil de prueba entre participantes: en DevTools (F12) > Application > Local Storage > borrar todas las claves de `localhost:4173`. Las claves del juego son `circuitsync.intro`, `circuitsync.alias`, `circuitsync.perfil`, `circuitsync.dificultad`, `circuitsync-mudo` y `circuitsync-volumen`. En el celular, borrar datos del sitio desde el navegador. Si el perfil no se limpia, el participante ya aparece con progreso.
- Duelo de dos personas (tarea 4): el árbitro corre en el PC con `npm --prefix spike run serve` (relé en el puerto 8787). Para que el celular lo vea, el build debe usar relé local (`VITE_TRANSPORT=local`) y el celular abre la página con `?relay=ws://IP_DEL_PC:8787`. Si el firewall bloquea, permitir el puerto 8787 en red privada. Reiniciar el árbitro (Ctrl+C y volver a ejecutar el comando) antes de cada duelo para tener una sala nueva.
- Antes de cada sesión: abrir el juego una vez, comprobar que carga, que suena y que el tutorial arranca. Anotar la hora de inicio.

## 4. Guion de la sesión (~25 min)

El facilitador no explica el juego, no da pistas y no toca el dispositivo. Si la persona pregunta algo, responde: «Intenta lo que creas; si no sabes, dilo en voz alta». Pedir que piense en voz alta («dime qué estás mirando y qué quieres hacer»).

| Tiempo | Bloque | Instrucción al participante |
|---|---|---|
| 0:00–2:00 | Bienvenida y consentimiento | Leer la frase de consentimiento. Decir: «Es un juego de electrónica; te pido que pienses en voz alta». No explicar las reglas. |
| 2:00–7:00 | Tarea 1: Tutorial «Resistencia» | «Entra con un alias y abre el Tutorial de Resistencia. Termínalo sin ayuda.» Límite 5 min. |
| 7:00–12:00 | Tarea 2: otra mecánica | «Elige Fusible o Placa y completa su tutorial o su primer pod.» Límite 5 min. |
| 12:00–16:00 | Tarea 3: Jugar solo contra el bot | «Pulsa Jugar solo y juega una partida contra el bot hasta el final o hasta que te lo pida.» Límite 4 min. |
| 16:00–21:00 | Tarea 4: duelo 1v1 (si hay dos participantes) | Dos personas entran con el mismo código de sala y alias distintos. «Juega contra la otra persona.» Si no hay pareja, omitir y anotar «no aplica». |
| 21:00–25:00 | Preguntas de cierre y cuestionario | Leer las preguntas de la sección 6 (en voz alta o en formulario). |

Reglas durante las tareas:

- Si la persona lleva más de 2 min sin avanzar, anotar el momento y el bloqueo. Preguntar solo «¿qué crees que pasa?». No dar la respuesta.
- Si pide ayuda, anotar «pidió ayuda» en la ficha y el tiempo; no se cuenta como completada sin ayuda.
- Si el juego se bloquea o falla, anotarlo como error de severidad 3 y seguir con la siguiente tarea.

## 5. Ficha de observación

Una fila por evento. Severidad: 1 = molesta, sin frenar; 2 = retrasa o confunde; 3 = bloquea la tarea.

| Participante | Tarea | Momento (mm:ss) | Qué hizo | Dónde dudó | Error | Frase literal | Severidad (1-3) |
|---|---|---|---|---|---|---|---|
| P1 | T1 | 03:10 | Tocó la resistencia de 100 Ω y pulsó Probar | Pantalla de elegir valor | Eligió 100 Ω, quemó la pieza | «¿Por qué se quemó?» | 2 |
| | | | | | | | |
| | | | | | | | |
| | | | | | | | |

Para copiar a hoja de cálculo: pegar la tabla en Excel o Sheets y separar por columnas con «Datos > Texto en columnas» (separador `|`). Guardar un archivo por sesión: `resultados/P1-ficha.csv`, sin nombres reales.

## 6. Cuestionario post-sesión

Escala de 1 a 5 (1 = totalmente en desacuerdo, 5 = totalmente de acuerdo). Cada participante responde en el mismo orden.

**SUS adaptado (10 ítems, español):**

1. Creo que me gustaría usar este juego con frecuencia.
2. Encontré el juego innecesariamente complejo.
3. Pensé que el juego era fácil de usar.
4. Creo que necesitaría ayuda de una persona técnica para poder usar este juego.
5. Encontré que las distintas funciones del juego estaban bien integradas.
6. Pensé que había demasiada inconsistencia en el juego.
7. Imagino que la mayoría de las personas aprenderían a usar este juego muy rápido.
8. Encontré el juego muy difícil de usar.
9. Me sentí muy seguro al usar el juego.
10. Necesité aprender muchas cosas antes de poder empezar a usar el juego.

Puntuación SUS: en los ítems impares (1, 3, 5, 7, 9) restar 1 a la respuesta; en los pares (2, 4, 6, 8, 10) restar la respuesta a 5. Sumar los 10 valores y multiplicar por 2,5 (rango 0-100).

**Preguntas propias (1-5 o respuesta abierta):**

- ¿Entendiste qué hacer con la resistencia? (1-5)
- ¿Qué significa el multímetro? (abierta)
- ¿Qué aprendiste? (abierta)
- ¿Qué cambiarías? (abierta)
- ¿Lo recomendarías a un amigo? (1-5)
- ¿Te frustraste en algún momento? (1-5, y en qué)

**Preguntas de aprendizaje (abiertas, sin ayuda, anotar la respuesta literal):**

- ¿Qué pasa si una resistencia es muy pequeña en un LED?
- ¿En serie las resistencias se suman o se reparten?

Anotar si la respuesta es correcta, parcial o incorrecta, sin corregir al participante.

## 7. Métricas y criterios de éxito

Umbrales propuestos; el equipo los confirma antes de la primera sesión.

| Métrica | Cómo se mide | Criterio de éxito |
|---|---|---|
| Tutorial completado sin ayuda | Tarea 1 terminada sin pedir ayuda | ≥80 % de participantes |
| Usabilidad | SUS | ≥68 (media del grupo) |
| Tiempo a primer pod | Desde que entra hasta el primer despacho de pod | ≤3 min (mediana) |
| Comprensión | Respuestas correctas a las 2 preguntas de aprendizaje | ≥70 % con al menos una correcta |
| Errores de severidad 3 | Eventos que bloquean la tarea | 0 en la tarea 1; máximo 1 por tarea en las demás |
| Diversión | Recomendaría el juego (1-5) | Media ≥4 |

## 8. Registro y resumen de resultados

Crear la carpeta `resultados/` con un CSV de fichas por participante, más un resumen en `resultados/resumen.csv` con una fila por participante: código, perfil (sin electrónica / con algo), tiempo a primer pod, tareas sin ayuda (0-4), SUS, respuestas de aprendizaje, número de errores de severidad 3.

**Tabla de hallazgos priorizados:**

| ID | Hallazgo | Tarea | Participantes afectados (n/N) | Severidad máxima | Prioridad (P1/P2/P3) | Acción propuesta | Responsable | Estado |
|---|---|---|---|---|---|---|---|---|
| H1 | | | | | | | | |
| H2 | | | | | | | | |
| H3 | | | | | | | | |

Regla de prioridad: P1 si bloquea a ≥ 2 personas o es severidad 3; P2 si retrasa a ≥ 3 o es severidad 2; P3 el resto.

**Plantilla de informe de 1 página para el comité:**

- **Objetivo y muestra:** cuántos participantes, perfil, fecha, duración de la sesión.
- **Resultados frente a criterios:** tabla con cada métrica de la sección 7, valor obtenido y si cumple.
- **Hallazgos principales (máx. 3):** qué se observó, con una cita literal cuando exista.
- **Cambios decididos:** los hallazgos P1 con acción y responsable.
- **Limitaciones:** número pequeño de participantes, sesión corta, dispositivo usado, cualquier fallo técnico durante las pruebas.
- **Siguiente paso:** qué se probará en la próxima ronda.

No incluir datos que no se hayan medido. Si una métrica no se pudo medir, escribir «no medido».
