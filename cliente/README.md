# CircuitSync · cliente de navegador

Cliente Phaser (Vite + TypeScript) del duelo 1 contra 1. El árbitro corre en Node (`spike/`) y es la única fuente de verdad; el cliente solo envía "Probar" y pinta lo que el árbitro decide.

## Transporte

| Modo | Árbitro | Red |
|------|---------|-----|
| `photon` (por defecto si hay App ID) | `npm run serve:photon` en `spike/` | Photon Cloud, solo WSS por el puerto 443 |
| `local` | `npm run serve` en `spike/` | relé WebSocket en `ws://<host>:8787` (una sala por proceso) |

El navegador usa el mismo `spike/src/transport/photon.ts` que el árbitro: el paquete npm `photon-realtime` trae un envoltorio de Node con el paquete `ws`, y en el navegador se reemplaza por el WebSocket nativo.

## Variables de entorno

`spike/.env` (árbitro, ignorado por git):

- `PHOTON_APP_ID`: App ID de Photon Realtime.
- `PHOTON_REGION`: región (vacío = `us`).
- `MAX_SALAS`: salas Photon simultáneas como máximo (por defecto 6; cada sala usa 3 CCU y el plan gratuito admite 20).

`cliente/.env.local` (navegador, ignorado por git; plantilla en `.env.example`):

- `VITE_PHOTON_APP_ID`: el mismo App ID (es público: viaja dentro del cliente).
- `VITE_PHOTON_REGION`: la misma región que el árbitro.
- `VITE_TRANSPORT`: `photon` o `local`. Vacío: `photon` si hay App ID, si no `local`.

## Cómo correrlo

```bash
# 1) Árbitro (en spike/)
npm run serve:photon
#   Photon (us) · sala nueva, código: ENVQWJ · salas abiertas: 1
#   Siempre deja una sala libre: cuando una se llena abre otra con un código nuevo.
#   Al terminar cada partida guarda bench-out/intentos-<código>.csv.

# 2) Cliente (en cliente/)
npm install
npm run dev            # http://localhost:5173
```

Cada jugador abre la página, escribe el código de 6 caracteres y su alias. Al terminar, "Volver a jugar" regresa a Entrar con el alias puesto; se usa el código de la sala libre que muestra la consola.

Si se pierde la conexión durante la partida, el cliente vuelve solo a la misma sala con el mismo alias cada 2 s; el árbitro guarda el asiento 30 s.

## Probar desde un celular

Photon funciona entre redes distintas (el celular puede estar en datos móviles). Lo que necesita estar en la misma red es la página: Vite debe escuchar en la LAN.

```bash
npm run dev -- --host     # muestra la URL Network, p. ej. http://192.168.1.20:5173
```

Abre esa URL en el celular (misma Wi-Fi que el computador). Para jugar desde otra red, publica el build (`npm run build`, carpeta `dist/`) en cualquier hosting estático. El modo `local` no sirve fuera de la LAN porque el relé está en el puerto 8787 del computador.

## Comandos

```bash
npm test            # lógica de pantalla y cliente contra el árbitro en memoria
npx tsc --noEmit
npm run build       # el App ID queda dentro de dist/: no versionar dist/
```
