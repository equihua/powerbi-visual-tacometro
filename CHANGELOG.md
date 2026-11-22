# Changelog — Tacometro Gauge (`PBI_CV_TACOMETRO_GAUGE`)

Formato basado en *Keep a Changelog*. La versión del visual la define `pbiviz.json`
(`visual.version`, 4 partes exigidas por `powerbi-visuals-tools` 7.2.1).

## [0.3.2.0] — 2026-11-22 (valor «Real & Mes anterior» + pie más pegado al medidor, pre-1.0, sin validación en Power BI)

### Versión

- `pbiviz.json`, `package.json` y la raíz de `package-lock.json`: `0.3.1.0` → **`0.3.2.0`** (`tests/version.test.ts`).
- Sin cambios en `capabilities.json` (roles, incluido `previousMonth`, ya existían): los informes no necesitan volver a
  enlazar campos. Se incrementa el tercer dígito (parche visible y compatible).
- Artefacto local: `dist/PBI_CV_TACOMETRO_GAUGE.0.3.2.0.pbiviz` (SHA-256 en
  `reports/final-0.3.2.0-2026-11-22/artifact-sha256.txt`, calculado tras el último `npm run package`; no determinista).

### Añadido

- **Valor de «Real & Mes anterior» (3.ª columna del pie, `GaugeFooter.tsx`).** Muestra **Real − Real mes anterior**
  (rol opcional «Real mes anterior», `GaugeData.previousMonth`, de la fila del periodo actual), con el **mismo
  formateador y signo `+` explícito** que «Dif. Real & Prog.». Corrección de revisión: el Real es el **Real actual sin
  recortar** (`GaugeData.actualValue`; p. ej. 150 con máximo 120 → 150 − 100 = +50) y el color es **semántico por
  favorabilidad de la diferencia** (`comparisonColor` en `scales.ts`): **verde** (`highColor`) si es favorable, **rojo**
  (`lowColor`) si es desfavorable, neutro (`#252423`) si es 0; con «menor es mejor» bajar es lo favorable; en alto
  contraste, foreground. Ya no usa el color de zona del medidor. «Dif. Real & Prog.» no cambia (Real recortado, color
  de estado). No depende de Programado.
- **Opcional, igual que los demás roles opcionales:** sin «Real mes anterior» (o con valor no numérico/no finito) la
  columna queda **sólo con la etiqueta**, como en 0.3.1.0. La columna sigue apareciendo sólo con sparkline.

### Cambiado (layout)

- **Menos hueco entre el medidor y el pie** (`computeGaugeFrame` en `layout.ts`, usado por `Gauge.tsx`). Con pie, el
  medidor ya no se centra en una caja cuadrada: se mide el contenido real bajo el centro (banda en los ángulos dibujados +
  `MARKER_OVERHANG` = 11 px de marcadores, y la sparkline interior) y se elige el radio más grande que cabe (acotado por el
  ancho), con el contenido terminando a `FOOTER_GAP` = 4 px del pie y el arco sin salirse por arriba. El dibujo del medidor
  (ángulos, colores, grosor, marcadores, sparkline) es el mismo; sólo cambian radio y centro. Con ángulos que usan la mitad
  inferior (p. ej. círculo completo) el radio se reduce lo necesario para que los marcadores no invadan el pie. Con
  arcos que no pasan por las 12 en punto (p. ej. invertidos) el número central (`fontSize`) también limita, para que no
  se salga por arriba en tarjetas anchas.
- Hueco medido en el arnés (lo más bajo del medidor/sparkline → lo más alto del texto del pie, ángulos por defecto
  -120°..60°): **14.3 px** en 300x300, 480x300 y 220x200 (0.3.1.0, por geometría: ≈ 71.6 / 71.6 / 47.6 px).
- El pie sigue anclado al borde inferior (`y = alto − 40`) y sin cambios internos. Sin serie mensual (sin pie) el
  encuadre y el markup siguen idénticos byte a byte a 0.2.0.0.

### Pruebas ajustadas (coordenadas, no comportamiento)

