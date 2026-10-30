# Postura de seguridad de CircuitSync (para el comité)

Sitio: https://juego.circuitsyncjuego.com. Fecha: 30-oct-2026. Detalle técnico: `spike/SEGURIDAD-AUDITORIA.md`; escaneos: `spike/seguridad/ESCANEOS.md`.

## 1. Arquitectura

- **Cliente estático** (Phaser, TypeScript) en Azure Static Web Apps, por HTTPS. Sin cuentas, contraseñas ni base de datos expuesta.
- **Árbitro autoritativo** (Node 22) en una VM de Azure (Ubuntu 24.04). Decide ganador, tiempos de espera y castigos; la solución y la semilla nunca viajan al navegador. No abre ningún puerto de aplicación: solo conexiones salientes.
- **Transporte:** Photon Realtime por WSS (443). Cliente y árbitro se encuentran en una sala de Photon.

## 2. Controles aplicados

| Área | Control |
|---|---|
| Sitio | HTTPS con HSTS, CSP restrictiva, `X-Frame-Options`/`frame-ancestors`, Permissions-Policy, COOP, nosniff, Referrer-Policy |
| Código | Sin `innerHTML`/`eval`; parámetros de URL saneados; entradas validadas en el servidor; mensajes malformados descartados sin caída |
| Autoridad | El servidor calcula cooldowns, bloqueos, despacho y ganador; un cliente modificado no puede declarar victoria |
| VM | Servicio `arbitro` endurecido con systemd (`systemd-analyze security` de 8,7 a 1,3), usuario sin shell, `ufw` (solo 443), `fail2ban` en SSH, NSG con SSH restringido a una IP, solo clave SSH |
| Parches | `unattended-upgrades` activo; rutina mensual manual de `apt upgrade` y `npm audit` |
| Secretos | Sin secretos en git ni en el JS (el App ID de Photon es público por diseño); `arbitro.env` con permisos 640 |
| Privacidad | Aviso en el juego (4 páginas, panel PRIVACIDAD): finalidad, datos, base legal LOPDP, derechos, terceros |

## 3. Resultados de los escaneos (30-oct-2026, notas reales)

| Herramienta | Nota |
|---|---|
| MDN HTTP Observatory | A+ (120/100) |
| securityheaders.com | A+ |
| Qualys SSL Labs | A |

HSTS de un año (max-age=31536000) publicado en nuestra config; Observatory 12/12.

## 4. Preguntas probables

1. **¿Y si se cae el servidor?** `systemd` lo reinicia en 5 s; el cliente reconecta y el árbitro reserva el asiento 30 s. Las partidas duran minutos y no hay datos críticos. Si la VM entera cae, el juego no funciona hasta reiniciarla; no hay alta disponibilidad (ver riesgos).
2. **¿Cuántos jugadores a la vez?** El plan gratuito de Photon permite 20 conexiones simultáneas (CCU). El árbitro usa 1 por sala, así que `MAX_SALAS=6` (18 CCU en total) es el techo. Para un grupo grande hay que escalonar o pagar un plan.
3. **¿Datos personales y LOPDP?** Alias, ID de alumno opcional y resultados; base legal: consentimiento. Aviso publicado y correo para ejercer derechos. El borrado automático a los 12 meses está ACTIVO en producción desde el 30-oct-2026. Falta, si hay menores, la autorización institucional.
4. **¿Hubo pruebas externas?** Escaneos públicos automáticos (sección 3) y una auditoría interna de solo lectura. No se hizo prueba de penetración manual ni por terceros.
5. **¿Pueden hacer trampa?** No pueden forzar victoria ni saltarse esperas. Solo adivinar entre 3 o 4 opciones pagando cada error. Un rival técnico podía enviar mensajes falsos de "árbitro" a su oponente (S-03); el filtro por anfitrión ya está en `spike/src/transport/photon.ts` (`eventoAceptable`), pero en el momento de redactar este texto aún no está confirmado en commit ni desplegado en la VM.
6. **¿Copias de seguridad?** No hay copias automáticas. Los datos son resultados de partida en la VM (`/var/lib/circuitsync/docente`). El código está en GitHub. Pérdida de la VM = pérdida de los resultados acumulados.
7. **¿Qué pasa cuando se acabe el crédito de Azure?** La VM y el sitio se apagan o se cobran. La VM B1s es de costo bajo, pero no hay plan formal de continuidad; el cliente estático (plan Free) podría migrarse a otro hosting y el árbitro a cualquier VM con Node 22.

## 5. Riesgos conocidos y plan

| Riesgo | Estado |
|---|---|
| Retención de 12 meses | **Activa en producción (30-oct-2026).** Purga automática al arrancar y cada 24 h; además se borra a petición por correo |
| `sshd` (S-07): `PermitRootLogin no`, `X11Forwarding no` | **Resuelto** 30-oct-2026 (`99-endurecimiento.conf`, también `MaxAuthTries 3`; puerto 443 intacto) |
| Log del árbitro sin alias ni semilla; journal con retención de 30 días (S-11b) | **Resuelto** 30-oct-2026 (entradas antiguas caducan el 29-nov-2026) |
| Panel docente | Sin autenticación y sin auditar; no hay servidor HTTP aún. **A construir** con Cloudflare Access o clave compartida, y auditar antes de exponerlo |
| Disponibilidad | Sin monitoreo hoy. **A cargo del usuario:** UptimeRobot sobre el sitio |
| 20 CCU de Photon | Límite aceptado para el piloto; alertas en el panel de Photon, rotar App ID si se abusa |
| Copias de seguridad y continuidad tras el crédito Azure | Sin plan formal |

**Retención de datos (S-11):** el borrado automático a los 12 meses (`spike/src/docente/retencion.ts`, con pruebas) está **ACTIVO en producción** desde el 30-oct-2026 (verificado: el log de arranque muestra «retención: 0 registros eliminados» y el usuario `arbitro` escribe en `/var/lib/circuitsync/docente`); el aviso de privacidad ya se cumple. Purga `partidas/*.json|csv` y `sesiones.json` en `/var/lib/circuitsync/docente`, ruta incluida en `ReadWritePaths=/opt/circuitsync /var/lib/circuitsync`. No toca `alumnos.json`.
