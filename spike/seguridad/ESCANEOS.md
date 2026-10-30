# Escaneos públicos de seguridad: juego.circuitsyncjuego.com

Fecha: 30-oct-2026 (UTC ~06:55 a 07:05). Sitio con la CSP y las cabeceras de `cliente/public/staticwebapp.config.json` ya publicadas (verificado con las cabeceras crudas que reportan las herramientas). Notas copiadas tal cual de cada herramienta.

| Herramienta | Nota | Evidencia |
|---|---|---|
| MDN HTTP Observatory (API v2, algoritmo v6) | **A+, 120/100**, 12 de 12 pruebas pasadas (tras publicar HSTS propio; antes 110/100, 11 de 12) | `capturas/observatory-1.jpg`, `observatory-2.jpg` |
| securityheaders.com (Snyk) | **A+** | `capturas/securityheaders.jpg` |
| Qualys SSL Labs (API v3, `publish=off`) | **A** (IP 20.72.253.180) | `capturas/ssllabs-api.json` |

## Hallazgos reportados

**Observatory.** Única prueba fallida: Strict-Transport-Security, -10 puntos, porque `max-age=10886400` (126 días) es menor a seis meses (15768000 s). Informativos sin penalización: CSP con `'unsafe-inline'` en `style-src` (recomienda quitarlo), sin Subresource Integrity (todos los scripts son del mismo origen) y sin COEP/CORP. Pasan: redirección HTTP a HTTPS, Referrer-Policy (+5), X-Frame-Options vía `frame-ancestors` (+5), COOP `same-origin` (+10), nosniff, CORS, sin cookies.

**securityheaders.com.** Cabeceras reconocidas: HSTS, Referrer-Policy, X-Content-Type-Options, CSP, X-Frame-Options y Permissions-Policy. Menciona como "próximas" COEP y CORP (no afectan la nota).

**SSL Labs.** Solo TLS 1.2 y 1.3, sin Heartbleed, POODLE, FREAK, Logjam ni RC4; secreto perfecto hacia adelante en los clientes modernos (`forwardSecrecy`=4), HSTS presente; certificado RSA 2048 válido hasta 2027-04-30. La API no entregó A+ y reporta HSTS de 10886400 s; el criterio de SSL Labs para A+ pide HSTS de al menos 6 meses (criterio de memoria, no verificado en su documentación en esta sesión).

## Mejora aplicada: HSTS de un año

Se agregó `"Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload"` a `globalHeaders` y se desplegó (30-oct-2026). En producción sale UNA sola cabecera con ese valor (SWA respeta la nuestra, sin duplicado). Observatory subió de 110 a 120/100, 12 de 12 pruebas. El resto de la sección anterior (SSL Labs, securityheaders) no se repitió.

## Qué no se midió

SSL Labs: solo se leyó el JSON de la API (no se guardó captura de su web). No se probó TLS por IP secundaria (el JSON listó un solo endpoint). Las notas cambian con el tiempo: repetir antes de la defensa.
