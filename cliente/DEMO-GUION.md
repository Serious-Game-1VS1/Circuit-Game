# Guion de la demo del 14-nov-2026 (comité de tesis, 10 a 12 min)

Sitio: https://juego.circuitsyncjuego.com (commit a8e9ec0, protocolo 2). Dos dispositivos con alias `demo1` y `demo2`, más una diapositiva de arquitectura. Cada minuto: qué se dice y qué se muestra.

## 0. Preparación técnica (antes de entrar a la sala)

### 0.1 Partida de 5 minutos: NO hay parámetro de URL; sí hay que tocar la VM
La duración la fija el árbitro, no el cliente. Opciones reales (`spike/src/serve.ts`, `spike/deploy/azure/arbitro.env.example`):

| Mecanismo | Efecto | ¿Usar en la demo? |
|---|---|---|
| `LIMITE_MIN=5` (o `--limite-min 5`) | Partida de 5 min en las salas que abre el árbitro (de 1 a 30; por defecto 12) | **Sí** |
| `DEMO=1` / `--demo` | NO es "partida corta": limita las mecánicas (solo Cabina y Turbina con cables, sin multímetro) | **No** |
| `NIVEL=1/2/3/mixto` | Nivel de TODAS las salas 1v1 (por defecto `mixto`: pods 1-3 de nivel 1, 4-5 de nivel 2) | Dejar `mixto` (ver 0.3) |

Procedimiento exacto en producción (lo hace el usuario; este documento no lo ejecuta). Usa el SSH por el 443 de `spike/deploy/PUBLICAR.md` (tu IP debe estar en la regla `SSH-443` del NSG `arbitro-vm-nsg`):

```bash
ssh -p 443 azureuser@<IP_VM>        # (con -i clave.pem si aplica)
sudo nano /etc/circuitsync/arbitro.env   # quita el # de la línea  LIMITE_MIN=5  (si no existe, agrégala)
sudo systemctl restart arbitro
systemctl status arbitro --no-pager | head -5        # active (running)
journalctl -u arbitro --no-pager | grep "código:" | tail -1
journalctl -u arbitro --no-pager | grep "duración" | tail -1   # debe decir "duración: 5 min"
```
- Reiniciar corta partidas en curso: hazlo cuando nadie juegue. No cambia el cliente (el reloj sigue al árbitro) ni requiere despliegue.
- Prueba una sala real: el reloj debe arrancar en 5:00 en ambos dispositivos.
- **Después de la demo** vuelve a comentar `#LIMITE_MIN=5` y `sudo systemctl restart arbitro` (la oficial es 12 min).
- "Jugar solo" (bot) NO usa este límite: corre en el navegador con 12 min (`net.jugarSolo` no pasa `limitMs`); termina antes al despachar los 5 pods. Muéstralo con un pod o dos y sal.
- La práctica ni siquiera tiene sala: tampoco depende de `LIMITE_MIN`.

