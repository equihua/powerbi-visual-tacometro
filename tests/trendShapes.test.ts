import { describe, expect, it } from "vitest";
import {
    areaPolygonPoints,
    buildTrendDrawnShapes,
    computeBarRect,
    computeTrendBarWidth,
    runsOf,
    TrendPoint,
} from "../src/components/trend";
import { TREND_CURRENT_POINT_RADIUS, TREND_PADDING, TREND_POINT_RADIUS } from "../src/components/layout";

/**
 * 0.4.1.1 — fix QA rotación 30°/Barras (DICTAMEN-QA.md): geometría REAL de todo lo dibujado por
 * TrendSparkline.tsx, para que la homotecia anticolisión (trendFit.ts/Gauge.tsx) pruebe exactamente lo
 * que se ve en pantalla — no una aproximación por caja nominal. Fuente única: estos helpers (y
 * `buildTrendDrawnShapes`, que los orquesta igual que TrendSparkline.tsx) son los que usa el propio
 * componente para construir sus atributos SVG (ver TrendSparkline.tsx) y los que usa Gauge.tsx para la
 * homotecia — nunca dos cálculos paralelos que puedan divergir.
 */

function p(label: string, real: number | null, programmed: number | null = null): TrendPoint {
    return { label, real, programmed, semaphore: null, thresholds: { lowThreshold: 0, midThreshold: 0 } };
}

describe("runsOf — agrupa vértices consecutivos (mismo criterio que corta la línea en los huecos)", () => {
    it("vértices todos consecutivos: un solo run", () => {
        const vertices = [{ index: 0 }, { index: 1 }, { index: 2 }];
        expect(runsOf(vertices)).toEqual([[{ index: 0 }, { index: 1 }, { index: 2 }]]);
    });

    it("hueco entre índices: dos runs separados", () => {
        const vertices = [{ index: 0 }, { index: 2 }, { index: 3 }];
        expect(runsOf(vertices)).toEqual([[{ index: 0 }], [{ index: 2 }, { index: 3 }]]);
    });

    it("sin vértices: sin runs", () => {
        expect(runsOf([])).toEqual([]);
    });
});

describe("computeBarRect — rectángulo de una barra (misma fórmula que TrendSparkline.tsx dibuja)", () => {
    it("valor por encima de la línea base: y = valor, crece hacia abajo hasta la base", () => {
        expect(computeBarRect(50, 10, 30, 8)).toEqual({ x: 46, y: 10, width: 8, height: 20 });
    });

    it("valor por debajo de la línea base: y = base, crece hacia abajo hasta el valor", () => {
        expect(computeBarRect(50, 40, 30, 8)).toEqual({ x: 46, y: 30, width: 8, height: 10 });
    });

    it("altura mínima de 0.5 (valor prácticamente igual a la base)", () => {
        expect(computeBarRect(50, 30, 30, 8)).toEqual({ x: 46, y: 30, width: 8, height: 0.5 });
    });
});

describe("areaPolygonPoints — polígono cerrado de un run de área (mismo trazo que areaPathOf construye)", () => {
    it("un run de 3 vértices: sube por los vértices y regresa por la línea base", () => {
        const run = [
            { index: 0, x: 10, y: 40, value: 1 },
            { index: 1, x: 110, y: 20, value: 2 },
            { index: 2, x: 210, y: 30, value: 3 },
        ];
        expect(areaPolygonPoints(run, 50)).toEqual([
            { x: 10, y: 50 },
            { x: 10, y: 40 },
            { x: 110, y: 20 },
            { x: 210, y: 30 },
            { x: 210, y: 50 },
        ]);
    });
});

