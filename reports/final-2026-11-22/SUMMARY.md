# Verificación final — 2026-11-22 (Developer, cierre tras revisión independiente)

Repositorio: `/home/equihua/Projects/PowerBI/Dexter/React/powerbi-visual-tacometro`, commit base `b7334d3`.
No hubo commits ni push, y no hubo interacción con Power BI ni GitHub (ver `git-state.txt`). Entorno: Node v24.21.0 y npm 11.19.0 (`nvm use`, `.nvmrc`).
Todos los archivos de este directorio se regeneraron el 2026-11-22 entre 07:57 y 07:58 (-06:00), después de corregir B-1.

## Comandos (salida completa en este directorio; cada archivo termina con `EXIT=<código>`)

| Comando | Resultado | Evidencia |
|---|---|---|
| `npm run typecheck:test` | EXIT=0 | `npm-run-typecheck-test.txt` |
| `npm run lint` | EXIT=0 | `npm-run-lint.txt` |
| `npm test` | EXIT=0; 10 archivos, **120/120** pruebas | `npm-run-test.txt` |
| `npm run test:coverage` | EXIT=0 | `npm-run-test-coverage.txt` |
| `npm audit` | EXIT=0, `found 0 vulnerabilities` | `npm-audit.txt` |
| `npx vitest run --fsModuleCache=false` | EXIT=0; 120/120; 4 avisos de sourcemap (A4) | `a4-sourcemap-no-cache.txt` |
| `npx vitest run --coverage --coverage.include='src/**'` | EXIT=0 (informativo) | `coverage-all-src-informativo.txt` |
| `npx pbiviz package --verbose` | EXIT=0 (lista de funciones) | `pbiviz-package-verbose.txt` |
| `npm run package` (**último empaquetado**) | EXIT=0, «Build completed successfully» | `npm-run-package.txt` |

## Cobertura (`vitest.config.mts`, v8)

| Métrica | Línea base histórica (3 módulos) | Final (8 módulos, incluidos todos los nuevos) |
|---|---|---|
| Statements | 97.14 % (102/105) | **99.09 % (219/221)** |
| Branches | 88.88 % (72/81) | **92.51 % (136/147)** |
| Functions | 95.65 % (22/23) | **98.18 % (54/55)** |
| Lines | 96.93 % (95/98) | **99.03 % (205/207)** |

Módulos medidos: `scales.ts` (visible, 100 %), `arcUtils.ts`, `semaphore.ts`, `markers.ts`, `GaugeMarker.tsx`,
`highContrast.ts`, `tooltips.ts` y `visual.ts`.
Como referencia, sobre **todo** `src/**` la cobertura es 82.98 % statements / 82.92 % branches / 80.24 % functions / 82.57 % lines
(`coverage-all-src-informativo.txt`). Lo que falta cubrir son las animaciones d3 en `useEffect` de `PerformanceArc` y
`ValueMarker`, que no se ejecutan en el render estático sin DOM, y `TargetMarker.tsx`, sin uso desde la línea base.

## Artefacto (único hash válido)

- Ruta: `dist/PBI_CV_TACOMETRO_GAUGE.0.2.0.0.pbiviz` (92 231 bytes, mtime 2026-11-22 07:57:49 -0600)
- **SHA-256: `bcbc33a3d7f2766898e1546804e1c169bcee4c7fdc0d8a0aeb9a1834456324eb`** (`sha256sum` sobre el archivo actual,
  tomado después del último `npm run package`; `artifact-verification.txt`).
- Hashes anteriores que **ya no son válidos**: `4140e209…6bd4` (cierre previo) y `a454aff6…390a6` (reempaquetado de QA,
  confirmado con `sha256sum` antes de este reempaquetado, en `artifact-before-rebuild.txt`). `pbiviz package` **no es
  determinista**: el zip guarda la hora de empaquetado, así que cada ejecución produce otro hash aunque el código no
  cambie. Si alguien vuelve a empaquetar, debe recalcular el hash y actualizar esta sección.
- Manifiesto interno: `package.json.version = 0.2.0.0`, `visual.guid = PBI_CV_TACOMETRO_GAUGE`, `apiVersion 5.3.0`,
  11 roles (todos *Measure*, incluidos `semaphore`, `targetWithMargin`, `programmed`, `previousMonth` y `tooltips`),
  `supportsKeyboardFocus`, `supportsLandingPage` y `supportsEmptyDataView` en true. El bundle contiene `semaphore-indicator`.
- Avisos restantes de `pbiviz`: Highlight Data, Localizations y Selection Across Visuals (justificados en `CHANGELOG.md`),
  «Using recommended eslint config» y un `DeprecationWarning DEP0187` (`fs.existsSync`) que emite `powerbi-visuals-tools`
  con Node 24. Ninguno bloquea el empaquetado.

## TDD de este cierre

- Defecto anterior (tooltip/`aria-label` con valor recortado): RED → GREEN en `../tdd-2026-11-22.txt`, «CONTINUACIÓN».
- **B-1** (semáforo invisible con `showRanges=true`): 4 pruebas nuevas en `tests/gauge.test.ts`. RED EXIT=1 (fallan las 2
  positivas; las 2 guardas de no regresión pasan) → GREEN EXIT=0 → regresión completa 120/120, en `../tdd-2026-11-22.txt`,
  «CONTINUACIÓN 2». El registro anterior se conserva íntegro.

## Pendiente real

- Validación en Power BI Desktop/Service: no se hizo. Falta comprobar en el host cómo se ve el `semaphore-indicator`, y no se declara listo para producción.
- A2 (`lodash.isequal`, transitivo de `powerbi-visuals-tools@7.2.1`) y A4 (sourcemaps de `powerbi-visuals-utils-formattingmodel`) son externos.
- Hay dos copias externas con el mismo GUID, sin modificar: `Objetos Visuales/tacometroGauge` y `Objetos Visuales/tacometroGauge_basic`.
- El autor del manifiesto (`Power BI Developer` / `developer@powerbi.com`) y `supportUrl` son valores de plantilla. No se cambiaron porque no hay datos autorizados.
