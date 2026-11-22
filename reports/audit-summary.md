# Resumen de remediación de `npm audit`

## Resultado

Se ejecutó `npm audit fix` **sin `--force`** y después se fijaron dos dependencias transitivas vulnerables mediante `overrides`. No se degradó `powerbi-visuals-tools`: permanece en **7.2.1**. La auditoría final reporta **0 vulnerabilidades**.

| Estado | Info | Baja | Moderada | Alta | Crítica | Total |
|---|---:|---:|---:|---:|---:|---:|
| Antes | 0 | 0 | 12 | 5 | 0 | 17 |
| Después | 0 | 0 | 0 | 0 | 0 | 0 |

## Cambios

`npm audit fix` actualizó `package-lock.json` dentro de los rangos declarados. Entre los cambios directos del árbol quedaron `@typescript-eslint/*` 8.50.0 → 8.72.1, `js-yaml` 4.1.1 → 4.3.2, `picomatch` 4.0.3 → 4.0.7 y otros parches transitivos.

Diff funcional de `package.json`:

```diff
   "devDependencies": {
     "@typescript-eslint/eslint-plugin": "^8.8.0",
     "eslint": "^9.11.1",
     "eslint-plugin-powerbi-visuals": "^1.0.0",
     "powerbi-visuals-tools": "7.2.1",
     "typescript": "5.5.4"
+  },
+  "overrides": {
+    "@typescript-eslint/typescript-estree": {
+      "minimatch": "11.0.1"
+    },
+    "sockjs": {
+      "uuid": "11.1.1"
+    }
   }
 }
```

No se usó `npm audit fix --force`. Su propuesta era incompatible con el objetivo: bajar `powerbi-visuals-tools` de 7.2.1 a 5.3.0 y bajar paquetes de ESLint/TypeScript ESLint.

## Vulnerabilidades que quedaron después de `npm audit fix` y su tratamiento

Todas eran de **build-time** (lint o servidor de desarrollo); ninguna cadena llega a las dependencias de runtime/bundle `d3*`, `react*` o `powerbi-visuals-utils-*`.

| Paquete reportado | Severidad | Cadena de dependencia | Tratamiento / fix |
|---|---|---|---|
| `minimatch` | Moderada | `@typescript-eslint/eslint-plugin` → `@typescript-eslint/parser` → `@typescript-eslint/typescript-estree` → `minimatch@10.2.6` | Override acotado a `@typescript-eslint/typescript-estree`: `minimatch@11.0.1` (primera versión parcheada del aviso GHSA-g3hv-75wg-m249; ver ajuste post-revisión). |
| `@typescript-eslint/typescript-estree` | Moderada | `@typescript-eslint/*` → `typescript-estree` → `minimatch` | Se eliminó al corregir `minimatch`. |
| `@typescript-eslint/parser` | Moderada | dependencia directa/transitiva de lint y de `eslint-plugin-powerbi-visuals`; llega a `typescript-estree` | Se eliminó al corregir `minimatch`. |
| `@typescript-eslint/type-utils` | Moderada | `@typescript-eslint/eslint-plugin` → `type-utils` → `typescript-estree` | Se eliminó al corregir `minimatch`. |
| `@typescript-eslint/utils` | Moderada | `@typescript-eslint/eslint-plugin` → `utils` → `typescript-estree` | Se eliminó al corregir `minimatch`. |
| `@typescript-eslint/eslint-plugin` | Moderada | dependencia directa de lint → componentes `@typescript-eslint/*` → `minimatch` | Se eliminó al corregir `minimatch`; no se aceptó el downgrade sugerido a 6.15.0. |
| `eslint-plugin-powerbi-visuals` | Moderada | dependencia directa de lint → `@typescript-eslint/parser` → `typescript-estree` → `minimatch` | Se eliminó al corregir `minimatch`; no se aceptó el downgrade sugerido a 0.8.1. |
| `uuid` | Moderada | `powerbi-visuals-tools@7.2.1` → `webpack-dev-server@5.2.7` → `sockjs@0.3.24` → `uuid@8.3.2` | Override acotado a `sockjs`: `uuid@11.1.1` (parche del aviso GHSA-w5hq-g745-h8pq). |
| `sockjs` | Moderada | `powerbi-visuals-tools` → `webpack-dev-server` → `sockjs` → `uuid` | Se eliminó al corregir `uuid`. |
| `webpack-dev-server` | Moderada | `powerbi-visuals-tools` → `webpack-dev-server` → `sockjs` → `uuid` | Se eliminó al corregir `uuid`. |
| `powerbi-visuals-tools` | Moderada | dependencia directa de build → cadenas de ESLint y `webpack-dev-server` | Permanece en 7.2.1; los avisos derivados desaparecieron mediante los overrides. |

