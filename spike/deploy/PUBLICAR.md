# Publicar CircuitSync

Guía para que otras personas jueguen por una URL pública: el árbitro corre en una VM de Azure (con Photon Realtime como transporte) y el cliente se sirve como sitio estático por HTTPS. Complementa `azure/GUIA-AZURE.md` (creación de la VM, costos y problemas) con el recorrido completo. Lo marcado (SUPOSICIÓN) no se pudo verificar.

Marcadores: `<tu-app-id>`, `<IP_VM>`, `<TU_IP>`, `<TOKEN>`. Nunca escribas valores reales en este archivo ni en git.

## 1. Preparación

| Dato | Dónde | ¿Secreto? |
|---|---|---|
| Photon App ID (GUID, app tipo **Realtime**) | Panel de Photon | En el árbitro (`arbitro.env`): sí. En el cliente queda dentro del JS público (público por diseño), pero no se versiona. No lo pegues en chats. |
| Región de Photon | `us` (árbitro en Virginia) | No |
| `MAX_SALAS` | 6 por defecto | No |
| Clave SSH de la VM (`.pem`) | Tu PC | **Sí** |
| `/etc/circuitsync/arbitro.env` en la VM | VM | **Sí** |
| Token de despliegue de Static Web Apps | Portal | **Sí** |

Regla crítica: el **mismo App ID y la misma región** en el árbitro (`PHOTON_APP_ID`, `PHOTON_REGION`) y en el cliente (`VITE_PHOTON_APP_ID`, `VITE_PHOTON_REGION`). Si difieren, el cliente no encuentra la sala.

En tu PC: Node 22 y npm, Azure CLI (`az`), git, `ssh`, `scp` y `tar` (Windows 11 los trae).

## 2. Árbitro en la VM

El árbitro solo hace conexiones **salientes** WSS por el puerto 443 hacia Photon (Azure las permite por defecto). Del lado de ENTRADA del NSG solo hace falta **SSH (22) desde tu IP**. No abras 80, 443 ni 8787.

**2.1** IP de la VM y tu IP pública (PowerShell). Los nombres `circuitsync-rg`, `arbitro-vm` y `arbitro-vm-nsg` son los reales (verificados en la auditoría del 30-oct). (SUPOSICIÓN: no se verificó el estado real de la VM.)
```powershell
az login
az vm start -g circuitsync-rg -n arbitro-vm        # solo si está desasignada
az vm show -d -g circuitsync-rg -n arbitro-vm --query publicIps -o tsv
(Invoke-RestMethod https://api.ipify.org)
az network nsg rule list -g circuitsync-rg --nsg-name arbitro-vm-nsg -o table
```

**2.2** Entra por SSH:
```powershell
ssh azureuser@<IP_VM>
# si usaste el portal y descargaste un .pem:
ssh -i C:\ruta\clave.pem azureuser@<IP_VM>
```

**2.3** Copia el código. Opción A (git, rama `audio`; ya incluye todos los commits). Bash en la VM:
```bash
sudo apt-get update && sudo apt-get install -y git
git clone --branch audio https://github.com/Serious-Game-1VS1/Circuit-Game.git ~/repo
sudo mkdir -p /opt/circuitsync && sudo cp -r ~/repo/spike /opt/circuitsync/
```
Si el repo es privado el clonado pedirá credenciales (SUPOSICIÓN: no se sabe si es público); usa la opción B.

Opción B (scp desde tu PC):
```powershell
cd "C:\Users\holaq\OneDrive\Documents\Electronic Basico\spike"
tar --exclude=node_modules --exclude=.env --exclude=data --exclude=bench-out -czf $env:TEMP\spike.tgz .
scp $env:TEMP\spike.tgz azureuser@<IP_VM>:/tmp/
```
```bash
# en la VM:
sudo mkdir -p /opt/circuitsync/spike && sudo tar -xzf /tmp/spike.tgz -C /opt/circuitsync/spike
```

