# CircuitSync: auditoría de seguridad (30-oct-2026)

Alcance: sitio público `https://juego.circuitsyncjuego.com` (Azure Static Web Apps, Free), cliente `cliente/`, árbitro `spike/` y la VM `arbitro-vm` (Azure, Ubuntu 24.04). Auditoría de solo lectura: no se cambió nada en el proyecto, la VM ni Azure. Se midieron las cabeceras reales con `curl`, se leyó el código, se corrió `npm audit`, se buscaron secretos en git y se inspeccionó la VM por SSH (puerto 443) y el NSG con `az` (solo lectura). No se incluyen valores de secretos en este informe.

Veredicto corto para el comité: **no hay hallazgos Críticos ni Altos**. El juego no tiene cuentas, contraseñas ni base de datos expuesta; el servidor no es alcanzable desde internet salvo por SSH desde una sola IP; el cliente no usa `innerHTML`; el árbitro decide todo y nunca envía la solución. Lo que falta son cabeceras de endurecimiento del sitio (CSP y similares), un aviso de privacidad y algunos ajustes de la VM.

## 1. Tabla de hallazgos (ordenada por severidad)

| ID | Sev. | Qué es | Riesgo real aquí | Arreglo propuesto | Esfuerzo | Acción de |
|---|---|---|---|---|---|---|
| S-01 | Media | El sitio no envía `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors` ni `Permissions-Policy` (sí envía HSTS, nosniff y Referrer-Policy). | Hoy no hay XSS conocido (ver "Lo que ya está bien"), así que la CSP es defensa en profundidad. Sin `frame-ancestors`, otra página puede incrustar el juego en un iframe (clickjacking, bajo impacto: el juego no tiene acciones sensibles). | Poner `globalHeaders` en `staticwebapp.config.json` (sección 2) y probar primero con `Content-Security-Policy-Report-Only`. | S | Código + redespliegue del cliente |
| S-02 | Media | No hay aviso de privacidad ni consentimiento. El alias del jugador viaja por Photon (EE. UU.) y el árbitro guarda alias, sala y hora en JSON/CSV. | Los alias son apodos de 1 a 12 caracteres, pero un alumno puede escribir su nombre real. Con la planificada vinculación `?alumno=` aparecerían nombres reales. Un comité o el comité de ética lo preguntará. | Mostrar una nota breve antes del primer juego (texto en sección 5) y enlazarla en el pie. Definir retención (borrar partidas a los 12 meses). | S | Código + texto del autor |
| S-03 | Media | El cliente acepta mensajes "del árbitro" de cualquier participante de la sala. `Net.onMessage` ignora el campo `from` que Photon sí entrega (`spike/src/transport/photon.ts`, `cliente/src/net.ts` línea 66). | Un rival tramposo (con la consola del navegador) puede enviar a su oponente mensajes falsos (`end`, `rival`, `reject`). Solo engaña a la pantalla del oponente: el ganador real y lo guardado para el docente los decide el árbitro. Requiere conocimiento técnico. | En el cliente, aceptar solo eventos cuyo `actorNr` sea el del anfitrión (`lbc.myRoomMasterActorNr()`); en `photon.ts` descartar el resto cuando la instancia no es anfitriona. | S | Solo código (cliente y VM) |
| S-04 | Media | El App ID de Photon es público (va en el JS). Cualquiera puede conectarse a ese App ID, listar salas, ocuparlas o consumir los 20 CCU del plan gratuito. | Negación de servicio por capacidad: 20 conexiones simultáneas bastan para que no se abran salas nuevas. Es el límite de la arquitectura con Photon, no un fallo de código. Un tercero que ocupe un asiento no puede ver soluciones ni cambiar resultados. | Mitigaciones: monitorear CCU en el panel de Photon; si ocurre, rotar el App ID (reconstruir cliente y cambiar `arbitro.env`); a futuro, Custom Authentication de Photon (servidor propio que emita tokens). Documentarlo como riesgo aceptado para el piloto. | M (auth) / S (monitoreo) | Portal de Photon; código si se hace auth |
| S-05 | Media | Servicio `arbitro` con endurecimiento mínimo: `systemd-analyze security` da 8,7 EXPOSED. Solo tiene `NoNewPrivileges` y `ProtectSystem=full`. Además el usuario `arbitro` es dueño del código (`chown -R arbitro /opt/circuitsync`). | Si hubiera una ejecución de código en Node, el atacante podría modificar el propio código del servicio y persistir. Hoy no hay vía de entrada (ningún puerto de aplicación escucha). | Añadir a `arbitro.service` (en `[Service]`): `PrivateTmp=true`, `ProtectHome=true`, `ProtectKernelTunables=true`, `ProtectKernelModules=true`, `ProtectControlGroups=true`, `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`, `RestrictNamespaces=true`, `LockPersonality=true`, `CapabilityBoundingSet=`, `UMask=0077`, `SystemCallFilter=@system-service`. **No** poner `MemoryDenyWriteExecute` (Node lo necesita). Opcional: código de dueño `root`, y escribir CSV/datos solo en `/var/lib/circuitsync`. | M (probar que arranca) | VM (`systemctl daemon-reload && restart`) |
| S-06 | Baja | Cortafuegos del SO inactivo (`ufw inactive`, iptables en ACCEPT) y `fail2ban` no instalado. | Mitigado por el NSG de Azure, que solo permite TCP 22 y 443 desde una IP. Por eso es Baja. Sin ufw no hay segunda barrera si el NSG se cambia por error. | `sudo ufw default deny incoming && sudo ufw allow 443/tcp && sudo ufw enable` (permitir 443 **antes** de habilitar, o se pierde el SSH). fail2ban es opcional porque la contraseña está desactivada. | S | VM |
| S-07 | Baja (RESUELTO 30-oct-2026) | `sshd` con `PermitRootLogin without-password` (solo clave) y `X11Forwarding yes`. | Solo se entra con clave y desde una IP; el riesgo es mínimo, pero conviene el valor estricto. | Crear `/etc/ssh/sshd_config.d/99-endurecer.conf` con `PermitRootLogin no`, `X11Forwarding no`, `MaxAuthTries 3`; `sudo systemctl reload ssh`. | S | VM |
| S-08 | Baja | El NSG tiene dos reglas SSH (22 y 443) pero `sshd` solo escucha en 443 (verificado con `ss -tlnp`). La regla del 22 sobra. | Superficie innecesaria si algún día algo escucha en 22. | `az network nsg rule delete -g circuitsync-rg --nsg-name arbitro-vm-nsg -n SSH`. | S | Azure |
| S-09 | Baja | `npm audit` en `spike/`: 6 vulnerabilidades (2 críticas, 1 alta, 3 moderadas), **todas en la cadena de `vitest@2` (solo desarrollo)**: `vitest` (crítica), `tinypool` (crítica), `vite` (alta), `vite-node`, `@vitest/mocker`, `esbuild` (moderadas). `npm audit --omit=dev` da **0**. | No explotables en producción: `photon-realtime` y `ws` (las únicas dependencias de ejecución) están limpias, y esas herramientas solo corren al ejecutar pruebas, y exigen el servidor de UI o de desarrollo de Vitest, que no se usa en la VM. Aun así quedan instaladas en la VM porque `tsx` (necesario) es devDependency. | Subir `vitest` a `^5` en `spike/package.json` (el cliente ya usa 5.0.5 y da 0 vulnerabilidades). Mover `tsx` a `dependencies` y desplegar con `npm ci --omit=dev`. Verificar que `npm test` sigue pasando. | S-M | Solo código |
| S-10 | Baja | Sin límite de tasa ni de tamaño de mensaje en el árbitro (`Arbiter.handle` no cuenta mensajes por segundo; `JSON.parse` sin tope). | Cada mensaje cuesta microsegundos y las salas tienen máximo 3 participantes (el árbitro y 2 jugadores); los eventos grandes los limita Photon. Un participante hostil podría gastar algo de CPU de la VM B1s, no tumbarla. Los errores de `JSON.parse` están capturados (`try/catch` en `photon.ts`), así que un mensaje mal formado no tumba el proceso. | En `PhotonTransport` ignorar eventos de más de 2 KB y a un mismo `actorNr` más de 30 mensajes/s (contador por ventana de 1 s). | S | Solo código |
| S-11 | Baja (RESUELTO 30-oct-2026: retención de 12 meses activa en producción, `src/docente/retencion.ts`; S-11b RESUELTO 30-oct-2026: el log del árbitro ya no imprime alias ni semilla, y el journal se limita a 30 días; las entradas viejas con alias caducan el 29-nov-2026) | Los datos del panel docente (`partidas/*.json`, CSV, `vivo/`, `bench-out/`) nunca se borran, y `serve.ts` imprime el resultado completo, con alias, en el `journal` (`resultado: {...}`), junto con la semilla de cada sala. | Retención indefinida de apodos; la semilla en el log permitiría reconstruir los pods de esa partida a quien lea el journal (solo el administrador de la VM, que ya podría leer la memoria). Hoy el disco está vacío (aún no hay partidas). | Política de retención (tarea `cron` o `systemd-tmpfiles` que borre archivos de más de 365 días); quitar alias y semilla del `console.log` o dejar solo el código de sala. | S | Código + VM |
| S-12 | Baja | `dist/_headers` (formato Netlify) lo ignora Static Web Apps, y `staticwebapp.config.json` se recrea a mano en cada despliegue (`handoff.md`). | Riesgo operativo: si se olvida recrearlo, desaparecen la caché larga y las cabeceras nuevas. | Guardar `staticwebapp.config.json` en `cliente/public/` para que Vite lo copie a `dist/` solo, y borrar `_headers`. | S | Solo código |
| S-13 | Info | Parches: 8 paquetes actualizables, 0 de seguridad; no hay reinicio pendiente; `unattended-upgrades` activo; Node v22.23.4. Node viene de NodeSource, que `unattended-upgrades` no actualiza por defecto. | Bajo. Mantener rutina mensual. | `sudo apt update && sudo apt upgrade` cada mes, con el árbitro entre partidas. | S | VM |
| S-14 | Info | `azureuser` pertenece al grupo `lxd` (equivale a root) y tiene `sudo`. | Es la configuración por defecto de Azure; solo se entra con clave. | Opcional: `sudo gpasswd -d azureuser lxd`. | S | VM |
| S-15 | Info | Parámetros de URL: `?sala` se limpia a A-Z0-9 de 6 caracteres, `?alumno` se valida con `^[A-Za-z0-9_-]{1,40}$`, `?intro` y `?puertas` solo se comparan con valores fijos; `?relay` solo afecta el modo local (en producción siempre se usa Photon). | Ninguno encontrado. El enlace de compartir (`urlDeSala`) nunca incluye alias. | Ninguno. | - | - |

