import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gauge from "../src/components/Gauge";
import { GaugeData, GaugeSettings } from "../src/components/types";
import { TrendPoint } from "../src/components/trend";
import { computeGaugeFrame, computeInnerTrendBox } from "../src/components/layout";
import { bandRadii } from "../src/components/arcUtils";
import { fitTrendScale, TREND_MIN_SCALE } from "../src/components/trendFit";
import { baseline } from "./fixtures/gaugeBaseline020";

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

/** `scale` real de un matrix(a,b,c,d,e,f): la escala es la norma de la primera columna (a,b). */
function scaleFromMatrix(markup: string): number | null {
    const m = /class="trend-sparkline" transform="matrix\(([^)]+)\)"/.exec(markup);
    if (!m) return null;
    const [a, b] = m[1].split(",").map(Number);
    return Math.hypot(a, b);
}

/** Reconstruye los mismos obstáculos (viewport/pie/corona del arco) que Gauge.tsx usa para la homotecia. */
function obstaclesFor(width: number, height: number) {
    const gaugeHeight = height - 40; // FOOTER_HEIGHT
    const frame = computeGaugeFrame(width, gaugeHeight, settings.thickness, settings.startAngle, settings.endAngle, true);
    const { innerRadius, outerRadius } = bandRadii(frame.radius, settings.thickness);
    const box = computeInnerTrendBox(frame.radius, settings.thickness, settings.startAngle, settings.endAngle, width, settings.showRanges)!;
    return {
        frame,
        box,
        obstacles: {
            viewportWidth: width,
            viewportHeight: height,
            footerTop: height - 40,
            arc: {
                center: { x: width / 2, y: frame.cy },
                innerRadius,
                outerRadius: outerRadius + 11, // MARKER_OVERHANG
                startAngle: settings.startAngle,
                endAngle: settings.endAngle,
            },
        },
    };
}

describe("Gauge — homotecia automática anticolisión del gráfico de tendencia (reducir escala sin mover X,Y ni cambiar el ángulo)", () => {
    it("ángulo 0 (comportamiento 0.3.x/0.4.0.0): la caja ya es segura por construcción, nunca se reduce (sin transform)", () => {
        const markup = render(settings);
        expect(markup).toContain('class="trend-sparkline">'); // sin matrix ni rotate: scale=1, angle=0
        expect(scaleFromMatrix(markup)).toBeNull();
    });

    it("rotar la serie un poco (trendAngle=15°) saca la caja de los límites seguros; la escala se reduce automáticamente a la máxima que sí cabe, sin mover su posición ni su ángulo", () => {
        const rotated = { ...settings, trendAngle: 15 } as GaugeSettings;
        const markup = render(rotated);
        const scale = scaleFromMatrix(markup);
        expect(scale).not.toBeNull();
        expect(scale as number).toBeLessThan(1);
        expect(scale as number).toBeGreaterThan(TREND_MIN_SCALE);

        // La posición (traslación del <g class="gauge-trend-slot">) no cambia: sigue calculada por
        // computeInnerTrendBox/computeGaugeFrame exactamente igual que sin rotar — sólo la escala del
        // contenido (matrix dentro de "trend-sparkline") cambia.
        const slotRotated = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup);
        const slotBaseline = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(render(settings));
        expect(slotRotated![1]).toBe(slotBaseline![1]);
        expect(slotRotated![2]).toBe(slotBaseline![2]);

        // Coincide con fitTrendScale llamada con la misma caja/obstáculos (misma fuente, no duplicada
        // a mano): verifica que Gauge.tsx de verdad delega en trendFit.ts, no en un cálculo paralelo.
        const { box, obstacles } = obstaclesFor(300, 300);
        const boxOrigin = { x: Number(slotRotated![1]), y: Number(slotRotated![2]) };
        const expected = fitTrendScale(box.width, box.height, boxOrigin, 15, 1, obstacles);
        expect(expected.fits).toBe(true);
        expect(scale as number).toBeCloseTo(expected.scale, 3);
    });

    it("rotar mucho (trendAngle=90°, caja mucho más ancha que alta) no cabe ni en el piso documentado: se reporta explícito (se usa TREND_MIN_SCALE), nunca se recorta el contenido", () => {
        const rotated = { ...settings, trendAngle: 90 } as GaugeSettings;
        const markup = render(rotated);
        const scale = scaleFromMatrix(markup);
        expect(scale).toBeCloseTo(TREND_MIN_SCALE, 6);

        const { box, obstacles } = obstaclesFor(300, 300);
        const slot = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup)!;
        const boxOrigin = { x: Number(slot[1]), y: Number(slot[2]) };
        const expected = fitTrendScale(box.width, box.height, boxOrigin, 90, 1, obstacles);
        expect(expected.fits).toBe(false); // confirmado independientemente: ni el piso libra los obstáculos
        expect(markup).not.toContain("clip-path"); // sin recorte, aunque no quepa del todo
    });

    it("nunca agrega clip-path (ni en el grupo de la serie ni en el de la ranura), quepa o no", () => {
        for (const angle of [0, 15, 30, 45, 90, 135, 180, -45]) {
            const markup = render({ ...settings, trendAngle: angle } as GaugeSettings);
            expect(markup, `angle=${angle}`).not.toContain("clip-path");
        }
    });
});