- `tests/gaugeTrend.test.ts`: centro y ranura de la sparkline a 300x300 pasan de `(150, 130)` / `(67.13, 141.05)` a
  `(150, 177.7)` / `(52.13, 190.75)`; «mismo dibujo» ahora compara con el 0.2.0.0 de 300x300 (mismo radio, sólo cambia el
  centro); las pruebas de puntos dentro del círculo y de pie anclado leen el encuadre de `computeGaugeFrame`.
- `dev-harness/scripts/verify-dom.mjs`: nuevos `footerPrev`/`footerPrevFill`/`footerGapPx` (0–16 px); centro y radio
  interior leídos del DOM. `dev-harness/src/main.ts`: la serie POA incluye «Real mes anterior» (Real del mes previo).

### Verificación

- TDD: evidencias RED/GREEN por ciclo en `reports/final-0.3.2.0-2026-11-22/red-*.txt` / `green-*.txt`.
- `npm run lint` (exit 0), `npm run typecheck:test` (exit 0), `npm run test:coverage`: **220 pruebas** en 20 archivos
  (antes 204), cobertura Stmts 99.73 % · Branch 95.72 % · Funcs 99.00 % · Lines 99.71 % (0.3.1.0: 99.72 / 95.52 / 98.97 /
  99.69). `npm run package` (exit 0).
- Arnés: `verify-dom.mjs` 13 escenarios, 0 fallos (s6/s8/s9/s10/s11: «Real & Mes anterior» = -1.93 / -1.93 / +3.70;
  hueco 14.3 px; puntos dentro del círculo interior; etiquetas sin solaparse). `screenshots.mjs` exit 0
  (`dev-harness/screenshots/s6-trend-footer.png`, `s10-trend-wide.png`, `s11-trend-compact.png`).
- Corrección de revisión (Real sin recortar + color por favorabilidad): `tests/previousMonthDelta.test.ts` (10 pruebas;
  RED 9 fallidas, GREEN 10/10), 230 pruebas en 21 archivos; arnés 17 escenarios, 0 fallos (s12 110 vs 118 → -8.00 rojo,
  s13 40 vs 20 → +20.00 verde, s14 «menor es mejor» → -8.00 verde, s15 150 vs 100 → +50.00 verde con Dif. Prog. +25.00).
  Evidencias en `reports/final-0.3.2.0-2026-11-22/review-fix/`.

### Pendiente / riesgos

- Color de «Real & Mes anterior»: desfavorable usa `lowColor` (rojo); no se usa ámbar. Diferencia 0 = color neutro.
- Validación en Power BI pendiente (no se importó el `.pbiviz`).

## [0.3.1.0] — 2026-11-22 (parche visual de layout, pre-1.0, sin validación en Power BI)

### Versión

- `pbiviz.json`, `package.json` y la raíz de `package-lock.json`: `0.3.0.0` → **`0.3.1.0`** (`tests/version.test.ts`).
- Parche **sólo de layout**: no cambian roles de `capabilities.json`, datos, cálculos, valores del pie, colores del arco
  ni semáforo. Se incrementa el tercer dígito (parche visual visible, compatible: los informes no necesitan
  volver a enlazar campos).
- Artefacto: `dist/PBI_CV_TACOMETRO_GAUGE.0.3.1.0.pbiviz` (corrección de etiqueta incluida). SHA-256 en
  `reports/final-0.3.1.0-label-2026-11-22/artifact-sha256.txt` (`sha256sum` tras el último `npm run package`).
  `pbiviz package` no es determinista: reempaquetar cambia el hash.

### Cambiado (layout, según boceto del usuario)

- **Sparkline dentro del medidor.** Ya no ocupa una franja debajo del medidor: se dibuja en la zona interior
  inferior del semicírculo, bajo el número central (`computeInnerTrendBox` en `layout.ts`): ancho 1.5× y alto 0.5× el
  radio interior de la banda, empezando a 0.1× bajo el centro. Sus esquinas quedan dentro del círculo interior, así
  que no invade la banda con ningún ángulo inicial/final. Si la caja mediría menos de 16 px no se dibuja (ni el
  descriptor del pie).