## 2. Cabeceras del sitio: lo que hay y la configuración propuesta

Medido con `curl -sI` en la página y en `/assets/index-*.js`:

| Cabecera | Estado |
|---|---|
| `Strict-Transport-Security: max-age=10886400; includeSubDomains; preload` | Presente |
| `X-Content-Type-Options: nosniff` | Presente |
| `Referrer-Policy: same-origin` | Presente |
| `X-XSS-Protection`, `X-DNS-Prefetch-Control` | Presentes (obsoletas, inocuas) |
| `Cache-Control` | Página: `public, must-revalidate, max-age=30`. Assets: `public, max-age=31536000, immutable` (correcto, son archivos con hash en el nombre) |
| `Content-Security-Policy` | **Falta** |
| `X-Frame-Options` / `frame-ancestors` | **Falta** |
| `Permissions-Policy` | **Falta** |
| HTTP a HTTPS | Redirección 301 correcta (`http://juego...` va a `https://`) |

El archivo actual (`cliente/dist/staticwebapp.config.json`) solo define la caché de `/assets/*` y el respaldo a `index.html`.

**Hosts reales a los que conecta el cliente** (medido abriendo una sesión de Photon con el mismo código de transporte): el Name Server `ns.photonengine.io` y un servidor Master del tipo `gcashNNNN.exitgames.com` (el Game Server también cae bajo `*.exitgames.com`). Todo por `wss` en el puerto 443. En el JS compilado solo aparecen `ns.photonengine.io`, `phaser.io` (una cadena de texto, no una petición) y el espacio de nombres `w3.org` (no es una conexión). No hay `eval`, `new Function`, Workers, fuentes web ni CDN: todo el código y los sonidos salen del mismo origen.

