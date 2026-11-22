# Changelog — Tacometro Gauge (`PBI_CV_TACOMETRO_GAUGE`)

Formato basado en *Keep a Changelog*. La versión del visual la define `pbiviz.json`
(`visual.version`, 4 partes exigidas por `powerbi-visuals-tools` 7.2.1).

## [0.2.0.0] — 2026-11-22 (pre-1.0, sin validación en Power BI)

### Versión

- `pbiviz.json`: `0.1.0-beta.1` → **`0.2.0.0`**; `package.json` y la raíz de
  `package-lock.json`: `1.0.0.0` (valor de plantilla) → **`0.2.0.0`**, ahora sincronizados.
- Es un salto *minor* sobre la versión autoritativa del visual (`pbiviz.json`) porque añade
  funciones (roles, ajustes y capacidades) sin quitar ninguna. Se conserva `0.x` a propósito:
  falta validar la experiencia en Power BI (ver «Pendiente»), así que no se declara 1.0.
- 4 partes y sin ceros a la izquierda: cumple `VisualVersion` y `VisualVersionLeadingZeros`.
  `0.2.0.0` es mayor que `0.1.0-beta.1` parte por parte (`0.2` > `0.1`).
- Artefacto: `dist/PBI_CV_TACOMETRO_GAUGE.0.2.0.0.pbiviz` (el nombre sale de GUID + versión).
  El artefacto anterior `dist/PBI_CV_TACOMETRO_GAUGE.0.1.0-beta.1.pbiviz` se conserva sin cambios.

### Estado de los puntos autorizados

| # | Punto | Estado | Detalle |
|---|---|---|---|
| A1 | `scales.ts` no aparecía en la cobertura | **Aplicado** | Causa: Vitest 5 activa `skipFull` en el reporter `text` cuando detecta un agente o una IA de CI, y oculta los archivos al 100 %. Se fijó `skipFull: false` en `vitest.config.mts`. La cobertura ahora incluye también todos los módulos nuevos. Evidencia: `reports/a1-coverage-skipfull-evidence-2026-11-22.txt`. |
| A2 | `lodash.isequal@4.5.0` deprecado | **Pendiente (externo)** | Es una dependencia **transitiva de desarrollo** y no se puede controlar desde aquí. La declara `powerbi-visuals-tools@7.2.1` con la versión exacta `"lodash.isequal": "4.5.0"` (`npm ls lodash.isequal` → `powerbi-visuals-tools@7.2.1 └── lodash.isequal@4.5.0`). La 7.2.1 es la última versión publicada (`npm view powerbi-visuals-tools version`). No hay `import`/`require` del paquete en `powerbi-visuals-tools/lib` ni en `bin`: está declarado pero sin uso. No entra en el bundle del visual. Sólo produce un aviso de deprecación: `npm audit` no reporta vulnerabilidades por él. No se aplicó un `override` hacia un sustituto porque sería un parche no estándar sobre una herramienta de Microsoft. Se resolverá cuando el upstream lo retire. |
| A3 | Tooltips, alto contraste y teclado (+ opcionales) | **Aplicado** (validación en Power BI pendiente) | Tooltips: rol `tooltips` y `tooltipService` con valor, escala, marcadores, semáforo y campos extra. Alto contraste: `colorPalette.isHighContrast` → sólo foreground/background. Teclado: `supportsKeyboardFocus`, SVG `tabIndex=0`, `role="img"`, `aria-label`, tooltip al recibir foco y Shift+F10/ContextMenu. También se aplicaron Context Menu (`selectionManager.showContextMenu`), Allow Interactions (`hostCapabilities.allowInteractions`), Rendering Events (`eventService` started/finished/failed) y Landing Page (`supportsLandingPage` + `supportsEmptyDataView`). |
| A4 | Avisos `Sourcemap for … points to missing source files` | **Pendiente (externo, no corregible aquí)** | `powerbi-visuals-utils-formattingmodel@6.0.4` publica `lib/*.js.map` con `"sources":["../src/…ts"]`, pero el paquete npm no incluye `src/` (contenido: `CHANGELOG.md`, `lib`, `LICENSE`, `node_modules`, `package.json`, `README.md`). Vite/Vitest avisa al no encontrar los fuentes. Aparece al transformar el módulo sin caché: 4 líneas con `npx vitest run --fsModuleCache=false` (`reports/final-2026-11-22/a4-sourcemap-no-cache.txt`). Con la caché `node_modules/.vitest-cache` ya poblada no se repite. No afecta los resultados ni el `.pbiviz`. Actualizar no lo resuelve: los tarballs npm 6.2.2 y 7.1.0 (`npm pack`, inspeccionados el 2026-11-22) tampoco traen `src/` y sus `lib/index.js.map` también apuntan a `"../src/index.ts"`. Evidencia: `reports/a4-sourcemap-repro-2026-11-22.txt`. |
| B1 | Color de semáforo desde los datos | **Aplicado** | Rol `semaphore`. `resolveSemaphoreColor` acepta Verde/Amarillo/Rojo, Green/Yellow/Red, clases `text-success`/`text-warning`/`text-danger`/`text-yellow-custom`, neutro (`Sin semaforizar`/`Gris`/`text-muted`/`text-secondary` → `#ADB5BD`) y `#hex`. Si reconoce el valor, sustituye el color calculado por umbrales. Si no lo reconoce, se usa el cálculo. Con `showRanges=true` (predeterminado) el color se muestra en un arco de progreso delgado (`semaphore-indicator`) por dentro de las bandas; ver «Corregido tras la revisión independiente». |
| B2 | «Menor es mejor» | **Aplicado** | Ajuste `ranges.lowerIsBetter`, que invierte el color de desempeño y el orden de las bandas. |
| B3 | Marcadores distintos | **Aplicado** | Roles `targetWithMargin` (Meta con margen), `programmed` (Programado) y `previousMonth` (Real mes anterior), con colores configurables en la tarjeta «Marcadores». Se conserva el rol `target` original. |
| B4 | GUID / copias duplicadas | **Aplicado (documentación)** / pendiente para las copias externas | El repositorio oficial es `Dexter/React/powerbi-visual-tacometro` (decisión D8 de TableroMaestro). Hay **dos copias externas con el mismo GUID `PBI_CV_TACOMETRO_GAUGE`**: `/home/equihua/Projects/PowerBI/Objetos Visuales/tacometroGauge` y `/home/equihua/Projects/PowerBI/Objetos Visuales/tacometroGauge_basic`, ambas con `0.1.0-beta.1`. **No se modificaron** porque no había autorización. Ver README, «Copia oficial y GUID». |