- **Medidor más grande, a todo el ancho.** Sólo el pie reserva alto (40 px). El medidor usa todo el ancho de la
  tarjeta y el alto restante (300x300: caja de 300x260 en lugar de 300x200); su dibujo es el mismo que el de
  0.2.0.0 en esa caja (lo compara `tests/gaugeTrend.test.ts`).
- **Pie anclado al borde inferior** en cualquier tamaño (`y = alto − 40`). Valores en un renglón y **todas** las
  etiquetas en otro (el descriptor sin valor ya no queda a otra altura). En tarjetas angostas las etiquetas
  reducen su fuente (9 → mín. 6 px, tamaño común) para no chocar ni salirse.
- **Etiqueta del boceto:** «Dif. Real vs Prog.» → **«Dif. Real & Prog.»** (mismo valor y color). «Programado» sin cambios.
- **Etiqueta del boceto (3.ª columna):** «Real / Prog. Mensual» → **«Real & Mes anterior»** (texto exacto del boceto).
  Sólo cambia el texto estático: sigue sin valor y aparece en los mismos casos (sólo con sparkline). El ajuste de
  fuente de etiquetas ahora trunca a 0.1 px en lugar de redondear (con 19 caracteres el redondeo desbordaba la
  columna 0.02 px a 220 px).

### Sin cambios / pendiente

- La tercera columna del pie muestra sólo la etiqueta «Real & Mes anterior», sin valor. El boceto muestra ahí un
  valor («0.30 pp»): es un cálculo nuevo (Real vs Real mes anterior) y queda fuera de este parche de layout;
  requiere decisión de negocio.
- Sin serie mensual (≥ 2 meses) el markup sigue siendo idéntico byte a byte al de 0.2.0.0.

### Verificación

- `npm run lint` (exit 0), `npm run typecheck:test` (exit 0), `npm run test:coverage`: 204 pruebas en 20 archivos
  (antes 194; se reescribieron sólo las de coordenadas exactas de `layout`/`gaugeTrend`/`gaugeFooter`), cobertura Stmts 99.72 % · Branch 95.52 % · Funcs 98.97 % · Lines 99.69 % (0.3.0.0:
  99.71 / 94.56 / 98.93 / 99.68). `npm run package` (exit 0).
- Arnés: `verify-dom.mjs` 13 escenarios, 0 fallos (nuevos `s10-trend-wide` 480x300 y `s11-trend-compact` 220x200;
  comprueba SVG a tamaño completo, puntos dentro del círculo interior y bajo el número, pie anclado, etiquetas alineadas
  y sin solaparse). `screenshots.mjs` exit 0.

## [0.3.0.0] — 2026-11-22 (pre-1.0, sin validación en Power BI)

### Versión

- `pbiviz.json`, `package.json` y la raíz de `package-lock.json`: `0.2.0.0` → **`0.3.0.0`**, sincronizados
  (lo comprueba `tests/version.test.ts`).
- Salto *minor*: añade un rol opcional y dos elementos visuales sin quitar nada. Se conserva `0.x` porque la
  validación en Power BI sigue pendiente (ver «Pendiente / riesgos»).
- Artefacto: `dist/PBI_CV_TACOMETRO_GAUGE.0.3.0.0.pbiviz`
  (SHA-256 `ffab407875d54e4d2769b5b2e94f438bbd25d662208673724a54f2cc210f8c02`, calculado con `sha256sum` **después** del último `npm run package`, que fue la última escritura del
  `.pbiviz`; `reports/final-0.3.0.0-2026-11-22/artifact-sha256.txt` y `artifact-verification.txt`). `pbiviz package` no es
  determinista, así que el hash cambia si se reempaqueta: los hashes de empaquetados anteriores (`a9ba68ff…`, `02a01f39…`,
  `fc8ec179…`, `6eb41004…`, `c4643674…`) no corresponden a este artefacto.
  `pbiviz package` vacía `dist/` (ignorado por git): los `.pbiviz` `0.1.0-beta.1` y `0.2.0.0` ya no están ahí y habría
  que regenerarlos desde sus commits si se necesitan.