**2.4** Instala Node 22, el usuario `arbitro`, `npm ci` y el servicio systemd (repetible; no pisa `arbitro.env`):
```bash
cd /opt/circuitsync/spike/deploy/azure
sudo bash instalar.sh
```

**2.5** Configura el árbitro (formato systemd: sin comillas ni `export`):
```bash
sudo nano /etc/circuitsync/arbitro.env
```
```
PHOTON_APP_ID=<tu-app-id>
PHOTON_REGION=us
MAX_SALAS=6
```
`DOCENTE_DATA=/var/lib/circuitsync/docente` ya viene en la plantilla. Para demo de 5 min descomenta `LIMITE_MIN=5`. Luego:
```bash
sudo systemctl restart arbitro
```

**2.6** Comprueba y obtén el código de sala:
```bash
systemctl status arbitro                       # "active (running)"
journalctl -u arbitro -f                       # en vivo; Ctrl+C sale
journalctl -u arbitro --no-pager | grep "código:" | tail -3
```
Debe aparecer `Photon (us) · sala nueva, código: XXXXXX · salas abiertas: N`. Ese `XXXXXX` es lo que escriben los jugadores; cuando una sala se llena, el árbitro abre otra con código nuevo, así que usa siempre el último.

## 3. Cliente: construir

**3.1** Crea `cliente/.env.local` (ya ignorado por git) a partir de la plantilla:
```powershell
cd "C:\Users\holaq\OneDrive\Documents\Electronic Basico\cliente"
Copy-Item .env.example .env.local
notepad .env.local
```
```
VITE_TRANSPORT=photon
VITE_PHOTON_APP_ID=<tu-app-id>
VITE_PHOTON_REGION=us
```

**3.2** Construye:
```powershell
npm ci
npm run build
```
Sin archivo, solo para esa sesión: `$env:VITE_TRANSPORT="photon"; $env:VITE_PHOTON_APP_ID="<tu-app-id>"; $env:VITE_PHOTON_REGION="us"; npm run build`.

Las variables `VITE_` se incrustan **al compilar**: si cambias App ID o región, reconstruye y vuelve a publicar. **Reconstruye con tu App ID real antes de publicar**; un `dist/` hecho con otro valor no conecta.

**3.3** Contenido de `cliente/dist/` (medido en un build de prueba):

| Contenido | Tamaño |
|---|---|
| `index.html` | 0,41 kB |
| `assets/index-*.js` (Phaser + juego + Photon) | 1.580 KB (gzip 423 KB); Vite avisa de >500 kB, no es error |
| `arte/` (246 archivos: PNG y `fuente_pixel.xml`) | 0,08 MB; el más grande es `fuente_pixel.xml` (10 KB), los PNG pesan 1 a 3 KB |
| **Total** | **1,63 MB, 248 archivos** |

Móvil: el peso no es el problema (descarga real ~0,5 MB con gzip); lo es el número de peticiones (~246 PNG). El build no reduce ese número. Sirve con HTTP/2 o HTTP/3 y compresión, y con caché larga en `assets/` (nombres con hash); Static Web Apps, Netlify y GitHub Pages lo hacen por defecto (SUPOSICIÓN). Los ~35 s de espera en desarrollo vienen de que Vite sirve los módulos sin empaquetar; mide de nuevo con la URL publicada. Un atlas de sprites reduciría las peticiones, pero es un cambio de código fuera de esta guía.

## 4. Hosting del cliente

**HTTPS es obligatorio**: el navegador solo permite el WSS de Photon desde una página HTTPS, y el audio en móviles también lo exige. Los tres servicios siguientes dan HTTPS automático.

