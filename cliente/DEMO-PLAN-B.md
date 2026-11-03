# Plan B de la demo del 14-nov-2026

## Qué funciona sin el árbitro de la VM ni Photon
Verificado en el código (`cliente/src/net.ts`): una vez cargada la página, estos modos corren 100 % en el navegador, sin red:

| Modo | Transporte | Sin VM / sin Photon |
|---|---|---|
| Aprender > Mecánicas (tutoriales) | `PracticaTransport` (en el navegador) | Funciona |
| Practicar | `PracticaTransport` | Funciona |
| Jugar solo (contra el bot) | `ContraBotTransport` | Funciona |
| Duelo 1v1, lista de salas, Partida rápida, código de sala | Photon + árbitro de la VM | NO funciona |

Por tanto, si falla la VM o Photon, se sigue la demo con Aprender y Jugar solo y se explica el duelo con capturas (`cliente/capturas-1v1-prod/`). Si el internet cae después de cargar la página, esos tres modos continúan; los datos del perfil siguen en `localStorage`.

## Si falla X

| Falla | Qué hacer |
|---|---|
| Internet del lugar | Hotspot del móvil (WiFi o USB). Probar `https://juego.circuitsyncjuego.com/version.json`. Los dispositivos deben tener salida por el 443 (WSS de Photon). Si la red bloquea WSS: datos móviles. |
| Photon caído o límite de CCU (mensaje «No se pudo conectar con el servidor de juego» o «Sin conexión a salas») | Pasar a Jugar solo y Aprender. Revisar el panel de Photon (CCU). Pedir que otros asistentes cierren el juego. Bajar `MAX_SALAS` solo si hace falta. |
| Árbitro de la VM caído («No hay una sala abierta con ese código») | SSH: `ssh -p 443 azureuser@<IP_VM>`; `systemctl status arbitro`; `sudo systemctl restart arbitro`; esperar ~10 s; `journalctl -u arbitro --no-pager | grep "código:" | tail -1` y usar el código NUEVO (los dos dispositivos pulsan Volver y entran de nuevo). Si la VM está desasignada: `az vm start -g circuitsync-rg -n arbitro-vm` (el servicio arranca solo). |
| No entra el SSH | Tu IP cambió: `az network nsg rule update -g circuitsync-rg --nsg-name arbitro-vm-nsg -n SSH-443 --source-address-prefixes <TU_IP>/32` (regla `SSH-443`; ojo: PUBLICAR.md usa el nombre `ssh-mi-ip` en su tabla antigua, confirma con `az network nsg rule list`). |
| Certificado o dominio | Usar el hostname de respaldo `https://purple-bush-048e9630f.2.azurestaticapps.net` (mismo contenido y cabeceras). Confirmar con `/version.json`. |
| Navegador lento o se cuelga | Recargar con Ctrl+F5; cerrar otras pestañas; ventana nueva; probar otro navegador (Chrome/Edge). Los PNG de `arte/` son ~246 peticiones: la primera carga es lenta, la segunda es de caché. |
| Sala de la demo sin respuesta a mitad de partida | El cliente reconecta solo cada 2 s y el árbitro reserva el asiento 30 s; esperar. Si no, `sudo systemctl restart arbitro` y nueva sala. |
| Sin sonido | Tocar la pantalla (los móviles exigen un gesto para el audio); revisar mute y silencio. |

## Relé local de respaldo (demo sin internet)
Probado antes en `cliente/ENSAYO-DEMO.md` (Opción A). Necesita un PC y los dispositivos en la misma WiFi/hotspot (sin «aislamiento de clientes»). Sin Photon, sin la VM, sin HTTPS.

1. IP del PC: `ipconfig` (IPv4 de la WiFi), p. ej. `192.168.1.20`.
2. Terminal 1, en `spike/`: `npm run serve:demo5` (relé local en el puerto 8787 + árbitro, partida de 5 min). Imprime el código de sala (6 caracteres). No uses `--demo` (limita las mecánicas).
3. Terminal 2, en `cliente/` (PowerShell): `$env:VITE_TRANSPORT="local"; npm run dev -- --host` (o `npm run build; npm run preview -- --host` para algo más parecido al sitio, puerto 4173).
4. Firewall de Windows: permitir Node en red Privada, o las reglas de los puertos 5173 y 8787 (comandos en `ENSAYO-DEMO.md`).
5. Los dispositivos abren `http://<IP del PC>:5173` (el cliente usa `ws://<IP>:8787` solo). Si cambias el puerto: `?relay=ws://<IP>:8797`. El relé admite una sala por proceso; «Volver a jugar» reabre con el mismo código.
6. Perfiles de demo: el `localStorage` es de OTRO origen (la IP), así que hay que volver a pegar el comando de `DEMO-GUION.md` 0.2 en esa página.

**Qué se pierde:** HTTPS (el relé usa `ws://`, solo funciona desde páginas `http://`), Photon real y su latencia, la lista de salas pública, el dominio, la VM endurecida y el registro docente (el panel y la purga corren con el árbitro de la VM; el relé local escribe en `spike/data/docente`). Los dispositivos deben estar en la misma red. Haz el ensayo completo antes (T-7).

## Tabla de riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Internet del lugar caído o con WSS bloqueado | Media | Alto (sin duelo) | Hotspot, datos móviles, ensayo en el lugar; plan: Jugar solo + capturas |
| Límite de 20 CCU de Photon (otros dispositivos conectados) | Baja | Alto | Pedir ≤ 8 dispositivos, `MAX_SALAS=6`, revisar el panel de Photon |
| Árbitro de la VM caído | Baja | Alto | UptimeRobot, SSH abierto, `systemctl restart arbitro`, `az vm start` |
| IP de la sala fuera del NSG (no entra el SSH) | Media | Medio | Comprobar en T-1 día y T-1 hora; `az network nsg rule update` |
| Cambio de IP de la VM al reiniciar | Baja | Bajo (solo SSH) | Consultar con `az vm show -d` |
| Certificado/dominio con problema | Muy baja | Alto | Hostname `purple-bush-048e9630f.2.azurestaticapps.net` |
| Carga en frío lenta en móvil | Media | Medio | Precargar el sitio en los dispositivos; WiFi estable |
| Nivel 2/EXPERTO bloqueado en el dispositivo | Media | Bajo | Pegar el comando de perfiles de demo (T-1 día); candado de Mecánicas solo informa |
| Despliegue accidental o cambio tardío | Baja | Alto | Congelar desde T-2 días; restaurar con PUBLICAR.md |
| `LIMITE_MIN=5` olvidado (partida de 12 min) | Media | Medio | Checklist T-1 día; verificar «duración: 5 min» y reloj 5:00 |
| `DEMO=1` activo por error (sin multímetro) | Baja | Medio | Revisar `arbitro.env` sin `DEMO` |
| Pregunta sin respuesta (seguridad, datos) | Media | Medio | Tabla en `DEMO-GUION.md` y `POSTURA-SEGURIDAD.md` |
| Sonido silenciado o sin gesto en el móvil | Media | Bajo | Probar mute/volumen antes |