### Añadido

- **Sparkline mensual visible (`TrendSparkline.tsx`, `trend.ts`).** Se dibuja debajo del medidor sólo cuando el rol
  «Periodo (mes)» trae meses. Muestra una línea de Real con un punto por mes, coloreado con datos **de ese mes**
  (alto contraste > «Semáforo por periodo» > «Semáforo» evaluado en ese mes > umbrales y rango de ese mes, respetando
  «menor es mejor»), y una línea discontinua de Programado. El punto del mes que muestra el medidor se resalta. Usa el mismo formato que la etiqueta central.
- **Pie inferior (`GaugeFooter.tsx`).** Muestra «Programado», «Dif. Real vs Prog.» (con signo `+` explícito si es
  positiva y el color de estado del medidor) y el descriptor «Real / Prog. Mensual». Aparece **sólo junto con la
  sparkline** (serie mensual de al menos 2 meses). Sin Programado no hay Programado ni diferencia.
  La diferencia usa el **mismo Real que muestra el centro** (recortado a [mín, máx]), así que «Dif.» = centro − Programado.
  El tooltip y el `aria-label` siguen mostrando el Real sin recortar, como en 0.2.0.0.
- **Reparto de alto (`layout.ts`, `computeGaugeLayout`).** El medidor queda arriba y debajo se reservan la sparkline
  (20 % del alto, entre 28 y 64 px) y el pie (40 px fijos), cuando aplican. Sin extras, el medidor conserva todo el alto,
  igual que en 0.2.0.0. Si lo reservado dejaría al medidor con menos de la mitad del alto, no se reserva nada y no se
  dibujan ni la sparkline ni el pie.

### Datos: rol `period` y `dataViewMapping`

- Nuevo rol **`period`** («Periodo (mes)», `kind: Grouping`), **opcional**, con condición `max: 1`.
- Roles opcionales añadidos en la segunda revisión: **`periodOrder`** («Orden del periodo», `Grouping`), **`currentPeriod`**
  («Periodo actual», `Measure`) y **`trendSemaphore`** («Semáforo por periodo», `Measure`), todos con `max: 1`.
- `dataViewMappings[0].categorical` declara `categories: { select: [period, periodOrder], dataReductionAlgorithm: { top: { count: 60 } } }`
  y `values.select` añade `currentPeriod` y `trendSemaphore` **al final** (los 11 roles previos conservan su orden).
  Con periodo enlazado, cada medida llega con **una fila por mes** (hasta 60 categorías) en lugar de un único agregado.
- `capabilities.sorting = { implicit: { clauses: [{ role: "period", direction: 1 }] } }`: contrato de orden del host
  (ascendente por el periodo, que en Power BI aplica «Ordenar por columna»; el usuario no puede cambiarlo).
- Con periodo, `visual.ts` arma la serie (`selectTrend` / `extractTrendPoint`) y el medidor, el pie, los marcadores, los
  umbrales, el semáforo y los campos del rol `tooltips` usan la fila del **periodo actual** (ver «Corregido tras la segunda
  revisión»).
- **Compatibilidad sin `period`:** no hay categorías, todas las lecturas usan la fila 0 y el resultado es el de 0.2.0.0
  (sin sparkline ni pie, **aunque haya `programmed`**, y con un solo mes tampoco). Lo cubren `tests/visualTrend.test.ts`
  («sin periodo enlazado no hay serie») y `tests/gaugeTrend.test.ts`, que compara byte a byte con la línea base
  `tests/fixtures/gaugeBaseline020.ts` (con y sin marcadores/Programado, 300x300). Escenario del arnés
  `s7-programmed-no-period`.
- Los demás roles siguen siendo `Measure` y no se renombraron. Los informes que ya usan el visual no necesitan volver a
  enlazar campos.

### Fuente de datos probada (modelo TableroMaestro, no validada en Power BI)

Según `Tableros/TableroMaestro-build/trabajo/INFORME-F4-POA-modelo.md`:

- Eje del periodo: **`POA_Mes[Abrev]`** (l. 64). `POA_Mes` es la tabla de 12 meses que sirve de eje a las series
  mensuales. Está **desconectada**: no tiene relaciones y las medidas leen el mes del eje (l. 14; `_POA Mes ctx`, l. 37).
- Medidas: **`POA Real`** → «Valor» (`measure`) y **`POA Programado`** → «Programado» (`programmed`) (l. 38, 64).
- El tacómetro necesita que el contexto quede filtrado a **un indicador**, por ejemplo con el segmentador
  `POA_Indicador[Indicador]` o el filtro visual `POA_Indicador[DatoID_IND]` (l. 65–66). Sin ese filtro, las medidas
  combinan varios indicadores. El visual no lo comprueba.
- Historia disponible: **sólo 2024–2026**. La consulta pide 2021–2026, pero la BD sólo tiene 2024–2026 en
  `TableroMaestroValores` (l. 24).
- Diferencia de presentación: el informe sugiere barras para Real (l. 64). El visual dibuja Real como línea con puntos
  de color.

### Verificación (evidencia en `reports/final-0.3.0.0-2026-11-22/` y `reports/tdd-0.3.0.0-2026-11-22.txt`)

- TDD RED→GREEN por componente (`layout`, `trend`, `TrendSparkline`, `GaugeFooter`, `Gauge`, `visual`, `capabilities`,
  versión): `reports/tdd-0.3.0.0-2026-11-22.txt`.
- `npm run test:coverage`: 20 archivos, **194 pruebas aprobadas** (tras la segunda revisión). Cobertura: sentencias 99.71 %,
  ramas 94.56 %, funciones 98.93 %, líneas 99.68 %. Los módulos nuevos se añadieron a `coverage.include` en `vitest.config.mts`.
- `npm run typecheck:test` y `npm run lint`: sin errores (`tsconfig.test.json` añade `resolveJsonModule` para que las
  pruebas importen los JSON).
- `npm run package`: genera el `.pbiviz` (última escritura del artefacto). `artifact-verification.txt` lee el `.pbiviz`
  y confirma el SHA-256, el GUID, la versión `0.3.0.0`, `apiVersion 5.3.0`, los roles `period`/`periodOrder` (`Grouping`),
  `currentPeriod`/`trendSemaphore` (`Measure`), `categories.select = [period, periodOrder]` (top 60), `sorting.implicit`,
  la guía `POA Semáforo mes color` en el rol y que el bundle no contiene `gaugeData=`.
- Arnés de desarrollo (`dev-harness/`, servido sólo en `127.0.0.1:5178`): el escenario `s6-trend-footer` (sparkline +
  pie, ahora con «Orden del periodo», «Periodo actual» = 10 y «Semáforo por periodo») y los escenarios
  `s7-programmed-no-period` (Programado sin periodo: sin pie), `s8-trend-hc` (alto contraste) y `s9-trend-host-order`
  (filas del host desordenadas) están en `src/main.ts`, `verify-dom.mjs` y `screenshots.mjs`. Resultado de `verify-dom`:
  **11 escenarios, 0 fallos**, y ninguna tarjeta muestra texto de depuración. Los escenarios s1–s5 de 0.2.0.0 dan los
  mismos valores sin sparkline ni pie. Capturas en `dev-harness/screenshots/` (`harness-screenshots.txt`).

### Corregido tras la revisión independiente (TDD, RED→GREEN en `reports/tdd-0.3.0.0-review-2026-11-22.txt`)

- **M1:** el pie aparecía con sólo `programmed` enlazado y encogía el medidor de informes 0.2.0.0 sin el rol `period`.
  Ahora el pie y la sparkline sólo ocupan espacio con serie mensual (≥ 2 meses); sin ella el markup es idéntico al de
  0.2.0.0.
- **M2:** la diferencia del pie usaba el Real sin recortar mientras el centro lo recorta, y con Real fuera de rango los
  números no cuadraban (p. ej. centro 120.00, Programado 95.00, Dif. +55.00). Ahora usa el Real mostrado (+25.00).