Configuración propuesta (reemplaza el archivo; conserva lo que ya tenía):

```json
{
  "routes": [
    { "route": "/assets/*", "headers": { "Cache-Control": "public, max-age=31536000, immutable" } }
  ],
  "navigationFallback": { "rewrite": "/index.html", "exclude": ["/assets/*", "/arte/*"] },
  "globalHeaders": {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self'; connect-src 'self' wss://ns.photonengine.io wss://*.photonengine.io wss://*.exitgames.com; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin"
  }
}
```

Notas: (a) `style-src 'unsafe-inline'` es por el `<style>` de `index.html`; se puede quitar moviéndolo a un archivo CSS. (b) Esta CSP **no se probó en un navegador**: desplegar primero con la clave `Content-Security-Policy-Report-Only`, jugar una partida completa (sonido, música, Photon) y revisar la consola; si no hay avisos, cambiar al nombre definitivo. (c) Si se activa el panel docente con `VITE_DOCENTE_URL`, hay que añadir su host a `connect-src`. (d) `Permissions-Policy` con `microphone=()` no afecta al juego porque el audio es solo de salida.

## 3. Resultados por área

**Cliente.** Sin `innerHTML`, `outerHTML`, `insertAdjacent*`, `document.write`, `eval` ni `new Function` en `cliente/src`: los textos (incluido el alias del rival) se pintan con objetos de texto de Phaser, no con HTML. `localStorage` guarda: último alias, perfil por alias (progreso e insignias), dificultad, volumen/silencio y si ya vio la introducción; todo con `try/catch`, sin datos sensibles ni tokens. `npm audit` en `cliente/`: 0 vulnerabilidades (con y sin dependencias de desarrollo; dependencia de ejecución: `phaser`).

