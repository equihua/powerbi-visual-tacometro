# Developer — compatibilidad px/% legado (Reviewer B2) + guards B4 (angle/rango) — 2026-11-24

> Nota de traspaso. Escrito en `reports/` porque el MCP `bitacora`/`bitacora_developer` no estaba
> disponible en esta sesión (ejecución delegada sin esas herramientas en el toolset) — bloqueo
> reportado al final.

## Objetivo

Corregir, sobre el trabajo en curso (no comiteado) de la tarjeta de formato «Gráfico de tendencia»
0.5.0.0, el hallazgo de Reviewer B2: las 4 propiedades `posX`/`posY`/`width`/`height` eran **píxeles**
relativos al centro del medidor en 0.4.0.0 (ya publicado/comiteado) y el WIP 0.5.0.0 reutilizaba los
**mismos IDs** con significado nuevo (**%** del viewport) — cualquier reporte guardado en 0.4.0.0 con
esas propiedades fijadas quedaría reinterpretado en silencio. Además, Reviewer B4: guard de
no-finitud para `angle` y validación de rango 0-100 para las propiedades de posición/tamaño.

## Acciones

1. **Rename de las propiedades nuevas** (capabilities.json + settings.ts): `posX→posXPct`,
   `posY→posYPct`, `width→widthPct`, `height→heightPct`. Mismo displayName/descripcion/`PERCENT_BOUNDS`
   (0-100, sufijo %), sólo cambia el nombre de propiedad.
2. **Propiedades legadas preservadas intactas** en `capabilities.json` (mismo nombre `posX`/`posY`/
   `width`/`height`, `type.numeric`), movidas al final del objeto `trend` y marcadas obsoletas en
   `displayName`/`description` (mencionan 0.4.0.0 y la propiedad `*Pct` sustituta). **Sin** slice en
   `settings.ts`: no aparecen en el panel de formato y nada en el código las lee — Power BI las sigue
   reconociendo (no las descarta al re-guardar el reporte) pero quedan huérfanas, sólo para inventario/
   migración manual futura.
3. **`visual.ts`**: `extractSettings()` ahora lee `trendCard.posXPct/posYPct/widthPct/heightPct` (no
   los legados) y aplica dos guards nuevos:
   - `finitePercent(value)`: `undefined` si no es finito o está fuera de `[0,100]` (cae al cálculo
     automático de ese eje).
   - `finiteAngle(value)`: `0` si `angle` no es finito (NaN/Infinity) — evita propagar NaN a
     `trendTransformCoefficients` (Math.cos/Math.sin).
   `TREND_AUTO_SLICE_UIDS`/`applyEffectiveDisplayDefaults` actualizados a los uids `trend-posXPct`, etc.
4. **`types.ts`**: comentarios actualizados (los campos internos `GaugeSettings.trendPosX/Y/Width/Height`
   NO se renombraron — son un detalle interno, nunca fueron el contrato público; sólo se documentó el
   origen correcto y el saneo).
5. **Tests (TDD RED→GREEN)**: `tests/trendCard.test.ts` y `tests/visualFormattingDefaults.test.ts`
   actualizados a los nuevos nombres, más pruebas nuevas:
   - capabilities.json declara exactamente las 4 legadas (obsoletas, numéricas) + las 4 `*Pct` (activas).
   - un dataView con `trend.posX/posY/width/height` (simulando 0.4.0.0 guardado) **no** afecta
     `GaugeSettings` (quedan `undefined`, cálculo automático) — "ignorado, no reinterpretado".
   - legado + nuevo en el mismo dataView: sólo el nuevo (`*Pct`) tiene efecto.
   - `*Pct` fuera de `[0,100]` o no finito (NaN/±Infinity) → `undefined`; los límites 0 y 100 sí son
     válidos (rango cerrado).
   - `angle` no finito → `0`; `angle` normal pasa intacto.

## Evidencia

- `npx tsc -p tsconfig.test.json` y `npx tsc -p tsconfig.json --noEmit`: sin errores.
- `npx eslint .`: sin hallazgos.
- `npx vitest run --coverage`: **436/436 tests verdes** (427 base + 9 nuevos), cobertura
  Statements 100%, Branches **96.92%** (504/520 — idéntica proporción a la línea base 505/521),
  Functions 100%, Lines 100%. Ninguna rama nueva quedó sin cubrir (confirmado leyendo
  `coverage-final.json`: las únicas ramas no cubiertas son las mismas pre-existentes de siempre,
  `extractValue`/`parseFormat`, sin relación con este cambio).

## Riesgos / seguimiento

- No se implementó una migración automática px→% de los valores legados (fuera de alcance de esta
  tarea; coincide con la decisión ya documentada por la sesión anterior). Quien necesite recuperar un
  valor fijado en 0.4.0.0 debe volver a ajustarlo manualmente con las nuevas propiedades `*Pct` — el
  valor viejo queda disponible para inventario (Analyze in Excel / export de definición de reporte /
  API, no desde el panel).
- No se tocó versión, CHANGELOG ni se hizo commit/push (fuera de alcance de esta tarea, según
  instrucción explícita — "next release task").
- **Bloqueo de herramienta**: el MCP `bitacora`/`bitacora_developer` no estaba disponible en esta
  sesión delegada; esta nota quedó en `reports/` en vez de `60_Bitacoras/Hermes/Developer/`. Si el
  flujo requiere la bitácora en Obsidian, Orchestrator/Default deben volver a ejecutar el traspaso con
  ese MCP habilitado, o trasladar este contenido manualmente.

## Siguiente responsable

Reviewer / QA: validar que el panel de formato real (pbiviz start / Power BI Desktop) muestra
únicamente `Posición X/Y (%)`/`Ancho/Alto (%)` (no las legadas) y que un `.pbix` con `trend.posX`
guardado en 0.4.0.0 abre sin error y sin aplicar ese valor. Orchestrator: decidir si la migración
manual px→% amerita una tarea de release separada (version bump + CHANGELOG) antes de publicar 0.5.0.0.
