# Ensayo de la demo del 14-nov con 2 teléfonos reales

Meta: jugar solo, de principio a fin, como lo hará el comité: primero el tutorial, luego la partida de 5 min entre dos teléfonos. Haz este ensayo al menos dos veces (una por opción) y anota todo en la tabla del final.

## Antes de empezar
- Dos teléfonos y el PC en la misma WiFi (sin «aislamiento de clientes»; las WiFi de campus suelen tenerlo: prueba con tu hotspot).
- Dependencias ya instaladas (`npm ci` en `spike/` y en `cliente/`).
- Al terminar, cierra las terminales con Ctrl+C.

## Opción A: solo WiFi local (relé local, sin internet)

1. Averigua la IP del PC: `ipconfig` y copia la «Dirección IPv4» de tu WiFi (ej. `192.168.1.20`).
2. Terminal 1, en `spike/` (relé en el puerto 8787 + árbitro, demo de 5 min):
   ```
   npm run serve -- --demo --limite-min 5
   ```
   Imprime el **código de sala** (6 caracteres). (`npm run serve:demo5` hace los 5 min pero sin `--demo`.)
3. Terminal 2, en `cliente/`, forzando el relé local (PowerShell):
   ```
   $env:VITE_TRANSPORT="local"; npm run dev -- --host
   ```
   Vite muestra `Network: http://<IP>:5173`.
4. Firewall de Windows: al primer arranque acepta el aviso de Node.js en red **Privada**. Si no apareció, abre PowerShell como administrador y permite los dos puertos:
   ```
   New-NetFirewallRule -DisplayName "Ensayo 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private
   New-NetFirewallRule -DisplayName "Ensayo 8787" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow -Profile Private
   ```
   (Si la red está marcada como «Pública», cámbiala a «Privada» o añade `-Profile Any`.) Bórralas después con `Remove-NetFirewallRule -DisplayName "Ensayo*"`.
5. En cada teléfono abre `http://<IP del PC>:5173` (ej. `http://192.168.1.20:5173`). No hace falta nada más: el cliente toma el relé de la misma IP de la página (`ws://<IP>:8787`). Solo si cambiaste el puerto (`PORT=8797`) añade `?relay=ws://<IP>:8797`.
6. Comprobación rápida: desde un teléfono abre `http://<IP>:5173` y, si carga pero no entra a la sala, el problema es el puerto 8787 (firewall).

## Opción B: Photon real (internet)

1. `PHOTON_APP_ID` va en **dos** archivos que no se versionan (sin valores aquí): `spike/.env` (`PHOTON_APP_ID=`, `PHOTON_REGION=`) y `cliente/.env.local` (`VITE_PHOTON_APP_ID=`, `VITE_PHOTON_REGION=`). Plantillas: `.env.example` de cada carpeta. La región debe ser la misma en ambos.
2. Región recomendada: **`us`** (la medición dio p95 ≈ 199 ms contra 355 ms de `sa`). Mide de nuevo desde la sala de la demo (`spike/MEDIR-LATENCIA.md`).
3. Terminal 1, en `spike/`: `npm run serve:photon -- --demo --limite-min 5` (imprime el código de sala).
4. Terminal 2, en `cliente/`: `npm run dev -- --host` (con App ID el cliente elige Photon solo; para forzarlo: `$env:VITE_TRANSPORT="photon"`).
5. Los teléfonos abren `http://<IP del PC>:5173` (misma WiFi) o, con internet, una versión publicada (`npm run build`, carpeta `dist/`). Los teléfonos necesitan salida a internet por el puerto 443; el PC también.
6. Para parecerse más a la demo, prueba también la página servida con `npm run build; npm run preview -- --host` (puerto 4173).

## Obstáculos reales (sin cambiar código)
- Si `cliente/.env.local` tiene App ID, el cliente usa Photon por defecto: en la Opción A **debes** poner `VITE_TRANSPORT=local` o el árbitro local no se verá.
- El relé local no cifra (`ws://`): solo funciona desde páginas `http://`. Una página `https://` publicada lo bloquearía; por eso la Opción A es solo en LAN.
- El relé admite una sala por proceso. El árbitro, tras la partida, la reabre con el mismo código («Volver a jugar»).
- La IP del PC puede cambiar entre ensayos (DHCP): vuelve a mirarla.
- `vite --host` sirve el modo desarrollo; si los teléfonos van lentos, prueba `build` + `preview`.
- Photon: máx. 20 CCU gratis; cada sala usa 3.

## Lista de comprobación de la partida
Marca cada punto en ambos teléfonos.
- [ ] Tutorial (botón «Tutorial»): los 10 pasos se entienden solos (sin saltos de numeración); «Saltar» funciona; el botón «Tutorial 2» (fusible, placa, LED girado, empalme) también y «Salir» se ve y se toca.
- [ ] Práctica: «Practicar» juega solo y se sale tocando la línea «Práctica».
- [ ] Entrar con el código de sala y un alias distinto en cada teléfono.
- [ ] Pulsar «Listo» en ambos: cuenta 3-2-1.
- [ ] Reloj arranca en 5:00 en los dos y coincide (±1 s).
- [ ] Placa y cables: arrastrar piezas, unir con cables, quitar un cable.
- [ ] Multímetro (en el demo de cableado está oculto: confirma que no aparece).
- [ ] Pieza quemada: «Probar» queda bloqueado 4 s y se nota.
- [ ] Despachar un pod (tras reparar todas las zonas); el rival ve el progreso.
- [ ] Rival sin conexión: cierra la pestaña de un teléfono; el otro lo ve. Reabre con el **mismo alias** antes de 30 s y recupera su progreso.
- [ ] Carrera final y podio al despachar los 5 o al acabar el tiempo.
- [ ] «Volver a jugar» lleva a Entrar con el alias puesto y se juega otra con el mismo código.

## Qué anotar
- Capturas de cada pantalla importante (tutorial, placa, podio).
- Tiempo de respuesta percibido de «Probar» y de «Despachar» (instantáneo / se nota / lento).
- Textos cortados o ilegibles (anota teléfono y orientación).
- Botones difíciles de tocar (pequeños, pegados a otro, tapados por el teclado).
- Red usada, hora y opción (A o B).

## Tabla de fallos

| # | Qué pasó | Dónde (pantalla/teléfono) | Severidad (bloquea / molesta / menor) | Opción A/B | Captura |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