**Secretos en `dist/`.** El único identificador con forma de GUID es el App ID de Photon, público por diseño. No hay claves privadas, `.pem`, hashes de contraseña, tokens, IPs internas ni `localhost`. `VITE_DOCENTE_URL` no está incrustado (la búsqueda de alumnos está inactiva en producción).

**Árbitro.** Mensajes entrantes: `Arbiter.handle` trata todo como no confiable (`raw as Record|null`, comprueba tipo de `t`, `seq`, `t0`); el alias se valida con `validAlias` (1 a 12 caracteres); `zone` y `pieza` se comprueban contra las opciones del pod; el multímetro valida `modo` y `punto`. Un mensaje inválido recibe un `reject` y no lanza excepción; además `photon.ts` envuelve `JSON.parse` + manejador en `try/catch`. Salas: `MAX_SALAS=6` (18 de los 20 CCU), 2 asientos más el árbitro por sala (`maxPlayers: 3`), la sala se cierra a nuevos ingresos al empezar. Código de sala: 6 caracteres de un alfabeto de 31 (`randomInt` criptográfico), unos 887 millones de combinaciones; la lista de salas del lobby es pública a propósito (muestra código, nivel, jugadores y estado, nunca alias ni solución), así que el código no es un secreto sino un identificador. Autoridad: el ganador, los cooldowns (2/4/8 s), el bloqueo de 4 s por quemar, el despacho (exige todas las zonas reparadas) y el fin por tiempo los decide solo el árbitro; la solución y la semilla nunca viajan al cliente (`podView` arma el pod campo por campo sin `solucion`). Un cliente modificado no puede saltarse los cooldowns ni declarar victoria; lo máximo que puede hacer es adivinar entre 3 o 4 opciones pagando el castigo de cada intento. Panel docente: **en este repositorio no existe un servidor HTTP** (no hay `createServer`, `listen`, CORS ni login); el árbitro solo escribe JSON en disco con `escribirAtomico`. Las rutas se arman con el id de partida (generado por el árbitro) y `leerPartida` valida `^[\w-]+$`; `buscarAlumno` valida `^[A-Za-z0-9_-]{1,40}$`, por lo que no hay recorrido de rutas con `../`. La parte HTTP del panel (`/alumno/:id`, CORS, login con `DOCENTE_USER`/`DOCENTE_PASS_HASH`) está pendiente de auditar cuando se construya: usar ids aleatorios de 128 bits, HTTPS, CORS limitado a `https://juego.circuitsyncjuego.com` y contraseña con hash (argon2/scrypt).

**VM** (conexión SSH por 443 desde la IP autorizada: funcionó).

| Control | Resultado |
|---|---|
| Puertos que escuchan | Solo 443/tcp (sshd) en todas las interfaces; 53 y 323 solo en local. El árbitro **no escucha en ningún puerto** (solo conexiones salientes WSS). No hay panel docente expuesto. |
| Usuario del servicio | `arbitro`, sin shell (`nologin`), no root |
| systemd | `NoNewPrivileges=yes`, `ProtectSystem=full`, `Restart=always` (ver S-05) |
| `/etc/circuitsync/arbitro.env` | `640 root:arbitro` (correcto) |
| NSG | Dos reglas de entrada, TCP 22 y 443, ambas solo desde una IP (/32). Todo lo demás cae en el "denegar" por defecto de Azure |
| Contraseñas SSH | `PasswordAuthentication no`, `KbdInteractive no`, `PermitEmptyPasswords no` |
| Intentos fallidos de SSH (24 h) | 0 |
| Actualizaciones | Ver S-13 |
| ufw / fail2ban | Inactivos (ver S-06) |

