import { createPerformanceColorScale, isFiniteNumber, PerformanceColors } from "./scales";
import { resolveSemaphoreColor } from "./semaphore";
import type { HighContrastColors } from "./types";
import { Box, computeInnerTrendBox, TREND_CURRENT_POINT_RADIUS, TREND_EDGE_CLEARANCE, TREND_PADDING, TREND_POINT_RADIUS } from "./layout";
import { Point } from "./trendTransform";

/**
 * 0.4.0.0 — tipo de gráfico de la serie Real (tarjeta «Gráfico de tendencia»). Vive aquí (no en
 * TrendSparkline.tsx, que lo re-exporta para no romper imports existentes) porque `buildTrendDrawnShapes`
 * (0.4.1.1, más abajo) — módulo puro, sin JSX — también lo necesita; trend.ts es la fuente única del
 * dominio «tendencia», TrendSparkline.tsx (componente) depende de él, no al revés.
 */
export type TrendChartType = "lineDots" | "line" | "bars" | "area";

export interface StatusColors extends PerformanceColors {
    lowerIsBetter: boolean;
    highContrast?: HighContrastColors;
}

/**
 * Color de estado de un valor con la misma precedencia que el arco del medidor:
 * alto contraste > semáforo de la fuente > umbrales (respetando «menor es mejor»).
 */
export function statusColor(
    value: number,
    semaphore: string | null,
    thresholds: { lowThreshold: number; midThreshold: number },
    colors: StatusColors
): string {
    return (
        colors.highContrast?.foreground ??
        resolveSemaphoreColor(semaphore, colors) ??
        createPerformanceColorScale(thresholds.lowThreshold, thresholds.midThreshold, colors, colors.lowerIsBetter)(value)
    );
}

/** Umbrales bajo/medio ya resueltos (mismo criterio que el medidor). */
export interface TrendThresholds {
    lowThreshold: number;
    midThreshold: number;
}

/**
 * Un periodo de la serie con datos de ESE periodo: Real, Programado, semáforo («Semáforo por periodo»
 * o, si está vacío, el semáforo del medidor evaluado en ese periodo) y umbrales resueltos de su fila.
 */
export interface TrendPoint {
    label: string;
    real: number | null;
    programmed: number | null;
    semaphore: string | null;
    thresholds: TrendThresholds;
}

/**
 * Clave de orden explícita de un periodo (rol «Orden del periodo»): número, fecha o texto numérico.
 * Cualquier otro valor (p. ej. «Ene», «Oct») devuelve null: el orden nunca se infiere de nombres de mes.
 */
export function periodSortKey(value: unknown): number | null {
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? time : null;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string" && /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(value)) {
        return Number(value);
    }
    return null;
}

/**
 * Permutación de filas en orden cronológico: ascendente por clave, estable ante empates; las filas
 * sin clave van al final en el orden del host. Devuelve índices de fila del DataView.
 */
export function orderPeriodRows(keys: Array<number | null>): number[] {
    return keys
        .map((key, row) => ({ key, row }))
        .sort((a, b) => {
            if (a.key === null || b.key === null) {
                return a.key === b.key ? a.row - b.row : a.key === null ? 1 : -1;
            }
            return a.key - b.key || a.row - b.row;
        })
        .map((entry) => entry.row);
}

/**
 * Posición del periodo actual explícito (rol «Periodo actual»). Con clave de orden se compara con la
 * clave; sin ella, con la etiqueta (sin distinguir mayúsculas ni espacios). -1 si no coincide ninguno.
 */
export function findCurrentPosition(
    current: unknown,
    periods: Array<{ key: number | null; label: string }>,
    byKey: boolean
): number {
    if (byKey) {
        const key = periodSortKey(current);
        return key === null ? -1 : periods.findIndex((period) => period.key === key);
    }
    const label = String(current).trim().toLowerCase();
    return periods.findIndex((period) => period.label.trim().toLowerCase() === label);
}

/** Último punto (en orden cronológico) con Real; -1 si ninguno tiene. */
export function lastIndexWithReal(points: Array<{ real: number | null }>): number {
    for (let index = points.length - 1; index >= 0; index--) {
        if (points[index].real !== null) {
            return index;
        }
    }
    return -1;
}