- **B1:** el hash del CHANGELOG no era el del `.pbiviz` final. Se reempaquetó tras las correcciones y se anotó el hash
  leído después de ese empaquetado.
- Sin cambios en arco, colores, marcadores ni número central.

### Corregido tras la segunda revisión independiente (TDD, RED→GREEN en `reports/tdd-0.3.0.0-review2-2026-11-22.txt`)

- **B1 — mes actual y orden cronológico.** Antes, el medidor tomaba «el último mes con Real» según el orden de filas que
  entregara el host, sin contrato de orden. Ahora:
  - **Orden:** con «Orden del periodo» (p. ej. `POA_Mes[Mes]`, número o fecha) la serie se ordena por esa clave
    (estable; filas sin clave al final). Sin él se usa el orden del host, fijado por `sorting.implicit` ascendente sobre
    «Periodo (mes)»; en TableroMaestro `POA_Mes[Abrev]` tiene `sortByColumn: Mes` (verificado en
    `definicion/modelo/definition/tables/POA_Mes.tmdl`). **El visual nunca deduce el orden de abreviaturas de mes**
    (`periodSortKey("Ene") = null`).
  - **Periodo actual:** con «Periodo actual» (p. ej. `POA Mes sel`, el mes del segmentador `SENER_Mes`) el medidor, el pie y
    los tooltips usan la fila cuyo orden (o, sin orden, cuya etiqueta) coincide; así se conserva la semántica de 0.2.0.0,
    en la que el medidor mostraba el valor del mes seleccionado. Si no coincide ninguna fila **no se elige otra**: no hay
    valor actual (página de inicio). Sin ese rol: el último periodo con Real en orden cronológico.
  - Sin periodo ni orden enlazados no hay categorías: fila 0, idéntico a 0.2.0.0 (pruebas de línea base intactas).
  - Alcance del modelo: **un año y un indicador** en contexto (`POA_Mes` sólo tiene 12 meses; el año sale de `SENER_Anio`).
- **B2 — estado de cada punto de la sparkline.** Antes se coloreaba con los umbrales del mes actual. Ahora cada punto usa
  datos de **su** periodo: «Semáforo por periodo» (`trendSemaphore`, recomendado `POA Semáforo mes color`) → si está vacío,
  «Semáforo» evaluado en ese periodo → si falta o no se reconoce, umbrales bajo/medio y mín./máx. de ese periodo (con los
  mismos valores por omisión que el medidor). El medidor sigue usando «Semáforo» (`POA Semáforo color`).
- **B3 — arnés.** El texto `gaugeData=…` ya no se muestra en las tarjetas (se guarda en `data-debug`), así que la captura
  `s6-trend-footer.png` sale limpia; `verify-dom` lo comprueba (`debugTextVisible: false`) y falla si falta un escenario.
- **B4 — hash.** El `.pbiviz` se regeneró como última escritura y el SHA-256 se calculó después; el hash anterior del
  CHANGELOG (`fc8ec179…`) ya no coincidía con el archivo en `dist/` (`6eb41004…`).
- Sin cambios en arco, colores, marcador triangular ni número central.

### Pendiente / riesgos

- **No se probó en Power BI Desktop ni en Service**: no hubo importación ni publicación. El arnés es un navegador
  headless con un host simulado, no el host real. No se validaron el `dataViewMapping` con categoría en el host real
  (orden de meses, reducción a 60, totales), el filtro de indicador ni el aspecto final. **No es apto para producción.**
- **No se validó en Power BI Desktop (no disponible en este entorno)**: ni el `categories.select` con dos roles, ni
  `sorting.implicit` aplicando «Ordenar por columna», ni la comparación de «Periodo actual» con valores reales del host.
  Sin «Orden del periodo», el orden depende de ese contrato del host. Recomendado: enlazar `POA_Mes[Mes]` en «Orden del
  periodo» y `POA Mes sel` en «Periodo actual».
- Siguen vigentes los pendientes de 0.2.0.0 (A2, A4, copias externas con el mismo GUID, `TargetMarker.tsx` sin uso).

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
