# Cómo contribuir a CircuitSync

## Ramas
- `main`: producción. Solo recibe merges desde `develop`; una etiqueta `v*` (p. ej. `v0.1.0`) despliega a producción.
- `develop`: integración. Cada merge despliega al entorno de pruebas.
- `feature/<descripcion-corta>`: una rama por tarea, creada desde `develop` (p. ej. `feature/despacho-explicito`).

## Títulos de commits y PR
Simples e identificativos, sin claves de seguimiento ni fechas. Ejemplo: «Despacho explícito y nivel/semilla en el servidor».

## Pull requests
1. Abre el PR contra `develop`.
2. El CI (ESLint, `tsc --noEmit`, Vitest en `spike/`) debe pasar.
3. El **otro integrante** revisa y aprueba el PR (1 aprobación) antes del merge. Nadie aprueba su propio PR.

## Antes de subir
Los mismos comandos que corre el CI:

```bash
cd spike
npm ci
npm run lint && npm run typecheck && npm test
```

No subas `.env` ni el App ID de Photon: van en `spike/.env` y `cliente/.env.local`, ignorados por git.
