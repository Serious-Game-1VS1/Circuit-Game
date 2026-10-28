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

**2.1** IP de la VM y tu IP pública (PowerShell). Los nombres `rg-circuitsync`, `vm-arbitro` y `nsg-arbitro` son los de `GUIA-AZURE.md`; cámbialos si los tuyos difieren. (SUPOSICIÓN: no se verificó el estado real de la VM.)
```powershell
az login
az vm start -g rg-circuitsync -n vm-arbitro        # solo si está desasignada
az vm show -d -g rg-circuitsync -n vm-arbitro --query publicIps -o tsv
(Invoke-RestMethod https://api.ipify.org)
az network nsg rule list -g rg-circuitsync --nsg-name nsg-arbitro -o table
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
1. Portal de Azure, Crear recurso, "Static Web App". Grupo `rg-circuitsync`, plan **Free**.
2. En "Origen de implementación" elige **Otro** (subida manual).
3. Al crear, copia el token de despliegue (Administrar token de implementación). Es secreto.
```powershell
npm install -g @azure/static-web-apps-cli
cd "C:\Users\holaq\OneDrive\Documents\Electronic Basico\cliente"
swa deploy ./dist --deployment-token <TOKEN> --env production
```
Carpeta a publicar: `cliente/dist`. Dominio: `https://<nombre-aleatorio>.azurestaticapps.net` (en la página del recurso). Con GitHub Actions el build lo haría Actions: habría que poner los `VITE_*` como secretos del repo y escribir el workflow (el CI actual no despliega). Actualizar: `npm run build` y repetir `swa deploy`.

### 4b. Alternativas
**Netlify (arrastrar):** app.netlify.com, "Add new site", "Deploy manually", arrastra `cliente\dist`. Dominio `https://<nombre>.netlify.app`. Actualizar: arrastra el nuevo `dist/` en "Deploys".

**GitHub Pages:** la URL lleva subruta (`https://serious-game-1vs1.github.io/Circuit-Game/`), así que compila con base:
```powershell
npm run build -- --base=/Circuit-Game/
```
Sube el contenido de `dist/` a una rama `gh-pages` y activa Pages en Settings. Comprueba que los PNG de `arte/` carguen con la subruta (el cliente los pide con la ruta relativa `arte/`; no verificado). Si fallan, usa Netlify o Static Web Apps.

Recomendación: Netlify manual para salir rápido, o Static Web Apps si quieres todo en Azure.

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
| No entra el SSH | Tu IP cambió: `az network nsg rule update -g rg-circuitsync --nsg-name nsg-arbitro -n ssh-mi-ip --source-address-prefixes <TU_IP>/32` |
| `Falta PHOTON_APP_ID` en el log | `arbitro.env` sigue con `<PEGA_AQUI>`; el servicio se reinicia en bucle. |
| `No se pudo abrir sala en Photon... reintento` | App ID o región mal, o CCU agotados (baja `MAX_SALAS`). |

Actualizar después: árbitro, copia el código nuevo (2.3) y repite `sudo bash instalar.sh` (corta las partidas en curso: hazlo entre sesiones). Cliente, `npm run build` y vuelve a publicar `dist/`.

## 6. Costos y riesgos

| Concepto | Detalle |
|---|---|
| VM Standard_B1s encendida | Cobra por hora mientras está **asignada**. Estimado, por verificar en la calculadora de Azure: unos USD 8 a 10 al mes. Azure for Students (~USD 100) alcanza para la demo. |
| Apagar | Apagar desde dentro del SO NO deja de cobrar: `az vm deallocate -g rg-circuitsync -n vm-arbitro`. Volver: `az vm start -g rg-circuitsync -n vm-arbitro` (el servicio arranca solo). |
| IP pública | Dinámica: puede cambiar al reiniciar y cambia tu destino de SSH (los jugadores no la usan; van por Photon). Estática: sigue costando poco con la VM desasignada. Consulta: `az vm show -d -g rg-circuitsync -n vm-arbitro --query publicIps -o tsv`. |
| Borrar todo | `az group delete -n rg-circuitsync --yes` (**irreversible**). |
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