## Ajuste post-revisión: override de `minimatch` 11.0.5 → 11.0.1

- Motivo: `minimatch@11.0.5` declara `engines.node: "20 || >=22"`; `minimatch@11.0.1` declara `"18 || 20 || >=22"` (`npm view minimatch@11.0.1 engines`).
- Cobertura del aviso: GHSA-g3hv-75wg-m249 (API de GitHub Advisories) afecta `minimatch >= 7.0.0, < 11.0.1`, primera versión parcheada `11.0.1`. Es la mínima que lo cubre.
- Tras `npm install`: `npm ls minimatch` → `@typescript-eslint/typescript-estree@8.72.1 └── minimatch@11.0.1 overridden`; `npm audit` → `found 0 vulnerabilities` (exit 0).
- Salvedad de engines: la dependencia transitiva `brace-expansion@5.0.12` (resuelta por `minimatch@11.0.1` vía `^5.0.12`) declara `"20 || >=22"`. No se forzó una versión anterior porque reintroduciría avisos de `brace-expansion`. Además, el proyecto ya requiere Node ≥ 20.19 (`powerbi-visuals-tools@7.2.1`) y ≥ 22.12 para pruebas (`vitest@5.1.0`), así que Node 18 no es un objetivo soportado de facto.

## Vulnerabilidades residuales

**Ninguna.** `npm audit` y `npm audit --json` terminan con exit code 0 y conteo total 0.

Riesgo de mantenimiento: los dos overrides saltan el rango mayor declarado por sus paquetes padre. El riesgo es sólo de compatibilidad de herramientas de desarrollo y quedó mitigado con instalación limpia (`npm ci`), TypeScript, lint y empaquetado exitosos. Conviene retirar cada override cuando `@typescript-eslint/typescript-estree` y `sockjs` publiquen versiones que declaren directamente las ramas corregidas.

## Verificación final

| Validación | Exit code | Resultado |
|---|---:|---|
| `npm ci` | 0 | Lockfile reproducible e instalación limpia. |
| `npx tsc --noEmit` | 0 | Sin errores de TypeScript. |
| `npm run lint` | 0 | Sin errores de ESLint. |
| `npm run package` | 0 | Paquete generado con `powerbi-visuals-tools` 7.2.1. |
| `npm audit` | 0 | 0 vulnerabilidades. |
| `npm audit --json` | 0 | 0 vulnerabilidades. |

Artefacto regenerado: `dist/PBI_CV_TACOMETRO_GAUGE.0.1.0-beta.1.pbiviz`, 89,248 bytes, mtime `2026-11-09 10:01:48.719325289 -0600`, SHA-256 `34d561699d42a88d9b4a99fcdbb61763a3a28ad9ee17f76ca51e2434d0e2df59`.

## Evidencia y reversión

- Auditoría inicial: `reports/audit-before.txt`, `reports/audit-before.json`.
- Auditoría final: `reports/audit-after.txt`, `reports/audit-after.json`.
- Cadenas de dependencias: `reports/dependency-paths.txt`.
- Instalación limpia: `reports/npm-ci.txt`.
- Verificaciones y regeneración del artefacto: `reports/verification-final.txt`.
- Verificación inmediatamente después de `npm audit fix`: `reports/verification-after-audit-fix.txt`.
- Respaldo previo: `/home/equihua/.hermes/profiles/orchestrator/cache/scratch/tacometro-audit-backup/package.json` y `package-lock.json`.

Para revertir únicamente esta tarea, restaurar ambos manifiestos desde ese respaldo y ejecutar `npm ci`. No se modificaron `capabilities.json`, `pbiviz.json`, `src/` ni `dev-harness/`.
