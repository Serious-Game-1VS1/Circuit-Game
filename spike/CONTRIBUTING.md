# Cómo contribuir a CircuitSync

## Ramas
- `main`: producción. Solo recibe merges desde `develop`; una etiqueta `v*` (p. ej. `v0.1.0`) despliega a producción.
- `develop`: integración. Cada merge despliega al entorno de pruebas.
- `feature/SCRUM-N-descripcion-corta`: una rama por tarea de Jira, creada desde `develop`.

## Pull requests
1. Abre el PR contra `develop` con la clave de Jira al inicio del título: `SCRUM-N: descripción` (así Jira lo vincula).
2. El CI (ESLint, `tsc --noEmit`, Vitest) debe pasar.
3. El **otro integrante** revisa y aprueba el PR antes del merge. Nadie aprueba su propio PR.

## Antes de subir
```bash
cd spike
npm ci
npm run lint && npm run typecheck && npm test
```
