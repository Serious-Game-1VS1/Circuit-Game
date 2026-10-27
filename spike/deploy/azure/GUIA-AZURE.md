# Desplegar el árbitro en Azure (VM East US) y probar con 2 dispositivos

El árbitro (`npm run serve:photon`) solo hace conexiones **salientes** WSS 443 a Photon: la VM no necesita puertos de entrada salvo SSH. Archivos de esta carpeta: `arbitro.service`, `arbitro.env.example`, `instalar.sh`.

## 1. Photon
1. Crea cuenta en dashboard.photonengine.com, "Create a new app" y elige tipo **Realtime**.
2. Copia el **App ID** (GUID). Es un dato sensible: no lo subas a git ni lo pegues en chats.
3. Región: `us` (East US). Plan gratis = 20 CCU; cada sala usa 3 (árbitro + 2 jugadores).

## 2. Azure for Students
Activa en azure.microsoft.com/free/students con tu correo UDLA (crédito de unos USD 100, sin tarjeta). Verifica en el portal (Suscripciones) que esté activa. La política de la suscripción puede limitar regiones: si East US falla, prueba otra región de EE. UU. (verificar).

## 3. Crear la VM
Con Azure CLI (`az login` primero). Cambia `<TU_IP>` por tu IP pública:
```bash
az group create -n rg-circuitsync -l eastus
az network nsg create -g rg-circuitsync -n nsg-arbitro
az network nsg rule create -g rg-circuitsync --nsg-name nsg-arbitro -n ssh-mi-ip \
  --priority 100 --access Allow --protocol Tcp --direction Inbound \
  --source-address-prefixes <TU_IP>/32 --destination-port-ranges 22
az vm create -g rg-circuitsync -n vm-arbitro --image Ubuntu2404 --size Standard_B1s \
  --admin-username azureuser --generate-ssh-keys --nsg nsg-arbitro
```
(El alias `Ubuntu2404` puede variar: `az vm image list --offer ubuntu-24_04-lts --all -o table`. Si B1s no está disponible usa `Standard_B1ms`.) Anota `publicIpAddress` de la salida.

Alternativa por portal: Crear recurso -> Máquina virtual; región East US; imagen Ubuntu Server 24.04 LTS; tamaño B1s/B1ms; autenticación con clave SSH (descarga el `.pem`); en Redes, NSG "Avanzado" con **una sola** regla de entrada: SSH 22, origen "Direcciones IP" = tu IP. Si tu IP cambia (WiFi vs casa), actualiza la regla.

## 4. Copiar el código
`ssh azureuser@<IP_VM>` (con `-i clave.pem` si usaste el portal).

Opción A (git): en la VM `sudo apt-get install -y git && git clone <URL_DEL_REPO> ~/repo && sudo mkdir -p /opt/circuitsync && sudo cp -r ~/repo/spike /opt/circuitsync/`.

Opción B (scp desde tu PC, sin `node_modules`): desde `spike/` en tu PC:
```bash
tar --exclude=node_modules --exclude=.env --exclude=data --exclude=bench-out -czf spike.tgz .
scp spike.tgz azureuser@<IP_VM>:/tmp/
# en la VM:
sudo mkdir -p /opt/circuitsync/spike && sudo tar -xzf /tmp/spike.tgz -C /opt/circuitsync/spike
```

## 5. Instalar y configurar
```bash
cd /opt/circuitsync/spike/deploy/azure
sudo bash instalar.sh          # Node 22, usuario "arbitro", npm ci, unidad systemd
sudo nano /etc/circuitsync/arbitro.env   # reemplaza <PEGA_AQUI> en PHOTON_APP_ID; PHOTON_REGION=us
sudo systemctl restart arbitro
```
`instalar.sh` es repetible y no pisa `/etc/circuitsync/arbitro.env`. Las variables están comentadas en `arbitro.env.example`. En la VM se usa ese archivo (`EnvironmentFile`); el `.env` de `spike/` no hace falta.

## 6. Logs y código de sala
```bash
systemctl status arbitro
journalctl -u arbitro -f            # en vivo (Ctrl+C sale)
journalctl -u arbitro -n 100 --no-pager
journalctl -u arbitro --no-pager | grep "código:" | tail -3
```
Cada sala nueva imprime `Photon (us) · sala nueva, código: XXXXXX · salas abiertas: N` (siempre deja una libre). Ese `XXXXXX` es el que escriben los jugadores. También: `[código] fase: jugando`, `[código] resultado: ... · CSV: bench-out/...`. Errores: `Falta PHOTON_APP_ID`, `No se pudo abrir sala en Photon: ... · reintento en N s`.