### 4a. Azure Static Web Apps (plan Free)
1. Portal de Azure, Crear recurso, "Static Web App". Grupo `circuitsync-rg`, plan **Free**.
2. En "Origen de implementación" elige **Otro** (subida manual).
3. Al crear, copia el token de despliegue (Administrar token de implementación). Es secreto.
```powershell
npm install -g @azure/static-web-apps-cli
cd "C:\Users\holaq\OneDrive\Documents\Electronic Basico\cliente"
swa deploy ./dist --deployment-token <TOKEN> --env production
```
Carpeta a publicar: `cliente/dist`. Dominio: `https://<nombre-aleatorio>.azurestaticapps.net` (en la página del recurso). Con GitHub Actions el build lo haría Actions: habría que poner los `VITE_*` como secretos del repo y escribir el workflow (el CI actual no despliega). Actualizar: `npm run build` y repetir `swa deploy`.

**Cabeceras de seguridad (S-01/S-12).** La config de Static Web Apps vive en `cliente/public/staticwebapp.config.json`: Vite la copia sola a `dist/` en cada `npm run build` (ya no se recrea a mano; `dist/_headers` es de Netlify y SWA lo ignora). Trae caché larga en `/assets/*`, respaldo a `/index.html` y `globalHeaders` (CSP en modo enforce, `X-Frame-Options`, `Permissions-Policy`, COOP). `swa deploy ./dist` la sube con el sitio; comprueba tras publicar con `curl -sI https://juego.circuitsyncjuego.com/` que aparece `Content-Security-Policy`. Si agregas el panel docente (`VITE_DOCENTE_URL`), añade su host a `connect-src` en ese archivo. Hosts permitidos: el propio sitio, `wss://ns.photonengine.io`, `wss://*.photonengine.io` y `wss://*.exitgames.com`.

### 4b. Alternativas
**Netlify (arrastrar):** app.netlify.com, "Add new site", "Deploy manually", arrastra `cliente\dist`. Dominio `https://<nombre>.netlify.app`. Actualizar: arrastra el nuevo `dist/` en "Deploys".

**GitHub Pages:** la URL lleva subruta (`https://serious-game-1vs1.github.io/Circuit-Game/`), así que compila con base:
```powershell
npm run build -- --base=/Circuit-Game/
```
Sube el contenido de `dist/` a una rama `gh-pages` y activa Pages en Settings. Comprueba que los PNG de `arte/` carguen con la subruta (el cliente los pide con la ruta relativa `arte/`; no verificado). Si fallan, usa Netlify o Static Web Apps.

Recomendación: Netlify manual para salir rápido, o Static Web Apps si quieres todo en Azure.

## Dominio propio (ejemplo real)

1. Comprar `<tu-dominio>` en un registrador (por ejemplo Cloudflare Registrar) y activar la auto-renovación.
2. En el DNS del dominio, crear un registro `CNAME` con nombre `juego` y destino `<tu-app>.<id>.azurestaticapps.net`, en modo «DNS only» (sin proxy; en Cloudflare, nube gris).
3. En Azure: Static Web App → Custom domains → Add → `juego.<tu-dominio>`; esperar el estado Ready. Azure emite y renueva el certificado.
4. Opcional: marcar el dominio nuevo como predeterminado y probar `https://juego.<tu-dominio>`.
5. Un futuro panel docente iría en `docente.<tu-dominio>` (registro `A` hacia la IP de la VM); el SSH tendría que salir del puerto 443.

## Orden de despliegue y versión de protocolo

Cuando una actualización toca el protocolo o las familias de pods, el orden es siempre **primero el cliente (sección 4), luego el árbitro (sección 2)**, fuera de horario de clase y avisando de que recarguen la página:

- Cliente nuevo + árbitro viejo: **degrada sin romperse** (rachas, `limpios` y `medirMs` caen a su valor por defecto; la lectura del multímetro sale gris; no llegan sabotajes). La Sala muestra «Versión distinta del servidor: recarga la página».
- Árbitro nuevo + cliente viejo (pestañas abiertas o caché): **puede fallar** en familias que el cliente no conoce (p. ej. `cadena`) y rechaza el multímetro con otro ritmo. Por eso el árbitro va al final.
- El `Welcome` lleva `version` (`PROTOCOL_VERSION` en `spike/src/protocol.ts`, hoy 2). Súbela cuando un cambio sea incompatible con clientes anteriores. Un árbitro anterior a la v2 no la envía, y el cliente lo trata como versión distinta.
- **Tras desplegar, verifica `version`**: abre el cliente nuevo contra el árbitro nuevo, entra a una sala y comprueba que la Sala NO muestra el aviso naranja de versión; si aparece, el árbitro o el cliente publicado no son los esperados.