**Secretos en git.** Revisados los commits del historial: no hay `.env`, `.pem`, claves privadas, tokens (`ghp_`, `AKIA`) ni hashes reales; los únicos archivos con nombre sensible son plantillas `*.env.example` con marcadores (`<PEGA_AQUI>`) y valores vacíos. El App ID real aparece en 0 commits (solo está en `cliente/.env.local` y `.env*` están en `.gitignore`). `data/` y `bench-out/` también están ignorados. El workflow de CI usa `secrets.PHOTON_APP_ID` de GitHub Secrets y solo imprime su longitud. El repositorio remoto es `github.com/Serious-Game-1VS1/Circuit-Game`. Recomendación: confirmar en GitHub que el repo es privado, o que, si es público, no se subió ninguna captura con datos reales (el historial incluye `diseno-taller/capturas/`).

## 4. Lo que ya está bien (para mostrar al comité)

- Sitio solo por HTTPS con HSTS (con `includeSubDomains` y `preload`), certificado administrado y renovado por Azure, redirección automática de HTTP.
- Sin cuentas, contraseñas ni datos de pago: el jugador solo escribe un apodo de hasta 12 caracteres.
- El árbitro es la autoridad: la solución y la semilla nunca salen del servidor; cooldowns, quemadas, despachos y ganador se calculan allí.
- Todas las entradas de red se validan en el servidor; los mensajes mal formados se descartan sin tumbar el proceso.
- Sin `innerHTML` ni `eval` en el cliente; los parámetros de URL se saneán o se comparan con valores fijos.
- Dependencias de ejecución sin vulnerabilidades (`npm audit --omit=dev` = 0 en cliente y árbitro). Las 6 alertas del árbitro son solo de herramientas de pruebas.
- El servidor no abre ningún puerto de aplicación; el único puerto abierto es SSH, restringido a una IP, solo con clave (sin contraseña), usuario del servicio sin privilegios y archivo de configuración con permisos 640.
- El tráfico del juego usa solo WSS por el puerto 443, y el código lo impone (`Only443`).
- Sin secretos en git ni en el JS publicado (el App ID de Photon es público por diseño de la plataforma).
- Parches automáticos de seguridad activos y sistema al día (0 actualizaciones de seguridad pendientes).
- Caché correcta: assets inmutables con hash, página con revalidación a 30 s.

## 5. Nota de privacidad breve (texto sugerido)

> **Privacidad.** CircuitSync no pide cuenta, correo ni contraseña. Solo escribes un apodo (máximo 12 caracteres; no uses tu nombre real). Tu progreso, insignias, volumen y apodo se guardan en tu propio navegador y se borran al limpiar los datos del sitio. Durante una partida, tu apodo y tus jugadas se envían al servicio de partidas en línea Photon (Exit Games) y a un servidor de juego en Microsoft Azure (EE. UU.). El servidor guarda por cada partida el apodo, el código de sala, la fecha y tus resultados (pods despachados, errores) para que el docente analice el aprendizaje; los datos se conservan hasta 12 meses y luego se eliminan. No se usan para publicidad ni se comparten con terceros. Para pedir la eliminación de tus datos, escribe a [correo del responsable].

Datos y ubicación (para el capítulo de la tesis): apodo y resultados de partida, en JSON/CSV en `/var/lib/circuitsync/docente` de la VM (acceso solo por SSH); apodo en tránsito por Photon; direcciones IP vistas por Azure Static Web Apps, Photon y el proveedor del dominio como parte normal de cualquier sitio web; nombre real y `alumnoId` solo si se activa la búsqueda `?alumno=` con el panel docente (en ese caso el aviso debe pedir consentimiento del estudiante o del docente a cargo y hay que anonimizar las exportaciones). Si participan menores de edad, se requiere autorización de la institución.

## 6. Preguntas probables del comité y respuesta corta

