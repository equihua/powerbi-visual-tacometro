import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gauge from "../src/components/Gauge";
import { GaugeData, GaugeSettings } from "../src/components/types";
import { buildTrendDrawnShapes, computeInnerTrendBoxForChartType, TrendChartType, TrendPoint } from "../src/components/trend";
import { computeGaugeFrame } from "../src/components/layout";
import { bandRadii, semaphoreIndicatorRing } from "../src/components/arcUtils";
import { fitTrendAngleAndScaleForShapes, TREND_MAX_ANGLE_DEG, TREND_MIN_SCALE, TREND_SAFETY_CLEARANCE, TrendArcObstacle } from "../src/components/trendFit";
import { baseline } from "./fixtures/gaugeBaseline020";

/**
 * 0.4.1.1 — matriz EXPLÍCITA de regresión pedida tras el fix QA rotación 30°/Barras (DICTAMEN-QA.md):
 * tamaño de tarjeta × ángulo × chartType × Programado visible/oculto. Cubre las 2 tarjetas REALES del
 * reporte (430×338 "4 en fila", 430×268 "1 grande", ver layout.ts/computeInnerTrendBox), los ángulos
 * pedidos explícitamente (0°, 15°, 30°, 45°, 90°, -30°), los 4 `chartType` (lineDots/line/bars/area) y
 * `trendShowProgrammed` true/false — 2×6×4×2 = 96 combinaciones, cada una verificada de forma
 * INDEPENDIENTE del mecanismo bajo prueba:
 *  1. El render no lanza, siempre dibuja la sparkline, nunca un `clip-path` (nunca se recorta el
 *     contenido para disimular que no cabe).
 *  2. El ÁNGULO y la ESCALA reales emitidos en el markup coinciden EXACTAMENTE con
 *     `fitTrendAngleAndScaleForShapes` evaluada a mano con la geometría REAL dibujada
 *     (`buildTrendDrawnShapes`, misma fuente que TrendSparkline.tsx) y los mismos 2 obstáculos que
 *     Gauge.tsx dibuja de verdad (banda + anillo del semáforo), con el mismo margen de seguridad
 *     (`TREND_SAFETY_CLEARANCE`) — así que cualquier regresión futura que haga a Gauge.tsx calcular un
 *     ángulo/escala distintos (y por tanto permitir una colisión real o un recorte innecesario) se
 *     detecta aquí, sin depender de un cálculo paralelo que pudiera divergir.
 *  3. La escala nunca excede 1 ni cae por debajo del piso documentado (`TREND_MIN_SCALE`); el ángulo
 *     emitido nunca excede ±`TREND_MAX_ANGLE_DEG` en magnitud (fix FINAL QA rotación 30°/Barras: con
 *     posición/tamaño AUTOMÁTICOS — este fixture — el recorte de ángulo por sí solo ya basta, nunca hace
 *     falta la búsqueda determinista hacia 0° que sólo entra en juego con cajas PERSONALIZADAS).
 */

const thresholds = { lowThreshold: 80, midThreshold: 95 };
// Serie real tipo TableroMaestro (dev-harness/src/main.ts::POA_SERIES/MONTHS), igual que
// tests/trendBarArcCollision.test.ts: 12 meses, Real hasta Oct (índice 9), Nov/Dic sin Real — así
// "bars"/"area" tienen huecos reales que ejercitar, no una serie sintética sin huecos.
const REAL = [72.1, 78.4, 81.0, 79.5, 85.2, 88.9, 86.3, 90.1, 93.4, 91.47, null, null] as const;
const PROG = [70, 75, 80, 82, 85, 87, 89, 91, 93, 95, 97, 100] as const;
const SEM = ["Rojo", "Rojo", "Amarillo", "Rojo", "Amarillo", "Verde", "Amarillo", "Amarillo", "Verde", "Amarillo", null, null] as const;
const points: TrendPoint[] = REAL.map((real, i) => ({
    label: `m${i}`,
    real,
    programmed: PROG[i],
    semaphore: real !== null ? SEM[i] : null,
    thresholds,
}));
const CURRENT_INDEX = 9;

const DEFAULT_START_ANGLE = -120; // settings.ts: default real del medidor (no el 0.2.0.0 del fixture).
const DEFAULT_END_ANGLE = 60;
const baseSettings = { ...baseline.settings, startAngle: DEFAULT_START_ANGLE, endAngle: DEFAULT_END_ANGLE } as GaugeSettings;

function settingsFor(chartType: TrendChartType, angle: number, showProgrammed: boolean): GaugeSettings {
    return {
        ...baseSettings,
        trendChartType: chartType,
        trendAngle: angle,
        trendShowProgrammed: showProgrammed,
    } as GaugeSettings;
}

function gaugeDataFor(): GaugeData {
    return { ...baseline.markers, trend: points, trendCurrentIndex: CURRENT_INDEX } as GaugeData;
}

function render(s: GaugeSettings, width: number, height: number): string {
    return renderToStaticMarkup(React.createElement(Gauge, { viewport: { width, height }, settings: s, gaugeData: gaugeDataFor() }));
}