## 5. Comprobación de punta a punta

1. En la VM, anota el último código: `journalctl -u arbitro --no-pager | grep "código:" | tail -1`.
2. Abre la URL https en dos dispositivos (ideal: uno en WiFi y otro en datos móviles).
3. Cada uno escribe el **mismo código** y un **alias distinto** y pulsa «Listo».
4. Debe arrancar la partida, probar un pod y mostrar el resultado. El log muestra `[código] fase: jugando` y luego el resultado.
5. Opcional: recarga uno a mitad de partida; reconecta solo cada 2 s y el árbitro guarda el asiento 30 s.

| Síntoma | Causa |
|---|---|
| «No hay una sala abierta con ese código» | Código mal escrito, sala llena o terminada, árbitro caído, o región distinta entre cliente y árbitro. Usa el último código del log. |
| «El servidor de juego no está bien configurado. Avisa al docente.» | App ID inválido o de una app que no es Realtime (errores 32767 y 32756), en el build del cliente o en `arbitro.env`. |
| «No se pudo conectar con el servidor de juego. Revisa tu conexión.» | La red del jugador bloquea WSS 443 (prueba datos móviles), la página no es HTTPS, o Photon caído. |
| Se ve la versión vieja | Caché del navegador o del host: Ctrl+F5 o ventana privada. |
| No entra el SSH | Tu IP cambió: `az network nsg rule update -g circuitsync-rg --nsg-name arbitro-vm-nsg -n ssh-mi-ip --source-address-prefixes <TU_IP>/32` |
| `Falta PHOTON_APP_ID` en el log | `arbitro.env` sigue con `<PEGA_AQUI>`; el servicio se reinicia en bucle. |
| `No se pudo abrir sala en Photon... reintento` | App ID o región mal, o CCU agotados (baja `MAX_SALAS`). |

Actualizar después: árbitro, copia el código nuevo (2.3) y repite `sudo bash instalar.sh` (corta las partidas en curso: hazlo entre sesiones). Cliente, `npm run build` y vuelve a publicar `dist/`.

## 6. Costos y riesgos

| Concepto | Detalle |
|---|---|
| VM Standard_B1s encendida | Cobra por hora mientras está **asignada**. Estimado, por verificar en la calculadora de Azure: unos USD 8 a 10 al mes. Azure for Students (~USD 100) alcanza para la demo. |
| Apagar | Apagar desde dentro del SO NO deja de cobrar: `az vm deallocate -g circuitsync-rg -n arbitro-vm`. Volver: `az vm start -g circuitsync-rg -n arbitro-vm` (el servicio arranca solo). |
| IP pública | Dinámica: puede cambiar al reiniciar y cambia tu destino de SSH (los jugadores no la usan; van por Photon). Estática: sigue costando poco con la VM desasignada. Consulta: `az vm show -d -g circuitsync-rg -n arbitro-vm --query publicIps -o tsv`. |
| Borrar todo | `az group delete -n circuitsync-rg --yes` (**irreversible**). |
| Static Web Apps Free, Netlify, GitHub Pages | Gratis (límites de ancho de banda del plan Free de SWA: por verificar). |
| App ID en el cliente | Viaja en el JS: público por diseño en Photon. Los secretos reales son la clave SSH, `arbitro.env` y el token de despliegue. |
| Plan gratis de Photon | 20 CCU. Cada sala usa 3 (árbitro + 2 jugadores): `MAX_SALAS=6` usa 18 y el árbitro siempre deja una sala libre abierta. Sin CCU, las salas nuevas fallan. Baja `MAX_SALAS` si quieres margen. |
| Rama a publicar | Clona la rama `audio` (tiene la música, el Tutorial 2 y los últimos cambios); `main` va atrasada respecto a ella. |
| Panel docente | `DOCENTE_USER` y `DOCENTE_PASS_HASH` están comentados y no hacen falta para jugar; antes de usarlos confirma en `spike/DOCENTE-CONTRATO.md` quién los lee. |