export interface TrendVertex {
    index: number;
    x: number;
    y: number;
    value: number;
}

export interface TrendGeometry {
    xs: number[];
    realPoints: TrendVertex[];
    programmedPoints: TrendVertex[];
    realPath: string;
    programmedPath: string;
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Trazo SVG; un hueco (mes sin valor) inicia un segmento nuevo en vez de unir los extremos. */
function toPath(vertices: TrendVertex[]): string {
    return vertices
        .map((v, i) => `${i > 0 && vertices[i - 1].index === v.index - 1 ? "L" : "M"}${v.x},${v.y}`)
        .join("");
}

/** Modo de escala vertical de la tarjeta «Gráfico de tendencia» (0.4.0.0). */
export type YScaleMode = "auto" | "zero" | "manual";

/**
 * Escala valor → y (px) para una caja de `height` con margen `padding` arriba/abajo, dado un dominio
 * [low, high] ya resuelto. Comparte la fórmula exacta que usaba `buildTrendGeometry` internamente
 * (0.3.x): con low === high el valor queda centrado verticalmente (evita dividir entre 0).
 */
export function createTrendYScale(domain: [number, number], height: number, padding: number): (value: number) => number {
    const [low, high] = domain;
    const top = padding;
    const bottom = height - padding;
    return (value: number) => round(high === low ? (top + bottom) / 2 : bottom - ((value - low) / (high - low)) * (bottom - top));
}

/**
 * 0.4.0.0 — dominio [low, high] de la escala Y de la tarjeta «Gráfico de tendencia», según su propiedad
 * «Escala Y»:
 *  - "auto" (por omisión, reemplaza el cálculo "a presión" de 0.3.x): mínimo/máximo COMBINADO de Real y
 *    Programado (siempre ambas series, aunque «Mostrar Programado» esté apagado — así ocultar esa línea
 *    no reescala Real de forma sorpresiva) con un margen de 10% del rango arriba y abajo (punto medio del
 *    8-10% pedido; fijo y determinista, no depende del tamaño de la caja). Si el rango combinado es 0
 *    (un solo valor distinto, o varios iguales, real V):
 *      - V != 0: margen = |V| * 0.10 (mismo 10%, aplicado sobre el valor porque no hay rango del que
 *        tomarlo — mantiene el mismo criterio porcentual en vez de inventar uno nuevo).
 *      - V == 0: margen fijo absoluto de 1. Un 10% de 0 sigue siendo 0 (domain [0, 0] dividiría entre
 *        cero en cualquier escala lineal); 1 es un valor pequeño arbitrario pero documentado, sólo entra
 *        en juego en el caso límite de que TODA la serie (Real y Programado) sea exactamente 0.
 *  - "zero" (desde cero): low = min(0, mínimo combinado), high = max(0, máximo combinado); sin margen
 *    adicional — el origen siempre queda dentro del dominio, como un eje de barras clásico.
 *  - "manual": [manualMin, manualMax] tal cual si ambos son números finitos y manualMin < manualMax; de
 *    lo contrario (panel incompleto o invertido) cae a "auto" sobre los mismos valores, para no romper la
 *    escala con una configuración a medio llenar.
 */
export function computeTrendYDomain(
    values: number[],
    mode: YScaleMode,
    manualMin?: number,
    manualMax?: number
): [number, number] {
    const finite = values.filter(isFiniteNumber);
    const low = finite.length ? Math.min(...finite) : 0;
    const high = finite.length ? Math.max(...finite) : 0;

    if (mode === "manual" && isFiniteNumber(manualMin) && isFiniteNumber(manualMax) && manualMin < manualMax) {
        return [manualMin, manualMax];
    }
    if (mode === "zero") {
        return [Math.min(0, low), Math.max(0, high)];
    }
    const range = high - low;
    if (range > 0) {
        const margin = range * 0.1;
        return [low - margin, high + margin];
    }
    const margin = low !== 0 ? Math.abs(low) * 0.1 : 1;
    return [low - margin, high + margin];
}

/**
 * 0.4.1.0 — `pointSize` (tamaño de punto de la sparkline) pasa de un valor fijo (2.5, 0.3.5.0/0.4.0.0)
 * a «auto» (sin valor por omisión, settings.ts): cuando el panel no lo toca, el tamaño EFECTIVO es
 * proporcional al grosor de línea configurado (`lineWidth`), en vez de un número fijo independiente —
 * así ajustar el grosor de la línea escala también los puntos, de forma coherente, sin que el usuario
 * tenga que tocar dos controles por separado. `TREND_POINT_SIZE_RATIO` preserva EXACTO el resultado de
 * 0.3.5.0/0.4.0.0 en el caso por omisión: lineWidth 1.5 → pointSize 2.5 (2.5 / 1.5).
 */
export const TREND_POINT_SIZE_RATIO = 2.5 / 1.5;

/** Tamaño de punto efectivo (redondeado a centésimas) para un `lineWidth` dado; ver `TREND_POINT_SIZE_RATIO`. */
export function computeEffectivePointSize(lineWidth: number): number {
    return round(lineWidth * TREND_POINT_SIZE_RATIO);
}

/**
 * Geometría pura de la sparkline: meses repartidos en el ancho y Real/Programado en una
 * misma escala vertical (min abajo, max arriba), dentro de un margen `padding`.
 *
 * 0.4.0.0 — `domainOverride` opcional: si se pasa, sustituye el dominio [low, high] calculado
 * internamente de los propios `points` (comportamiento 0.3.x, sin margen, intacto cuando se omite este
 * parámetro). Lo usa TrendSparkline para aplicar el modo de «Escala Y» de la tarjeta (`computeTrendYDomain`).
 */
export function buildTrendGeometry(
    points: TrendPoint[],
    width: number,
    height: number,
    padding: number,
    domainOverride?: [number, number]
): TrendGeometry {
    const innerWidth = Math.max(0, width - padding * 2);
    const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;
    const xs = points.map((_, i) => round(points.length > 1 ? padding + i * step : width / 2));

    const values = points
        .flatMap((point) => [point.real, point.programmed])
        .filter((value): value is number => isFiniteNumber(value));
    const low = domainOverride ? domainOverride[0] : (values.length ? Math.min(...values) : 0);
    const high = domainOverride ? domainOverride[1] : (values.length ? Math.max(...values) : 0);
    const y = createTrendYScale([low, high], height, padding);

    const vertices = (pick: (point: TrendPoint) => number | null): TrendVertex[] =>
        points.flatMap((point, index) => {
            const value = pick(point);
            return isFiniteNumber(value) ? [{ index, x: xs[index], y: y(value), value }] : [];
        });

    const realPoints = vertices((point) => point.real);
    const programmedPoints = vertices((point) => point.programmed);
    return { xs, realPoints, programmedPoints, realPath: toPath(realPoints), programmedPath: toPath(programmedPoints) };
}

/**
 * 0.4.1.1 — fix QA rotación 30°/Barras (colisión real barra↔corona del arco, ver DICTAMEN-QA.md): ancho
 * de cada barra del chartType "bars" de TrendSparkline — 60% del paso entre puntos consecutivos (meses,
 * incluidos los sin valor: `pointCount` es el largo COMPLETO del periodo, igual que `buildTrendGeometry`
 * usa para `step`/`xs`), con un piso de 2px para series con muchos puntos. Única fuente de esta fórmula:
 * TrendSparkline.tsx (dibujo) y `buildTrendDrawnShapes` (geometría real para la homotecia anticolisión,
 * más abajo) la consumen igual — así nunca pueden divergir entre lo que se dibuja y lo que se valida
 * contra el arco.
 */
export function computeTrendBarWidth(width: number, pointCount: number, padding: number): number {
    const innerWidth = Math.max(0, width - padding * 2);
    const step = pointCount > 1 ? innerWidth / (pointCount - 1) : innerWidth;
    return Math.max(2, step * 0.6);
}

/**
 * Agrupa vértices consecutivos (mismo criterio que corta la línea en los huecos de la serie: un mes sin
 * valor empieza un run nuevo en vez de unir los extremos). Fuente única: TrendSparkline.tsx (dibujo de
 * línea/puntos) y `buildTrendDrawnShapes` (geometría real para la homotecia anticolisión) agrupan los
 * vértices exactamente igual — así un hueco nunca puede "unirse" en la colisión mientras se dibuja
 * cortado, o viceversa.
 */
export function runsOf<T extends { index: number }>(vertices: T[]): T[][] {
    const runs: T[][] = [];
    vertices.forEach((vertex, i) => {
        if (i > 0 && vertices[i - 1].index === vertex.index - 1) {
            runs[runs.length - 1].push(vertex);
        } else {
            runs.push([vertex]);
        }
    });
    return runs;
}

/**
 * Rectángulo de una barra del chartType "bars" (mismo cálculo que TrendSparkline.tsx usa para su
 * `<rect class="trend-bar">`): centrada en `x` con `barWidth` de ancho; crece verticalmente desde la
 * línea base (`baselineY`, el cero del dominio Y) hasta `valueY`, con una altura mínima de 0.5px (barra
 * de valor prácticamente igual a la base, siempre visible). Fuente única con el dibujo real — usada por
 * TrendSparkline.tsx (render) y `buildTrendDrawnShapes` (colisión, más abajo).
 */
export function computeBarRect(
    x: number,
    valueY: number,
    baselineY: number,
    barWidth: number
): { x: number; y: number; width: number; height: number } {
    return {
        x: x - barWidth / 2,
        y: Math.min(valueY, baselineY),
        width: barWidth,
        height: Math.max(Math.abs(valueY - baselineY), 0.5),
    };
}

/**
 * Vértices (en orden) del polígono CERRADO que dibuja el chartType "area" para un run continuo: sube
 * por los vértices reales del run y regresa por la línea base (`baselineY`) — mismos puntos que
 * `areaPathOf` (TrendSparkline.tsx) traza como `M...L...L...Z`, aquí como lista de puntos en vez de
 * cadena SVG, para poder reutilizarlos en la colisión real (`buildTrendDrawnShapes`).
 */
export function areaPolygonPoints(run: Array<{ x: number; y: number }>, baselineY: number): Point[] {
    return [{ x: run[0].x, y: baselineY }, ...run.map((v) => ({ x: v.x, y: v.y })), { x: run[run.length - 1].x, y: baselineY }];
}

/** Las 4 esquinas LOCALES del rectángulo que representa un segmento de trazo [a, b] engrosado por
 * `halfWidth` a cada lado (perpendicular a la dirección del segmento) — el mismo footprint visual que un
 * `<line>`/`<path>` SVG con `strokeWidth = 2·halfWidth` y terminación "butt" (sin redondear, el valor por
 * omisión de SVG — ni TrendSparkline.tsx ni Gauge.tsx fijan `stroke-linecap`). Con `halfWidth = 0` las 4
 * esquinas degeneran a dos pares coincidentes ([a,b,b,a]): el chequeo de colisión por borde sigue dando
 * exactamente la distancia segmento→sector (dos aristas con el segmento completo + dos aristas de
 * longitud 0 en los extremos), sin necesitar un caso especial. */
function thickenSegment(a: Point, b: Point, halfWidth: number): Point[] {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = (-dy / length) * halfWidth;
    const ny = (dx / length) * halfWidth;
    return [
        { x: a.x + nx, y: a.y + ny },
        { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny },
        { x: a.x - nx, y: a.y - ny },
    ];
}

/** Geometría LOCAL (sin transformar: antes de la rotación/escala de `trendTransform.ts`) de todo lo que
 * `buildTrendDrawnShapes` construye para la homotecia anticolisión: polígonos (barras, área, y
 * segmentos de línea/Programado ya engrosados por su medio grosor de trazo) y círculos (puntos). */
export interface TrendDrawnShapes {
    polygons: Point[][];
    circles: { center: Point; radius: number }[];
}

/**
 * 0.4.1.1 — fix QA rotación 30°/Barras (DICTAMEN-QA.md): geometría LOCAL real de TODO lo que
 * TrendSparkline.tsx dibuja para una configuración dada — no una aproximación por caja nominal. Fuente
 * única con el componente: orquesta exactamente las mismas funciones puras que TrendSparkline.tsx usa
 * para construir sus atributos SVG (`buildTrendGeometry`, `computeTrendYDomain`, `createTrendYScale`,
 * `runsOf`, `computeBarRect`, `areaPolygonPoints`, `computeTrendBarWidth`) — nunca un cálculo paralelo
 * que pueda divergir del dibujo real. La usa `Gauge.tsx` para probar la homotecia anticolisión
 * (`trendFit.ts`) contra la geometría real transformada, en vez de contra el rectángulo nominal de la
 * caja (causa raíz del defecto QA: una barra puede sobresalir de ese rectángulo en X; el chequeo por
 * caja nunca lo veía).
 *
 * Por tipo de gráfico (igual que TrendSparkline.tsx):
 *  - "lineDots" (por omisión): segmentos de la línea real (medio grosor `lineWidth/2`) + un círculo por
 *    punto real (radio `pointSize`, o `TREND_CURRENT_POINT_RADIUS` extra para el punto del mes actual).
 *  - "line": los mismos segmentos de la línea real (medio grosor `lineWidth/2`); sin círculos — los
 *    círculos de toque (`trend-hit-points`) son transparentes (`fill="transparent"`), no ocupan ningún
 *    pixel visible, así que no cuentan como "dibujado" para efectos de colisión (decisión documentada).
 *  - "bars": un polígono rectángulo por punto con valor real (`computeBarRect`, mismo `barWidth` que
 *    `computeTrendBarWidth`); sin círculos.
 *  - "area": un polígono cerrado por run continuo de valores reales (`areaPolygonPoints`); sin círculos
 *    (mismos círculos de toque transparentes que "line", con el mismo razonamiento).
 * En los 4 tipos, si `showProgrammed` (por omisión true) y hay Programado: los mismos segmentos
 * engrosados (medio grosor fijo 0.75, mitad del `strokeWidth={1.5}` fijo que TrendSparkline.tsx usa para
 * la línea discontinua de Programado — no depende de `lineWidth`).
 */
export function buildTrendDrawnShapes(options: {
    points: TrendPoint[];
    width: number;
    height: number;
    chartType?: TrendChartType;
    currentIndex: number;
    yScaleMode?: YScaleMode;
    yMin?: number;
    yMax?: number;
    showProgrammed?: boolean;
    lineWidth?: number;
    pointSize?: number;
}): TrendDrawnShapes {
    const {
        points,
        width,
        height,
        chartType = "lineDots",
        currentIndex,
        yScaleMode = "auto",
        yMin,
        yMax,
        showProgrammed = true,
        lineWidth = 1.5,
        pointSize = TREND_POINT_RADIUS,
    } = options;

    const combinedValues = points.flatMap((point) => [point.real, point.programmed]).filter(isFiniteNumber);
    const domain = computeTrendYDomain(combinedValues, yScaleMode, yMin, yMax);
    const geometry = buildTrendGeometry(points, width, height, TREND_PADDING, domain);
    const baselineY = createTrendYScale(domain, height, TREND_PADDING)(Math.min(domain[1], Math.max(domain[0], 0)));
    const barWidth = computeTrendBarWidth(width, points.length, TREND_PADDING);

    const polygons: Point[][] = [];
    const circles: { center: Point; radius: number }[] = [];

    const addRunSegments = (vertices: TrendVertex[], halfWidth: number): void => {
        runsOf(vertices).forEach((run) => {
            for (let i = 1; i < run.length; i++) {
                polygons.push(thickenSegment({ x: run[i - 1].x, y: run[i - 1].y }, { x: run[i].x, y: run[i].y }, halfWidth));
            }
        });
    };

    if (chartType === "bars") {
        geometry.realPoints.forEach((vertex) => {
            const rect = computeBarRect(vertex.x, vertex.y, baselineY, barWidth);
            polygons.push([
                { x: rect.x, y: rect.y },
                { x: rect.x + rect.width, y: rect.y },
                { x: rect.x + rect.width, y: rect.y + rect.height },
                { x: rect.x, y: rect.y + rect.height },
            ]);
        });
    } else if (chartType === "area") {
        runsOf(geometry.realPoints).forEach((run) => polygons.push(areaPolygonPoints(run, baselineY)));
    } else {
        // "lineDots" y "line" comparten la misma geometría de línea (medio grosor `lineWidth/2`).
        addRunSegments(geometry.realPoints, lineWidth / 2);
        if (chartType === "lineDots") {
            geometry.realPoints.forEach((vertex) => {
                const radius = vertex.index === currentIndex ? pointSize + (TREND_CURRENT_POINT_RADIUS - TREND_POINT_RADIUS) : pointSize;
                circles.push({ center: { x: vertex.x, y: vertex.y }, radius });
            });
        }
    }

    if (showProgrammed) {
        addRunSegments(geometry.programmedPoints, 0.75); // mitad de strokeWidth={1.5} fijo (TrendSparkline.tsx).
    }

    return { polygons, circles };
}

/** Punto de arranque de la holgura iterativa de `computeInnerTrendBoxForChartType`: el mismo margen que
 * `computeInnerTrendBox` ya usa para el radio de un punto (ver `reach` en layout.ts). */
const INITIAL_EXTRA_HALF_WIDTH = TREND_CURRENT_POINT_RADIUS + TREND_EDGE_CLEARANCE;
/** Iteraciones de la convergencia de `computeInnerTrendBoxForChartType`: confirmado estable (diferencia
 * sub-píxel entre iteraciones consecutivas) en bastante menos que esto para los tamaños de tarjeta del
 * reporte (300×300 hasta 480×300); se deja margen generoso sin coste perceptible (son operaciones puras,
 * sin I/O, baratas incluso ×8). */
const EXTRA_HALF_WIDTH_ITERATIONS = 8;

/**
 * 0.4.1.1 — fix QA rotación 30°/Barras (DICTAMEN-QA.md): `computeInnerTrendBox` (layout.ts) por sí sola
 * sólo garantiza holgura (`reach`) para contenido puntual (radio de un punto, "lineDots"); para "bars"
 * cada barra ocupa, a cada lado de su punto, hasta `computeTrendBarWidth(...)/2` — que puede exceder ese
 * `reach` y dejar la propia ESQUINA de la caja (el pivote fijo de la rotación, `trendTransform.ts`) sin
 * holgura real frente al arco. Sin esa holgura, ninguna reducción de escala (`fitTrendScaleForShapes`)
 * puede evitar la colisión de una barra cercana a ese pivote: el pivote en sí mismo ya colisiona, y
 * reducir la escala sólo acerca el contenido A ese mismo pivote, nunca lo aleja del arco.
 *
 * Esta función delega en `computeInnerTrendBox` pasándole `extraHalfWidth = computeTrendBarWidth(...)/2`
 * para "bars" — la MISMA fórmula de ancho de barra que `buildTrendDrawnShapes`/TrendSparkline.tsx usan
 * para dibujar, fuente única, nunca un cálculo paralelo. Como el ancho de barra depende del ancho de la
 * caja (y éste, a su vez, de la holgura exigida: una caja más angosta por exigir más holgura produce
 * barras más angostas, que exigirían algo MENOS de holgura) hay una dependencia circular; se resuelve con
 * unas pocas iteraciones de punto fijo (arrancando con el margen de un punto, igual que antes de este
 * fix) — confirmado estable para los tamaños de tarjeta del reporte. Para cualquier chartType != "bars"
 * (incluido el valor por omisión, "lineDots") o con menos de 2 puntos (no hay "ancho de paso" que medir)
 * se delega directo en `computeInnerTrendBox` con `extraHalfWidth` por omisión (0): resultado IDÉNTICO al
 * automático existente, sin ninguna iteración — regresión visual exacta de 0.4.1.0 para todo lo que no
 * sea "bars".
 */
export function computeInnerTrendBoxForChartType(
    radius: number,
    thickness: number,
    startAngle: number,
    endAngle: number,
    cardWidth: number,
    showRanges: boolean,
    chartType: TrendChartType | undefined,
    pointCount: number
): Box | null {
    if (chartType !== "bars" || pointCount < 2) {
        return computeInnerTrendBox(radius, thickness, startAngle, endAngle, cardWidth, showRanges);
    }
    let extraHalfWidth = INITIAL_EXTRA_HALF_WIDTH;
    let box = computeInnerTrendBox(radius, thickness, startAngle, endAngle, cardWidth, showRanges, extraHalfWidth);
    for (let i = 0; i < EXTRA_HALF_WIDTH_ITERATIONS && box; i++) {
        extraHalfWidth = computeTrendBarWidth(box.width, pointCount, TREND_PADDING) / 2;
        box = computeInnerTrendBox(radius, thickness, startAngle, endAngle, cardWidth, showRanges, extraHalfWidth);
    }
    return box;
}