describe("buildTrendDrawnShapes — geometría LOCAL real de TODO lo dibujado por TrendSparkline, por chartType", () => {
    const points: TrendPoint[] = [p("Ene", 10, 20), p("Feb", 30, 20), p("Mar", 20, 40)];
    const width = 220;
    const height = 50;

    it("lineDots (por omisión): segmentos de la línea real y de Programado (medio grosor de trazo) + círculos de los puntos", () => {
        const shapes = buildTrendDrawnShapes({ points, width, height, chartType: "lineDots", currentIndex: 1 });
        // 3 puntos reales consecutivos -> 2 segmentos reales; 3 programados consecutivos -> 2 segmentos. 4 polígonos en total.
        expect(shapes.polygons.length).toBe(4);
        // 3 círculos (uno por punto real); el del índice actual (1) tiene radio mayor.
        expect(shapes.circles.length).toBe(3);
        const radii = shapes.circles.map((c) => c.radius);
        expect(radii.filter((r) => r === TREND_POINT_RADIUS).length).toBe(2);
        expect(radii.filter((r) => r === TREND_CURRENT_POINT_RADIUS).length).toBe(1);
    });

    it("lineDots sin Programado (showProgrammed=false): sólo los segmentos de la línea real, sin los de Programado", () => {
        const shapes = buildTrendDrawnShapes({ points, width, height, chartType: "lineDots", currentIndex: -1, showProgrammed: false });
        expect(shapes.polygons.length).toBe(2); // sólo los 2 segmentos de la línea real.
    });

    it("bars: un polígono rectángulo por punto con valor real, mismo ancho que computeTrendBarWidth; sin círculos", () => {
        const shapes = buildTrendDrawnShapes({ points, width, height, chartType: "bars", currentIndex: -1 });
        // 3 puntos reales -> 3 barras + 2 segmentos de Programado = 5 polígonos.
        expect(shapes.polygons.length).toBe(5);
        expect(shapes.circles.length).toBe(0);
        const barWidth = computeTrendBarWidth(width, points.length, TREND_PADDING);
        const firstBar = shapes.polygons[0];
        expect(firstBar.length).toBe(4);
        const xs = firstBar.map((c) => c.x);
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(barWidth, 9);
    });

    it("area: un polígono cerrado por run continuo de valores reales (sin círculos visibles, los hitPoints transparentes no colisionan)", () => {
        const shapes = buildTrendDrawnShapes({ points, width, height, chartType: "area", currentIndex: -1 });
        // 1 run continuo (los 3 puntos tienen Real) -> 1 polígono de área + 2 segmentos de Programado = 3.
        expect(shapes.polygons.length).toBe(3);
        expect(shapes.circles.length).toBe(0);
    });

    it("line: segmentos de la línea real (sin puntos visibles) + Programado; sin círculos", () => {
        const shapes = buildTrendDrawnShapes({ points, width, height, chartType: "line", currentIndex: -1 });
        expect(shapes.polygons.length).toBe(4); // 2 segmentos reales + 2 de Programado.
        expect(shapes.circles.length).toBe(0);
    });

    it("huecos (mes sin Real) cortan los segmentos en runs separados, igual que la línea dibujada", () => {
        const withGap: TrendPoint[] = [p("Ene", 10), p("Feb", null), p("Mar", 30), p("Abr", 20)];
        const shapes = buildTrendDrawnShapes({ points: withGap, width: 320, height, chartType: "lineDots", currentIndex: -1, showProgrammed: false });
        // Run [Ene] (1 vértice, 0 segmentos) + run [Mar,Abr] (2 vértices, 1 segmento) = 1 segmento total.
        expect(shapes.polygons.length).toBe(1);
        expect(shapes.circles.length).toBe(3); // Ene, Mar, Abr (Feb no dibuja punto).
    });

    it("lineWidth configurable: el grosor de los segmentos (medio ancho) escala con lineWidth", () => {
        const thin = buildTrendDrawnShapes({ points, width, height, chartType: "line", currentIndex: -1, showProgrammed: false, lineWidth: 1 });
        const thick = buildTrendDrawnShapes({ points, width, height, chartType: "line", currentIndex: -1, showProgrammed: false, lineWidth: 10 });
        const widthOf = (poly: { x: number; y: number }[]): number => {
            // ancho perpendicular del rectángulo engrosado: distancia entre esquina 0 y esquina 3 (mismo extremo, lados opuestos).
            return Math.hypot(poly[0].x - poly[3].x, poly[0].y - poly[3].y);
        };
        expect(widthOf(thick.polygons[0])).toBeGreaterThan(widthOf(thin.polygons[0]));
    });

    /**
     * Rama de regresión (coverage branch Reviewer — gate de rama >= 96.99 %): `thickenSegment`
     * (trend.ts) usa `Math.hypot(dx, dy) || 1` para evitar dividir entre 0 cuando el segmento [a, b] es
     * degenerado (longitud 0: ambos extremos coinciden exactamente). Eso ocurre cuando dos vértices
     * consecutivos del mismo run comparten x e y — aquí forzado con `width` igual a 2·TREND_PADDING (así
     * `innerWidth` da 0 y TODOS los xs quedan en el mismo punto, `buildTrendGeometry`) y 2 puntos con el
     * MISMO valor real (mismo y). Sin el `|| 1` esto produciría NaN en las 4 esquinas del polígono
     * engrosado (división entre longitud 0); con él, el polígono degenera a un rectángulo de ancho
     * `2·halfWidth` centrado en ese único punto (sin dirección perpendicular definible, `nx`/`ny` caen a
     * 0 — ver fórmula), que es exactamente lo que se verifica abajo.
     */
    it("segmento degenerado (dos vértices consecutivos en el mismo punto, dx=dy=0): nunca produce NaN (piso Math.hypot(...) || 1)", () => {
        const samePoint: TrendPoint[] = [p("Ene", 50), p("Feb", 50)]; // mismo valor real -> mismo y.
        const degenerateWidth = 2 * TREND_PADDING; // innerWidth = 0 -> ambos xs caen en el mismo punto.
        const shapes = buildTrendDrawnShapes({
            points: samePoint, width: degenerateWidth, height, chartType: "line", currentIndex: -1, showProgrammed: false,
        });
        expect(shapes.polygons.length).toBe(1);
        const polygon = shapes.polygons[0];
        for (const corner of polygon) {
            expect(Number.isFinite(corner.x)).toBe(true);
            expect(Number.isFinite(corner.y)).toBe(true);
        }
        // Sin dirección perpendicular definible (longitud 0 -> nx=ny=0 con el piso `|| 1`), las 4
        // esquinas colapsan exactamente en el único punto compartido por ambos vértices.
        const [a] = polygon;
        for (const corner of polygon) {
            expect(corner).toEqual({ x: a.x, y: a.y });
        }
    });

    /**
     * Rama de regresión (coverage branch): `computeTrendBarWidth` (trend.ts) usa
     * `pointCount > 1 ? innerWidth / (pointCount - 1) : innerWidth` — la rama `else` (un solo punto, o
     * ninguno) nunca se ejercitaba (buildTrendDrawnShapes siempre se llama con la serie completa, >1
     * punto, en el resto de las pruebas). Con `pointCount <= 1` no hay "paso entre puntos" que medir: el
     * ancho de barra cae directo al ancho interior completo (acotado por el piso de 2px, igual que el
     * caso general).
     */
    it("computeTrendBarWidth con 1 punto (o 0): usa innerWidth directo (sin paso entre puntos), no innerWidth/(pointCount-1)", () => {
        expect(computeTrendBarWidth(100, 1, 10)).toBe(Math.max(2, (100 - 20) * 0.6)); // innerWidth = 80.
        expect(computeTrendBarWidth(100, 0, 10)).toBe(Math.max(2, (100 - 20) * 0.6)); // mismo innerWidth, pointCount=0.
    });
});
