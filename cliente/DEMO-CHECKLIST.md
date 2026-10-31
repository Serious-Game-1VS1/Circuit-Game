# Checklist de la demo del 14-nov-2026

Comandos de SSH, NSG, respaldos y restauración: `spike/deploy/PUBLICAR.md` (secciones 2, 5 y Despliegue v5). Guion: `cliente/DEMO-GUION.md`. Plan B: `cliente/DEMO-PLAN-B.md`.

## T-7 días (7-nov)
- [ ] Abrir `https://juego.circuitsyncjuego.com/version.json` y confirmar `"commit":"a8e9ec0"` y `"protocolo":2` (o el commit congelado acordado).
- [ ] UptimeRobot configurado sobre el sitio (tarea del usuario) con aviso a tu correo.
- [ ] Auto-renovación del dominio activa en Cloudflare Registrar; fecha de vencimiento posterior a la demo.
- [ ] Dominio `juego.circuitsyncjuego.com` marcado como predeterminado en Azure (Static Web App > Custom domains) y estado Ready; certificado vigente (hasta 2027-04-30 según SSL Labs).
- [ ] Crédito de Azure for Students suficiente para la VM hasta la defensa.
- [ ] Probar en un móvil real con datos móviles: carga en frío (sin caché, ventana privada) y cronometrar hasta ver el menú; anotar el tiempo.
- [ ] Navegadores probados: Chrome, Edge, Opera GX, Safari iOS (menú, tutorial, duelo, sonido).
- [ ] Orientación vertical y horizontal revisadas en los dispositivos que se usarán.
- [ ] Repetir escaneos de seguridad (Observatory, securityheaders, SSL Labs) y comparar con `spike/seguridad/ESCANEOS.md`.

## T-2 días (12-nov): CONGELAR
- [ ] No desplegar nada (cliente ni árbitro) salvo emergencia. Anotar aquí el commit congelado: ________.
- [ ] Imprimir o guardar sin conexión: guion, plan B y el código de la IP/SSH.

## T-1 día (13-nov)
- [ ] `version.json` otra vez con el commit esperado.
- [ ] SSH a la VM por el 443 (`ssh -p 443 azureuser@<IP_VM>`; la IP puede cambiar al reiniciar la VM: `az vm show -d -g circuitsync-rg -n arbitro-vm --query publicIps -o tsv`). Si no entra: comprobar que la regla `SSH-443` del NSG `arbitro-vm-nsg` permite la IP pública de la sala (`az network nsg rule update ... --source-address-prefixes <TU_IP>/32`) y el `ignoreip` de fail2ban.
- [ ] `systemctl status arbitro` = active (running); `journalctl -u arbitro --no-pager | tail` sin errores; hay una línea «Photon (us) · sala nueva, código: XXXXXX».
- [ ] Poner el modo de 5 min: descomentar `LIMITE_MIN=5` en `/etc/circuitsync/arbitro.env` y `sudo systemctl restart arbitro`; confirmar «duración: 5 min» en el log. NO activar `DEMO=1`. Dejar `NIVEL` sin definir (mixto).
- [ ] Crear una sala de prueba y jugar un duelo completo con dos dispositivos: el reloj arranca en 5:00 en ambos, la Sala no muestra el aviso naranja de versión.
- [ ] Photon: sala de 20 CCU libre (panel de Photon, sin otras sesiones abiertas); cada sala usa 3 CCU, `MAX_SALAS=6`.
- [ ] Crear los perfiles de demo en cada dispositivo (comando en `DEMO-GUION.md` 0.2) y probar Jugar solo > EXPERTO con `demo1`.
- [ ] Borrar localStorage de pruebas anteriores (alias, `circuitsync.intro`, `circuitsync.dificultad`, `circuitsync.nivelbot`) si quieres ver la intro de nuevo, o abrir con `?intro=1`.
- [ ] Dispositivos de demo cargados con el sitio (caché caliente) y en la pantalla de menú.
- [ ] Respaldos presentes en la VM: `ls /opt/circuitsync/` muestra `spike.bak-v5`; en tu PC existen `dist-v5` (scratchpad) y el repo en el commit a8e9ec0.

## T-1 hora
- [ ] Internet del lugar probado desde los dos dispositivos (HTTPS al sitio y WSS por el 443); hotspot móvil listo como respaldo con datos disponibles.
- [ ] Modo avión DESCARTADO en ambos dispositivos; WiFi o datos conectados; ahorro de batería apagado.
- [ ] Brillo al máximo; apagar silencio automático; sonido: volumen alto y probar el botón de mute y la música del HUD.
- [ ] Cargadores conectados; notificaciones apagadas (no molestar).
- [ ] Pestañas innecesarias cerradas; una sola pestaña del juego por dispositivo.
- [ ] Pedir a los asistentes que usen ≤ 8 dispositivos si juegan desde el sitio (límite de 20 CCU de Photon).
- [ ] `systemctl status arbitro` activo y último código de sala anotado: ________.

## Justo antes
- [ ] Recargar el sitio en ambos dispositivos (Ctrl+F5) y ver el menú; escribir `demo1` / `demo2` y confirmar "EXPERTO: ABIERTO".
- [ ] Probar el duelo 10 s (entrar a la misma sala, ambos "Listo") y salir para dejar la sala limpia, o dejar una sala nueva libre.
- [ ] Plan B a la mano: hotspot, hostname de respaldo `purple-bush-048e9630f.2.azurestaticapps.net`, SSH abierto en una terminal.
- [ ] Una sesión SSH ya abierta con `journalctl -u arbitro -f` en una pantalla secundaria.

## Después de la demo
- [ ] Volver a comentar `#LIMITE_MIN=5` y `sudo systemctl restart arbitro`.
- [ ] Borrar perfiles de demo: `["demo1","demo2"].forEach(a => localStorage.removeItem("circuitsync.perfil." + a))`.

## Restaurar si algo se rompe (de PUBLICAR.md, v5)
- Árbitro: `sudo rm -rf /opt/circuitsync/spike && sudo mv /opt/circuitsync/spike.bak-v5 /opt/circuitsync/spike && sudo systemctl restart arbitro`.
- Cliente: copia `dist-v5` (solo `index.html` y bundle anterior, sin `arte/`, en el scratchpad de la sesión del despliegue); alternativa: reconstruir desde `4ad2a17` y `swa deploy ./dist --deployment-token <TOKEN> --env production`.
- Solo el árbitro: `sudo systemctl restart arbitro`. Solo `LIMITE_MIN`: volver a comentar la línea y reiniciar.