### 0.2 Desbloquear niveles 2 y EXPERTO sin tocar perfiles reales
El perfil vive en `localStorage` de ese navegador con la clave `circuitsync.perfil.<alias en minúsculas>` (`cliente/src/perfil.ts`). El menú recarga el perfil cada vez que escribes el alias, así que no hace falta recargar la página. No existe un parámetro de URL para esto. En la consola del navegador (F12) de la página del juego, pegar en CADA navegador (el almacenamiento es por dispositivo y por navegador). Un móvil no tiene consola: usa Chrome de escritorio en modo dispositivo móvil, o conecta el móvil por depuración USB (chrome://inspect) para pegar el comando:

```js
["demo1","demo2"].forEach(a => localStorage.setItem("circuitsync.perfil." + a, JSON.stringify({nivelDesbloqueado: 3})));
```
Luego escribe `demo1` (o `demo2`) como alias. Los demás campos se rellenan con ceros. Para saltarse la intro en dispositivos de prueba: `?intro=0`; para forzarla en la demo: `?intro=1`. Después de la demo: `["demo1","demo2"].forEach(a => localStorage.removeItem("circuitsync.perfil." + a))`.

**Limitación:** el nivel de un duelo 1v1 NO depende del perfil sino del árbitro (`NIVEL`). Con `mixto` el duelo ya incluye nivel 2 (fusible, placa, pieza muerta en pods 4-5). El EXPERTO se muestra en Jugar solo (bot, botón EXPERTO, requiere `nivelDesbloqueado: 3`) y en Aprender > Mecánicas (Colores, Fusibles, Placa exp.). Un duelo EXPERTO real exigiría `NIVEL=3` en la VM (otro reinicio): no recomendado.

### 0.3 Datos de la demo
Mismo código de sala en ambos dispositivos o "Partida rápida" (entra a la sala "esperando" más llena). Pedir a los asistentes que no abran el juego en más de 8 dispositivos (Photon gratis: 20 conexiones; cada sala usa 3).

## 1. Línea de tiempo

| Min | Qué se dice | Qué se muestra |
|---|---|---|
| 0:00 a 1:30 | Problema: los cursos de electrónica básica (resistencias, Ohm, multímetro) son abstractos y la práctica con hardware cuesta y tiene riesgo. Solución: un serious game 1v1 de taller de pods, sin cuentas, en el navegador. | Diapositiva de título y problema. |
| 1:30 a 2:30 | Arquitectura: **cliente estático** (Phaser en Azure Static Web Apps, HTTPS) + **árbitro autoritativo** (Node en una VM; decide ganador, esperas y castigos; la solución nunca viaja al cliente) + **Photon** (transporte WSS). | UNA diapositiva con 3 cajas y flechas. Mencionar que Aprender, Practicar y Jugar solo corren 100 % en el navegador. |
| 2:30 a 3:30 | Intro (8 s) y Chispa, la guía. Sin registro: alias de 1 a 12 caracteres. | Abrir el sitio con `?intro=1`; escribir `demo1`. Mostrar Chispa y el HUD de música. |
| 3:30 a 5:00 | Aprender > Mecánicas > Resistencia/Multímetro: la resistencia limita la corriente del LED (ley de Ohm); el multímetro mide sin gastar intentos pero **medir toma tiempo** (coste que crece 1, 1,25, 1,5). | Puntas animadas, soltar la pieza en el hueco rojo, medir (luz verde/ámbar/rojo), CHECK. |
| 5:00 a 6:00 | Jugar solo contra el bot: mismo juego que el duelo (mismos pods y fallas). Elegir nivel y dificultad. | Pantalla JUGAR DUELO > "Jugar solo": NIVEL 2/MIXTO + dificultad NORMAL. Jugar un pod; mostrar la racha. |
| 6:00 a 9:00 | **Duelo 1v1** con los dos dispositivos: crear/entrar con código de sala o PARTIDA RAPIDA. Mostrar: racha de pods limpios y bono de enfriamiento reducido; tras 3 pods limpios seguidos, **sabotaje** al rival (humo: tocar 3 veces; enfriamiento largo; sin pista), máx. 3 por partida; **pieza muerta**: continuidad para hallar la pieza abierta de la cadena y cambiarla. El reloj de 5:00 lo lleva el árbitro. | Dos pantallas lado a lado (o un proyector con un dispositivo y el otro en la mano). Narrar cada hecho al verlo. |
| 9:00 a 10:00 | Nivel EXPERTO: colores de la resistencia, fusible por tamaño/marcado, placa experta (usar solo las piezas necesarias). | Si ya terminó el duelo: Jugar solo > EXPERTO (con `demo1` desbloqueado) o Aprender > Mecánicas > Colores. |
| 10:00 a 11:00 | Fin de partida y **podio**; "Volver a jugar" con el mismo código. | Pantalla del podio. |
| 11:00 a 12:00 | Qué aprende y cómo se mide (sección 2); qué falta (panel docente). Preguntas. | Diapositiva de cierre. |

## 2. Frases clave

**Qué aprende el estudiante** (sílabo ISWZ2401 Computación Ubicua, semana 7 «Electrónica Básica»; temas de apoyo en `cliente/REFERENCIAS-ELECTRONICA.md`):
- "Elegir la resistencia limitadora de un LED es aplicar la ley de Ohm: ni quema el LED ni lo deja apagado."
- "Serie y paralelo se aprenden armando: dos luces en paralelo, una falla y la otra sigue; el interruptor va en serie con la carga."
- "Usar el multímetro (tensión y continuidad) para diagnosticar antes de cambiar piezas: hallar la pieza muerta de una cadena."
- "El fusible justo aguanta lo normal y corta la falla; en EXPERTO se elige por tamaño y marcado (F rápido, T lento)."
- Nota honesta: el sílabo no nombra resistencias ni Ohm (lo dice la referencia A); el juego cubre el tema de apoyo (código de colores, serie/paralelo, protoboard, multímetro).

**Cómo se mide:** el árbitro registra por partida intentos, fallos, quemadas, pods despachados, tiempos y racha (CSV por partida y panel docente en `spike/src/docente/`); cada fallo cuenta por zona (campo `dominio` de habilidades). **El panel de analítica docente está pendiente** (no hay servidor HTTP aún); hoy los datos se guardan y se purgan a los 12 meses.

## 3. Respuestas cortas a preguntas probables

| Pregunta | Respuesta |
|---|---|
| ¿Seguridad? | HTTPS con HSTS de un año, CSP en modo enforce, X-Frame-Options, Permissions-Policy, COOP. Observatory A+ (120/100), securityheaders A+, SSL Labs A (ver `spike/seguridad/ESCANEOS.md`). VM endurecida (systemd 8,7 a 1,3, ufw solo 443, fail2ban, SSH solo con clave). No hubo pentest manual ni de terceros. |
| ¿Trampas? | Árbitro autoritativo: el servidor calcula esperas, bloqueos, despacho y ganador; solución y semilla nunca viajan al cliente; un cliente modificado no puede declarar victoria. Solo puede adivinar pagando cada error. |
| ¿Datos personales? | Alias, ID de alumno opcional y resultados. Base legal: consentimiento (LOPDP, Ecuador); aviso de 4 páginas en el juego; terceros: Photon y Azure (EE. UU.). Retención de 12 meses, purga automática activa desde el 30-oct. Falta autorización institucional si hay menores. |
| ¿Escalabilidad? | Photon gratis: 20 CCU. Cada sala usa 3, `MAX_SALAS=6` (18 CCU). Para un grupo grande hay que escalonar o pagar un plan. |
| ¿Costos? | VM B1s unos USD 8 a 10 al mes (estimado, por verificar), Static Web Apps Free, Photon gratis. Azure for Students cubre la demo. |
| ¿Latencia? | Árbitro en US East: p95 de ~199 a ~100 ms; el requisito formal RNF-02 es 150/250 ms. |
| ¿Si se cae el servidor? | systemd lo reinicia en 5 s; el asiento se reserva 30 s. Sin alta disponibilidad ni copias automáticas. |
| ¿Qué falta? | Panel docente con analítica, autenticación del panel, monitoreo (UptimeRobot, tarea del usuario), copias de seguridad, autorización institucional, validación con estudiantes (`TEST-USUARIOS.md`). |

## 4. Discrepancias encontradas al preparar el guion

- `cliente/INFORME-MODOS.md` (30-oct) dice que el sabotaje no existe y que "Jugar solo siempre es nivel 1"; el código actual SÍ tiene sabotajes (`spike/src/arbiter/arbiter.ts`) y Jugar solo permite nivel 1/2/MIXTO/EXPERTO (`inicio.ts`). El informe está desactualizado.
- `cliente/ENSAYO-DEMO.md` usa `--demo --limite-min 5`; `--demo` oculta el multímetro y limita mecánicas. Para esta demo usar solo `LIMITE_MIN=5`.
- No existe un parámetro `?demo=1` ni `?nivel=` en el cliente; solo `?intro`, `?sala`, `?relay`, `?alumno`, `?puertas`.