## Lo no verificado
- Estado real de la VM (existencia, encendida o apagada, nombres de grupo y NSG, IP, tamaño).
- Si el repo de GitHub es público (para clonar sin credenciales).
- Que `--base` funcione con los PNG de `arte/` en GitHub Pages.
- Costos exactos y límites del plan Free de Static Web Apps.
- Tiempo de carga real en móvil y comportamiento de caché con la URL publicada.

## Endurecimiento de la VM (30-oct-2026)

Aplicado en `arbitro-vm` (Ubuntu 24.04, sshd solo en 443). Mantén siempre una sesión SSH abierta mientras tocas firewall o NSG y prueba con una conexión nueva antes de cerrar.

**systemd (S-05).** Drop-in `spike/deploy/azure/endurecimiento.conf` (lo instala `instalar.sh` en `/etc/systemd/system/arbitro.service.d/`). Sin `MemoryDenyWriteExecute` (Node lo necesita). Puntaje `systemd-analyze security arbitro`: 8,7 EXPOSED a 1,3 OK.
```bash
sudo mkdir -p /etc/systemd/system/arbitro.service.d
sudo install -m 644 endurecimiento.conf /etc/systemd/system/arbitro.service.d/
sudo systemctl daemon-reload && sudo systemctl restart arbitro
systemd-analyze security arbitro --no-pager | tail -1
```
Antes de reiniciar, mira `sudo journalctl -u arbitro` por partidas en curso. Para revertir, borra el drop-in y haz `daemon-reload` + `restart`.

**ufw (S-06).** Permitir 443 antes de habilitar:
```bash
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow 443/tcp && sudo ufw --force enable
```

**fail2ban (S-06).** `sudo apt-get install -y fail2ban` y `/etc/fail2ban/jail.d/sshd-443.local`:
```
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 <TU_IP>
bantime = 1h
findtime = 10m
maxretry = 5
[sshd]
enabled = true
port = 443
backend = systemd
```
`sudo systemctl restart fail2ban && sudo fail2ban-client status sshd`.

**NSG (S-08).** Se borró la regla SSH del 22; queda `SSH-443` desde una sola IP: `az network nsg rule delete -g circuitsync-rg --nsg-name arbitro-vm-nsg -n SSH`. Si cambia tu IP, actualiza esa regla y el `ignoreip` de fail2ban.

**sshd (S-07).** `/etc/ssh/sshd_config.d/99-endurecimiento.conf` con `PermitRootLogin no`, `X11Forwarding no`, `PasswordAuthentication no`, `MaxAuthTries 3` (el puerto no se toca; en Ubuntu 24.04 lo gestiona `ssh.socket`). Antes de recargar: `sudo sshd -t`; recarga con `sudo systemctl reload ssh`, comprueba `ss -ltn | grep :443` y abre una sesión nueva antes de cerrar la anterior. Revertir: borrar el archivo y recargar.

**Journal (S-11b).** El log del árbitro no lleva alias ni semilla. `/etc/systemd/journald.conf.d/retencion.conf` con `[Journal]` y `MaxRetentionSec=30day`, luego `sudo systemctl restart systemd-journald` y `sudo journalctl --vacuum-time=30d`.

**Parches.** `unattended-upgrades` activo (seguridad diaria); se aplicó `apt upgrade` el 30-oct sin necesidad de reinicio.

> **Retención (S-11):** `src/docente/retencion.ts` (purga a los 12 meses de partidas y sesiones al arrancar y cada 24 h) está **ACTIVA en producción** desde el 30-oct-2026 (desplegada con el procedimiento 2.3 opción B + `instalar.sh`; el log de arranque muestra «retención: N registros eliminados»; respaldo previo en `/opt/circuitsync/spike.bak-retencion`). Escribe solo en `DOCENTE_DATA` (`/var/lib/circuitsync/docente`), dentro de `ReadWritePaths`.