/**
 * Reviewer B1 (seguimiento) — el fix de colisión por BORDE (no sólo esquinas, ver trendFit.ts) debe
 * generalizar a los tamaños de tarjeta REALES del reporte, no sólo al fixture sintético 300×300: 430×338
 * (4 medidores en fila, "poa_inicio") y 430×268 (1 medidor grande, "poa_subdireccion"/"poa_energia_limpia"
 * — ver el diagnóstico de ancho en layout.ts, computeInnerTrendBox). En ambos, `fitTrendScale` debe seguir
 * coincidiendo exactamente con la misma fuente que usa Gauge.tsx (nunca un cálculo paralelo a mano) y
 * nunca reportar `fits:true` a una escala que en realidad colisiona por el borde.
 */
describe("Gauge — homotecia anticolisión en tamaños de tarjeta reales del reporte (430×338 y 430×268)", () => {
    for (const [width, height] of [
        [430, 338],
        [430, 268],
    ] as const) {
        describe(`tarjeta ${width}×${height}`, () => {
            it("ángulo 0: la caja automática ya es segura por construcción, sin transform (regresión exacta)", () => {
                const markup = render(settings, width, height);
                expect(markup).toContain('class="trend-sparkline">');
                expect(scaleFromMatrix(markup)).toBeNull();
            });

            it.each([15, 30, 45, 75, 90, -30, -75, 135, 180])("rotar %s°: la escala coincide exactamente con fitTrendScale (misma fuente que Gauge.tsx) y nunca excede lo que el borde realmente libra", (angle) => {
                const rotated = { ...settings, trendAngle: angle } as GaugeSettings;
                const markup = render(rotated, width, height);
                const scale = scaleFromMatrix(markup);

                const { box, obstacles } = obstaclesFor(width, height);
                const slot = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup)!;
                const boxOrigin = { x: Number(slot[1]), y: Number(slot[2]) };
                const expected = fitTrendScale(box.width, box.height, boxOrigin, angle, 1, obstacles);

                if (expected.scale === 1 && expected.fits) {
                    // Sin reducción: Gauge.tsx no emite matrix (regresión visual exacta, igual que ángulo 0).
                    expect(scale).toBeNull();
                } else {
                    expect(scale).not.toBeNull();
                    expect(scale as number).toBeCloseTo(expected.scale, 3);
                }
                expect(expected.scale).toBeGreaterThanOrEqual(TREND_MIN_SCALE);
                expect(expected.scale).toBeLessThanOrEqual(1);
                expect(markup).not.toContain("clip-path"); // nunca se recorta, quepa o no
            });
        });
    }
});
