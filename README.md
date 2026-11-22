# powerbi-visual-tacometro
Medidor de tacómetro con marge y objetivo

Versión actual del visual: **0.3.2.0** (`pbiviz.json`). Cambios, compatibilidad y estado de los puntos A1–A4 / B1–B4
en [CHANGELOG.md](CHANGELOG.md).

> **Estado:** compila, pasa lint y pruebas unitarias, y se empaqueta localmente. **No se ha validado dentro de
> Power BI** (Desktop/Service). Por eso falta comprobar en el host la experiencia de uso (tooltips, menú contextual,
> teclado, alto contraste, landing page, marcadores, semáforo) y no debe usarse en producción hasta entonces.

## Versión de Node.js

Este proyecto requiere Node.js 24.21.0, fijado en `.nvmrc`. Vitest 5.1.0 exige `^22.12.0 || ^24.0.0 || >=26`, mientras que `pbiviz` exige `>=20.19.0`.

Al entrar al proyecto, ejecuta:

```bash
nvm use
```

Este comando lee `.nvmrc`. Si la versión todavía no está instalada, ejecuta `nvm install`; después verifica la versión activa con `node -v`.

El cambio es sólo local al shell y al proyecto: no altera el valor predeterminado global de nvm ni otros proyectos. No ejecutes `nvm alias default`. Opcionalmente, puedes configurar un hook de shell para ejecutar `nvm use` automáticamente al entrar al directorio; este proyecto no configura ese hook.

## Comandos

```bash
npm ci
npm run typecheck:test   # tsc de src + tests
npm run lint
npm test                 # Vitest
npm run test:coverage    # Vitest + cobertura v8 (módulos listados en vitest.config.mts)
npm run package          # pbiviz package → dist/PBI_CV_TACOMETRO_GAUGE.<versión>.pbiviz
```

## Campos (roles de datos)

| Campo | Rol | Uso |
|---|---|---|
| Valor | `measure` | Valor real (obligatorio; sin él aparece la página de inicio). |
| Valor Mínimo / Máximo | `min` / `max` | Escala del medidor. |
| Umbral Bajo / Medio | `lowThreshold` / `midThreshold` | Cortes de las bandas. |
| Valor Objetivo | `target` | Marcador original. |
| Meta con margen / Programado / Real mes anterior | `targetWithMargin` / `programmed` / `previousMonth` | Marcadores adicionales, cada uno con su propio color (tarjeta «Marcadores»). Con serie mensual, Programado alimenta «Programado» / «Dif. Real & Prog.» del pie y Real mes anterior el valor de «Real & Mes anterior» (Real − Real mes anterior); si falta el rol, esa columna queda sólo con la etiqueta. |
| Periodo (mes) | `period` | Agrupación opcional (p. ej. `POA_Mes[Abrev]`) para la sparkline Real/Programado y el pie. El visual **no** deduce el orden de nombres de mes: usa «Orden del periodo» o, sin él, el orden del host (orden implícito ascendente por este campo, que respeta «Ordenar por columna»: `POA_Mes[Abrev]` → `POA_Mes[Mes]`). Un año y un indicador en contexto. Sin este campo se conserva el comportamiento de un único valor. |
| Orden del periodo | `periodOrder` | Agrupación opcional numérica o de fecha (p. ej. `POA_Mes[Mes]`) que fija el orden cronológico de la serie. |
| Periodo actual | `currentPeriod` | Medida opcional (p. ej. `POA Mes sel`): periodo que muestran el medidor, el pie y el tooltip. Se compara con «Orden del periodo» (o con la etiqueta). Si no coincide con ningún periodo, no hay valor actual. Sin ella: último periodo con Real en orden cronológico. |
| Semáforo por periodo | `trendSemaphore` | Medida opcional (p. ej. `POA Semáforo mes color`) para el color de cada punto de la sparkline. Si está vacía en un periodo se usa «Semáforo» evaluado en ese periodo; si el valor resultante falta o no se reconoce, los umbrales (y mín./máx.) de ese mismo periodo, nunca los del mes actual. |
| Semáforo (color de la fuente) | `semaphore` | Texto `Verde`/`Amarillo`/`Rojo`, `Green`/`Yellow`/`Red`, clase `text-success`/`text-warning`/`text-danger`/`text-yellow-custom`, neutro (`Sin semaforizar`, `Gris`, `text-muted`, `text-secondary` → gris `#ADB5BD`) o `#hex`. Si se reconoce, sustituye el color calculado (ver nota abajo). |
| Información sobre herramientas | `tooltips` | Campos extra en el tooltip. |

Ajuste «Menor es mejor» (`Rangos → lowerIsBetter`): invierte la asignación de colores para indicadores descendentes.

Dónde se ve el color del semáforo (precedencia: alto contraste > semáforo de la fuente > umbrales):

- `Rangos → Mostrar rangos` **activado** (predeterminado): las tres bandas siguen mostrando los umbrales. Si el semáforo
  se reconoce, se dibuja además un arco de progreso delgado (`semaphore-indicator`), por dentro de la banda, desde el
  inicio hasta el valor, con el color de la fuente. Sin semáforo reconocido no se dibuja ese arco.
- `Mostrar rangos` **desactivado**: el arco de desempeño (`performance-arc`) usa directamente ese color.

El rol `semaphore` es de tipo *Measure*: acepta una medida DAX que devuelva texto (p. ej. `"Rojo"`, `"text-danger"` o
`"#C00000"`); el visual lee el primer valor como texto y descarta los valores no textuales.

## Copia oficial y GUID

- **Repositorio oficial** (decisión D8 de TableroMaestro):
  `/home/equihua/Projects/PowerBI/Dexter/React/powerbi-visual-tacometro`.
  Importa en Power BI **sólo** el `.pbiviz` de su `dist/`.
- GUID: `PBI_CV_TACOMETRO_GAUGE`. **Hay otras dos carpetas con ese mismo GUID** (versión `0.1.0-beta.1`, no se modificaron):
  - `/home/equihua/Projects/PowerBI/Objetos Visuales/tacometroGauge`
  - `/home/equihua/Projects/PowerBI/Objetos Visuales/tacometroGauge_basic`
- Power BI identifica el visual por el GUID. Si se importa un `.pbiviz` de una de esas copias, reemplaza al oficial en el informe, y al revés.
  Además, `Tableros/Laboratorios/Tablero Maestro.pbix` y `Tableros/Tablero Maestro - Corto.pbix` ya incrustan un visual
  con ese GUID (`Report/CustomVisuals/PBI_CV_TACOMETRO_GAUGE/`).
  Para retirar o renombrar el GUID de las copias externas hace falta una autorización explícita.