## Despliegue v2 (30/31-oct-2026, commit d685599)

Publicado en este orden: cliente (SWA `circuitsyncjuego`, bundle `index-BSXHzftr.js`, antes `index-DDwWp4pU.js`; `dist/version.json` con commit y protocolo 2, no se versiona) y luego árbitro (protocolo 2). Al árbitro se subieron `src/`, `deploy/`, `package*.json` y `tsconfig.json` (se reemplazaron `src` y `deploy`) y se corrió `instalar.sh`; el drop-in de endurecimiento sigue activo (1,3 OK) y `/var/lib/circuitsync/docente` es escribible. Verificado: la Sala no muestra el aviso de versión y lista la sala nueva.

Restaurar:
- Árbitro: `sudo rm -rf /opt/circuitsync/spike && sudo mv /opt/circuitsync/spike.bak-v2 /opt/circuitsync/spike && sudo systemctl restart arbitro`.
- Cliente: copia del `index.html` y del bundle anterior en el scratchpad de la sesión (`dist-anterior`; no incluye `arte/`). Alternativa: reconstruir desde el commit anterior (`1ef0fd4` o `eeef2eb`) y `swa deploy`.

## Despliegue v3 (31-oct-2026, commit 79fb2af)

Cliente primero (SWA `circuitsyncjuego`, bundle `index-1op_NFEn.js`, antes `index-BSXHzftr.js`; `dist/version.json` con commit `79fb2af` y protocolo 2) y luego árbitro (`src/` y `deploy/` reemplazados, `instalar.sh` ejecutado; endurecimiento 1,3 OK, `/var/lib/circuitsync/docente` escribible, log con «Photon (us) · sala nueva» y «retención»). Cambios: solapes y selección de piezas en la placa, y la lista de salas muestra el nivel real. CI verde (Spike y Cliente).

Restaurar:
- Árbitro: `sudo rm -rf /opt/circuitsync/spike && sudo mv /opt/circuitsync/spike.bak-v3 /opt/circuitsync/spike && sudo systemctl restart arbitro`.
- Cliente: copia del `index.html` y el bundle anterior en el scratchpad de la sesión (`dist-v2`; sin `arte/`). Alternativa: reconstruir desde `d685599` y `swa deploy`.

## Despliegue v4 (31-oct-2026, commit 8a0621b)

Cliente primero (SWA `circuitsync-juego`, bundle `index-Dt-0JLwn.js`, antes `index-1op_NFEn.js`; `dist/version.json` con commit `8a0621b` y protocolo 2) y luego árbitro (`src/` y `deploy/` reemplazados, `instalar.sh` ejecutado; endurecimiento 1,3 OK, `/var/lib/circuitsync/docente` escribible). Cambio: el coste de medir crece al repetir la zona (escala [1, 1,25, 1,5]; el multímetro muestra «próx. 3,75 s», luego «próx. 4,5 s»). CI verde (Spike y Cliente).

Restaurar:
- Árbitro: `sudo rm -rf /opt/circuitsync/spike && sudo mv /opt/circuitsync/spike.bak-v4 /opt/circuitsync/spike && sudo systemctl restart arbitro`.
- Cliente: copia del `index.html` y el bundle anterior en el scratchpad de la sesión (`dist-v3`; sin `arte/`). Alternativa: reconstruir desde `79fb2af` y `swa deploy`.

Segundo despliegue v4, solo cliente (31-oct-2026, commit `4ad2a17`): la ayuda del multímetro aclara que medir toma tiempo (bundle `index-Bdug4yaC.js`, antes `index-Dt-0JLwn.js`; `version.json` con `4ad2a17`). El árbitro no cambió. Respaldo del cliente anterior en el scratchpad (`dist-v4`, sin `arte/`). Restaurar: reconstruir desde `8a0621b` y `swa deploy`.