/** `scale`/ángulo (grados) reales de un matrix(a,b,c,d,e,f); sin matrix (sin reducción/recorte), {scale:1, angleDeg:0}. */
function transformFromMatrix(markup: string): { scale: number; angleDeg: number } {
    const m = /class="trend-sparkline" transform="matrix\(([^)]+)\)"/.exec(markup);
    if (!m) return { scale: 1, angleDeg: 0 };
    const [a, b] = m[1].split(",").map(Number);
    const scale = Math.hypot(a, b);
    const angleDeg = scale === 0 ? 0 : (Math.atan2(-b, a) * 180) / Math.PI;
    return { scale, angleDeg };
}

/** Caja REAL (chartType-aware) + los 2 obstáculos reales (banda + anillo), misma fuente que Gauge.tsx —
 * con el mismo margen de seguridad (`TREND_SAFETY_CLEARANCE`) que Gauge.tsx aplica en su fitter. */
function obstaclesFor(width: number, height: number, chartType: TrendChartType) {
    const gaugeHeight = height - 40; // FOOTER_HEIGHT (layout.ts)
    const frame = computeGaugeFrame(width, gaugeHeight, baseSettings.thickness, DEFAULT_START_ANGLE, DEFAULT_END_ANGLE, true);
    const { innerRadius, outerRadius } = bandRadii(frame.radius, baseSettings.thickness);
    const box = computeInnerTrendBoxForChartType(
        frame.radius, baseSettings.thickness, DEFAULT_START_ANGLE, DEFAULT_END_ANGLE, width, baseSettings.showRanges, chartType, points.length
    )!;
    const ring = semaphoreIndicatorRing(innerRadius, baseSettings.thickness);
    const band: TrendArcObstacle = {
        center: { x: width / 2, y: frame.cy },
        innerRadius,
        outerRadius: outerRadius + 11, // MARKER_OVERHANG (layout.ts)
        startAngle: DEFAULT_START_ANGLE,
        endAngle: DEFAULT_END_ANGLE,
    };
    const ringArc: TrendArcObstacle = {
        center: { x: width / 2, y: frame.cy },
        innerRadius: ring.innerRadius,
        outerRadius: ring.outerRadius,
        startAngle: DEFAULT_START_ANGLE,
        endAngle: DEFAULT_END_ANGLE,
    };
    return {
        box,
        obstacles: {
            viewportWidth: width,
            viewportHeight: height,
            footerTop: height - 40,
            arc: [band, ringArc] as TrendArcObstacle[],
            clearance: TREND_SAFETY_CLEARANCE,
        },
    };
}

/** Geometría LOCAL real (polígonos/círculos) para una caja/chartType/Programado dados — misma fuente
 * que TrendSparkline.tsx usa para dibujar. */
function shapesFor(boxWidth: number, boxHeight: number, chartType: TrendChartType, showProgrammed: boolean) {
    return buildTrendDrawnShapes({
        points, width: boxWidth, height: boxHeight, chartType, currentIndex: CURRENT_INDEX, showProgrammed,
    });
}

const SIZES: Array<[number, number]> = [[430, 338], [430, 268]];
const ANGLES = [0, 15, 30, 45, 90, -30];
const CHART_TYPES: TrendChartType[] = ["lineDots", "line", "bars", "area"];
const PROGRAMMED = [true, false];

describe("Gauge — matriz explícita 0.4.1.1 (tamaño × ángulo × chartType × Programado): ángulo/escala reales sin colisión, nunca clip-path", () => {
    for (const [width, height] of SIZES) {
        describe(`tarjeta ${width}×${height}`, () => {
            for (const chartType of CHART_TYPES) {
                for (const showProgrammed of PROGRAMMED) {
                    describe(`chartType=${chartType} showProgrammed=${showProgrammed}`, () => {
                        it.each(ANGLES)("ángulo pedido %s°: dibuja la sparkline, nunca recorta, y el ángulo/escala reales coinciden con fitTrendAngleAndScaleForShapes (misma fuente que Gauge.tsx)", (angle) => {
                            const settings = settingsFor(chartType, angle, showProgrammed);
                            const markup = render(settings, width, height);

                            expect(markup).toContain('class="trend-sparkline"');
                            expect(markup).not.toContain("clip-path");

                            const { scale, angleDeg } = transformFromMatrix(markup);
                            const { box, obstacles } = obstaclesFor(width, height, chartType);
                            const slot = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup)!;
                            const boxOrigin = { x: Number(slot[1]), y: Number(slot[2]) };
                            const shapes = shapesFor(box.width, box.height, chartType, showProgrammed);
                            const expected = fitTrendAngleAndScaleForShapes(box.height, boxOrigin, angle, 1, shapes, obstacles);

                            expect(expected.scale).toBeGreaterThanOrEqual(TREND_MIN_SCALE);
                            expect(expected.scale).toBeLessThanOrEqual(1);
                            expect(Math.abs(expected.angle)).toBeLessThanOrEqual(TREND_MAX_ANGLE_DEG);
                            // Sin atributo matrix, Gauge.tsx no reduce/recorta (ángulo 0, escala efectiva 1);
                            // con atributo, el ángulo/escala reales emitidos deben coincidir con
                            // fitTrendAngleAndScaleForShapes (misma fuente) — tolerancia 0.01° por el
                            // redondeo de MATRIX_PRECISION (trendTransform.ts), ver trendRotationMatrixIndependentCollision.test.ts.
                            expect(scale).toBeCloseTo(expected.scale, 3);
                            expect(angleDeg).toBeCloseTo(expected.angle, 2);
                        });
                    });
                }
            }
        });
    }
});