### Corregido en el cierre (TDD, RED→GREEN en `reports/tdd-2026-11-22.txt`, sección «CONTINUACIÓN»)

- El tooltip y el `aria-label` (A3) mostraban el valor **recortado** a [mín, máx] y no el valor
  real (p. ej. real 150 con máximo 100 → «100»). Se añadió `GaugeData.actualValue` (sin recortar).
  El dibujo sigue recortado; tooltip y accesibilidad muestran el valor real.

### Corregido tras la revisión independiente (TDD, RED→GREEN en `reports/tdd-2026-11-22.txt`, sección «CONTINUACIÓN 2»)

- **B-1:** con `showRanges=true` (predeterminado) el semáforo de la fuente no se veía: el color sólo se aplicaba al
  `PerformanceArc`, que se dibuja únicamente con los rangos ocultos. Ahora, si el semáforo se reconoce, se dibuja un
  arco de progreso delgado (`semaphore-indicator`, 30 % del grosor y mínimo 3 px, por dentro de la banda) con el color de
  desempeño. Las bandas de umbrales no cambian. Sin semáforo reconocido no hay indicador, así que la vista
  predeterminada sin semáforo queda igual. La precedencia alto contraste > semáforo > umbrales se mantiene: en alto
  contraste el indicador usa el foreground.
- **B-2:** la evidencia del artefacto (`reports/final-2026-11-22/`) se regeneró tras el último `npm run package`. El
  hash anterior (`4140e209…`) y el que QA obtuvo al reempaquetar (`a454aff6…`) ya no corresponden al `.pbiviz` actual.
  `pbiviz package` no es determinista (el zip incluye la fecha de empaquetado), así que cada reempaquetado cambia el hash.
- Evaluado y sin cambio: el rol `semaphore` sigue siendo *Measure*, porque una medida DAX de texto ya llega como texto.
  Pasarlo a *Grouping* (categoría) cambiaría el `dataViewMapping` y la forma de agregar, y pide validación en Power BI.
  `TargetMarker.tsx` (sin uso) no se borró: es un archivo no versionado y su eliminación no se podría revertir con git.

### Funciones opcionales evaluadas y no implementadas

| Función | Decisión | Motivo |
|---|---|---|
| Color Palette | No se usan colores de la paleta del tema para los datos | Los colores son semánticos (rojo/ámbar/verde, o los de la fuente según B1) y se configuran en el panel. La paleta del host sólo se lee para alto contraste. Nota: `pbiviz` ya no muestra el aviso porque su verificación sólo busca la cadena `.colorPalette` en el bundle; ese uso es real, pero se limita al alto contraste. |
| Highlight Data | No | El visual muestra un único valor agregado, sin categorías ni puntos. No hay subconjunto que resaltar y declarar `supportsHighlight` sería una declaración falsa. |
| Selection Across Visuals | No | No hay puntos de datos seleccionables (sin rol de categoría), así que `supportsMultiVisualSelection` no tendría efecto. |
| Localizations | No | La interfaz está en español (es-MX) y es la única configuración regional del proyecto. Localizar requiere `stringResources/*.resjson`, `localizationManager` y `displayNameKey` en capabilities. Se deja como mejora futura. |

### Pendiente / riesgos

- **No se probó en Power BI** (Desktop/Service): no hubo importación ni publicación.
  El render en el host, tooltips, menú contextual, foco/teclado, alto contraste, landing page,
  rendering events, el aspecto de los marcadores y el semáforo con datos reales están validados sólo con pruebas unitarias.
  **No es apto para producción** hasta completar esa validación.
- Brechas de `TACOMETRO-mejoras.md` fuera de este alcance: valor fuera de rango sin indicador
  visual (la etiqueta central y el arco siguen recortados), small multiples, formato regional/cadena de formato completa.
- `src/components/TargetMarker.tsx` (línea base) ya no se usa; lo reemplaza `GaugeMarker.tsx`. Se conservó para no alterar la línea base.
- Importar la versión 0.2.0.0 en un informe que ya contiene una de las copias externas (mismo GUID) la reemplaza.