## 7. Actualizar versión
Copia el código nuevo (paso 4) y repite `sudo bash instalar.sh` (hace `npm ci` y reinicia). Corta las partidas en curso: hazlo entre sesiones.

## 8. Costos y apagado
La VM cobra por hora mientras está **asignada**; apagar desde dentro del SO NO deja de cobrar. Desasigna:
```bash
az vm deallocate -g rg-circuitsync -n vm-arbitro   # deja de cobrar cómputo
az vm start -g rg-circuitsync -n vm-arbitro        # el servicio arranca solo
az group delete -n rg-circuitsync --yes            # borra todo al terminar el proyecto
```
Disco e IP pública siguen costando poco aunque esté desasignada. La IP puede cambiar al reiniciar: revisa `publicIpAddress` (`az vm show -d -g rg-circuitsync -n vm-arbitro --query publicIps -o tsv`). Revisa el gasto en Cost Management. Precio de B1s: verificar en la calculadora de Azure.

## 9. Compilar y publicar el cliente
El cliente lee `VITE_TRANSPORT`, `VITE_PHOTON_APP_ID` y `VITE_PHOTON_REGION` al compilar; el App ID queda dentro del JS público (es lo normal en Photon).
```bash
cd cliente
npm ci
VITE_TRANSPORT=photon VITE_PHOTON_APP_ID=<PEGA_AQUI> VITE_PHOTON_REGION=us npm run build
# PowerShell: $env:VITE_TRANSPORT="photon"; $env:VITE_PHOTON_APP_ID="..."; $env:VITE_PHOTON_REGION="us"; npm run build
```
Salida en `cliente/dist/`. `vite.config.ts` no define `base` (queda `/`). Para GitHub Pages en `https://usuario.github.io/<repo>/` compila con `npm run build -- --base=/<repo>/` (verificar que carguen los assets de `public/arte`). Publica `dist/` en GitHub Pages o en Azure Static Web Apps (portal o `az staticwebapp`, carpeta `dist`). **HTTPS es obligatorio** para móviles (ambos servicios lo dan).

## 10. Prueba con 2 dispositivos
- [ ] `systemctl status arbitro` activo y el log muestra `sala nueva, código: ...`.
- [ ] Dispositivo A en WiFi UDLA y B en datos móviles abren la URL https del cliente.
- [ ] Ambos entran con el código; arranca la partida, prueban un pod, despachan y sale el resultado.
- [ ] Recargar uno a mitad de partida: reconecta y mantiene el estado.
- [ ] Intercambiar redes (A en datos, B en WiFi) y repetir.
- [ ] `ls /opt/circuitsync/spike/bench-out/` muestra el CSV.

Medir latencia (SCRUM-2 / 88 / 32 / 23; confirma la correspondencia en Jira). Con el árbitro de la VM abierto, desde tu PC en cada red, en `spike/` con tu `.env` local:
```bash
npm run bench:remoto -- --codigo XXXXXX --region us --muestras 100
```
Mide "Probar -> resultado" (meta p95 <= 150 ms) y "despacho -> rival" (p95 <= 250 ms). Usa un código de sala libre y la misma región que el árbitro. Repite 3 veces por red y a distintas horas. Más detalle en `spike/MEDIR-LATENCIA.md`.

## 11. Solución de problemas
| Mensaje del cliente | Causa probable |
|---|---|
| «No hay una sala abierta con ese código» | Código mal escrito, sala llena/terminada o árbitro caído. Mira `journalctl -u arbitro -f` y usa el último código. También si la región del cliente y la del árbitro difieren. |
| «El servidor de juego no está bien configurado. Avisa al docente.» | App ID inválido o de una app que no es Realtime (errores Photon 32767/32756), en el build del cliente o en `arbitro.env`. Corrige, recompila / `systemctl restart arbitro`. |
| «No se pudo conectar con el servidor de juego. Revisa tu conexión.» | La red del jugador bloquea WSS 443 (probar datos móviles), página sin HTTPS o Photon caído. |

Otros: `Falta PHOTON_APP_ID` en el log = `arbitro.env` sin editar (el servicio se reinicia en bucle). `No se pudo abrir sala... reintento` = App ID/región mal o 20 CCU agotados (baja `MAX_SALAS`). Sin acceso SSH = tu IP cambió: actualiza la regla del NSG.