1. **¿Es seguro el sitio?** Sí para su alcance: va por HTTPS con HSTS, no maneja cuentas ni datos sensibles, y el servidor decide todo. Las mejoras pendientes son de endurecimiento (cabecera CSP, aviso de privacidad, ajustes menores de la VM) y no tienen riesgo alto.
2. **¿Pueden hacer trampa los estudiantes?** No pueden forzar la victoria ni saltarse los tiempos de espera: el árbitro los calcula. Solo pueden intentar adivinar entre 3 o 4 opciones pagando el castigo de cada error. Un rival muy técnico podría engañar a la pantalla de su oponente (S-03, se corrige con una validación sencilla), pero no cambia el resultado registrado.
3. **¿Pueden ver la respuesta correcta?** No. La solución y la semilla nunca se envían al navegador; solo se envía el veredicto de cada prueba.
4. **¿Qué pasa si alguien intenta atacar el servidor?** El servidor del juego no tiene ningún puerto de aplicación abierto, solo hace conexiones salientes hacia Photon. El único puerto abierto es SSH, restringido a una IP y solo con clave. Lo más que un atacante externo puede hacer es ocupar la capacidad gratuita de Photon (S-04), lo que se detecta en su panel y se resuelve rotando el App ID.
5. **¿Qué datos personales guarda?** Un apodo de 12 caracteres, el código de sala, la hora y los resultados. Sin correo, contraseña ni nombre real, salvo que se active la vinculación con el docente; ahí aplica el aviso con consentimiento (sección 5).
6. **¿El App ID de Photon en el JavaScript es una filtración?** No. Photon lo diseñó público (como una clave de sitio); no da acceso a la cuenta ni a datos. Lo que sí es secreto (clave SSH, `arbitro.env`, token de despliegue) no está en git ni en el sitio.
7. **¿Y las 2 vulnerabilidades críticas de `npm audit`?** Están en `vitest`/`tinypool`, herramientas de pruebas que no forman parte del juego ni se ejecutan en producción; las dependencias de ejecución tienen 0 (S-09). Se corrigen subiendo `vitest` a la versión 5.
8. **¿Cómo se mantiene actualizado?** Parches de seguridad automáticos en la VM, Node 22 LTS, certificado renovado por Azure. Rutina mensual de `apt upgrade` y `npm audit`.
9. **¿Qué pasa si se cae el servidor?** `systemd` lo reinicia en 5 s (`Restart=always`); el cliente reconecta solo y el árbitro reserva el asiento 30 s. No hay datos críticos que perder: las partidas son de minutos.
10. **¿Cumple con protección de datos?** Para un piloto con apodos es de riesgo bajo; para cumplimiento formal faltan la nota de privacidad publicada, el plazo de retención y el contacto para borrar datos (S-02).

## 7. Qué no se verificó

- La CSP propuesta no se probó en un navegador (usar `Report-Only` primero).
- No se auditó un servidor HTTP del panel docente porque no existe en el repo; hay que revisarlo cuando se construya.
- No se probó resistencia a carga ni límites de eventos de Photon (documentación de Exit Games: por verificar).
- No se revisó la configuración de la cuenta de Photon, GitHub (visibilidad del repo, protección de rama) ni Cloudflare.
- Se abrió una conexión breve y de solo lectura a Photon con el App ID (para identificar los hosts); no creó salas.

## Estado de remediación en la VM (30-oct-2026)

| ID | Estado | Detalle |
|---|---|---|
| S-05 | Resuelto | Drop-in `spike/deploy/azure/endurecimiento.conf` aplicado; `systemd-analyze security` pasó de 8,7 EXPOSED a 1,3 OK. El árbitro arrancó y se conectó a Photon sin errores. |
| S-06 | Resuelto | `ufw` activo (deny entrante, allow 443/tcp); `fail2ban` con jail `sshd` en puerto 443 (backend systemd, ban 1 h, `ignoreip` con la IP del usuario). |
| S-08 | Resuelto | Regla NSG `SSH` (22) eliminada; queda `SSH-443` desde una IP. |
| S-07 | Resuelto | `/etc/ssh/sshd_config.d/99-endurecimiento.conf` (`PermitRootLogin no`, `X11Forwarding no`, `PasswordAuthentication no`, `MaxAuthTries 3`); `sshd -t` OK, recarga con `systemctl reload ssh`, sigue en 443 y se verificó con una sesión nueva. Respaldo en `/root/sshd_config.d.bak-s07`. |
| S-11b | Resuelto | `serve.ts` registra solo código de sala, nivel y resultado sin alias; sin semilla. Drop-in `/etc/systemd/journald.conf.d/retencion.conf` (`MaxRetentionSec=30day`) y `journalctl --vacuum-time=30d`. Tres líneas antiguas con la semilla siguen en el journal hasta que caduquen (29-nov-2026). |

