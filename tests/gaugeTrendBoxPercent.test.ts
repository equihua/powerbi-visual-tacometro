import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gauge from "../src/components/Gauge";
import { GaugeData, GaugeSettings } from "../src/components/types";
import { TrendPoint, buildTrendGeometry, computeTrendYDomain } from "../src/components/trend";
import { computeGaugeFrame, computeInnerTrendBox, TREND_PADDING, Box } from "../src/components/layout";
import { boxToPercent, percentToBox } from "../src/components/trendBoxPercent";
import { isFiniteNumber } from "../src/components/scales";
import { baseline } from "./fixtures/gaugeBaseline020";

/**
 * 0.4.1.0 — integración Gauge.tsx: `settings.trendPosX/posY/width/height` son % (0..100) del
 * viewport completo (pivote inferior-izquierda, trendBoxPercent.ts), NO px relativos al centro del
 * medidor (0.4.0.0, `applyTrendBoxOverrides`). Estas pruebas confirman que Gauge.tsx de verdad resuelve
 * la caja con `resolveTrendBoxFromPercentOverrides` comparando, para cada eje, la caja EFECTIVA
 * (posición de la ranura + geometría interna de los puntos de la sparkline, ambas derivadas
 * independientemente aquí con las mismas funciones puras que usa producción) contra lo que el markup
 * renderizado realmente contiene.
 */
const settings = baseline.settings as GaugeSettings;
const thresholds = { lowThreshold: 80, midThreshold: 95 };
const trend: TrendPoint[] = [
    { label: "Ene", real: 80, programmed: 85, semaphore: "Rojo", thresholds },
    { label: "Feb", real: 88, programmed: 90, semaphore: "Amarillo", thresholds },
    { label: "Mar", real: 91.47, programmed: 95, semaphore: "Amarillo", thresholds },
];
const withTrend = { ...baseline.markers, trend, trendCurrentIndex: 2 } as GaugeData;

function render(s: GaugeSettings, width = 300, height = 300): string {
    return renderToStaticMarkup(React.createElement(Gauge, { viewport: { width, height }, settings: s, gaugeData: withTrend }));
}

function slotTranslate(markup: string): { x: number; y: number } | null {
    const m = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

/** cx/cy de los 3 puntos "trend-point" (lineDots, chartType por omisión), por data-trend-index. */
function points(markup: string): Array<{ x: number; y: number }> {
    return [...markup.matchAll(/<circle[^>]*class="trend-point[^"]*"[^>]*data-trend-index="(\d+)"[^>]*cx="([-\d.]+)"[^>]*cy="([-\d.]+)"/g)]
        .sort((a, b) => Number(a[1]) - Number(b[1]))
        .map((m) => ({ x: Number(m[2]), y: Number(m[3]) }));
}

/** Misma geometría que Gauge.tsx usa internamente (frame + caja automática). */
function geometryFor(width: number, height: number) {
    const gaugeHeight = height - 40; // FOOTER_HEIGHT
    const frame = computeGaugeFrame(width, gaugeHeight, settings.thickness, settings.startAngle, settings.endAngle, true);
    const autoBox = computeInnerTrendBox(frame.radius, settings.thickness, settings.startAngle, settings.endAngle, width, settings.showRanges)!;
    return { frame, autoBox };
}

/** Puntos esperados (vertex.x/y del Real) dentro de una caja de `box.width x box.height` (mismo cálculo que TrendSparkline). */
function expectedRealPoints(box: Box) {
    const combined = trend.flatMap((p) => [p.real, p.programmed]).filter(isFiniteNumber);
    const domain = computeTrendYDomain(combined, "auto");
    return buildTrendGeometry(trend, box.width, box.height, TREND_PADDING, domain).realPoints;
}

describe("Gauge — resolución de posX/posY/width/height como % del viewport (0.4.1.0, no px)", () => {
    it("sin ninguna sobreescritura (los 4 undefined), posición y puntos renderizados son idénticos al cálculo automático (preserva 0.4.0.0/0.3.x)", () => {
        const width = 300, height = 300;
        const markup = render(settings, width, height);
        const { frame, autoBox } = geometryFor(width, height);
        const slot = slotTranslate(markup)!;
        expect(slot.x).toBeCloseTo(frame.cx + autoBox.x, 6);
        expect(slot.y).toBeCloseTo(frame.cy + autoBox.y, 6);

        const expected = expectedRealPoints(autoBox);
        const actual = points(markup);
        expect(actual).toHaveLength(expected.length);
        expected.forEach((v, i) => {
            expect(actual[i].x).toBeCloseTo(v.x, 6);
            expect(actual[i].y).toBeCloseTo(v.y, 6);
        });
    });

    it("con las 4 sobreescritas en %, la caja se resuelve con el pivote inferior-izquierdo (percentToBox), NO como px directos sumados al centro", () => {
        const width = 300, height = 300;
        const overrides: GaugeSettings = { ...settings, trendPosX: 60, trendPosY: 80, trendWidth: 30, trendHeight: 15 };
        const markup = render(overrides, width, height);
        const { frame } = geometryFor(width, height);

        const expectedBox = percentToBox(
            { posX: 60, posY: 80, width: 30, height: 15 },
            { x: frame.cx, y: frame.cy },
            { width, height }
        );

        const slot = slotTranslate(markup)!;
        expect(slot.x).toBeCloseTo(frame.cx + expectedBox.x, 2);
        expect(slot.y).toBeCloseTo(frame.cy + expectedBox.y, 2);

        const expected = expectedRealPoints(expectedBox);
        const actual = points(markup);
        expect(actual).toHaveLength(expected.length);
        expected.forEach((v, i) => {
            expect(actual[i].x).toBeCloseTo(v.x, 1);
            expect(actual[i].y).toBeCloseTo(v.y, 1);
        });

        // Regresión explícita del bug: tratar 60/80/30/15 como PX directos (semántica 0.4.0.0, la que
        // tenía Gauge.tsx antes de este cambio) habría puesto la caja a sólo 30x15 px del centro —
        // nada parecido a la posición/tamaño correctos en % del viewport completo (300x300).
        const wrongPxBox = { x: 60, y: 80, width: 30, height: 15 };
        expect(slot.x).not.toBeCloseTo(frame.cx + wrongPxBox.x, 0);
    });

    it("sobreescribir sólo un eje (width) deja los otros 3 en su valor automático efectivo, igual que applyTrendBoxOverrides pero en %", () => {
        const width = 300, height = 300;
        const { frame, autoBox } = geometryFor(width, height);
        const autoPercent = boxToPercent(autoBox, { x: frame.cx, y: frame.cy }, { width, height });

        const overrides: GaugeSettings = { ...settings, trendWidth: autoPercent.width / 2 };
        const markup = render(overrides, width, height);

        const expectedBox = percentToBox(
            { posX: autoPercent.posX, posY: autoPercent.posY, width: autoPercent.width / 2, height: autoPercent.height },
            { x: frame.cx, y: frame.cy },
            { width, height }
        );
        expect(expectedBox.height).toBeCloseTo(autoBox.height, 6); // alto sin tocar: sigue el automático

        const slot = slotTranslate(markup)!;
        expect(slot.x).toBeCloseTo(frame.cx + expectedBox.x, 2);
        expect(slot.y).toBeCloseTo(frame.cy + expectedBox.y, 2);

        const expected = expectedRealPoints(expectedBox);
        const actual = points(markup);
        expected.forEach((v, i) => {
            expect(actual[i].x).toBeCloseTo(v.x, 1);
            expect(actual[i].y).toBeCloseTo(v.y, 1);
        });
    });
});
