import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gauge from "../src/components/Gauge";
import { GaugeData, GaugeSettings } from "../src/components/types";
import { buildTrendDrawnShapes, computeInnerTrendBoxForChartType, TrendChartType, TrendPoint } from "../src/components/trend";
import { computeGaugeFrame } from "../src/components/layout";
import { bandRadii, semaphoreIndicatorRing } from "../src/components/arcUtils";
import {
    arcRepresentativePoint,
    pointDistanceToAnnularSector,
    pointInConvexPolygon,
    segmentDistanceToAnnularSector,
    TREND_MAX_ANGLE_DEG,
    TrendArcObstacle,
} from "../src/components/trendFit";
import { applyTrendTransform, Point } from "../src/components/trendTransform";
import { baseline } from "./fixtures/gaugeBaseline020";

/**
 * 0.4.1.1 (fix FINAL QA rotación 30°/Barras, DICTAMEN-QA.md — autorizado por el usuario: LIMITAR el
 * ángulo cuando la homotecia de escala no basta) — reescritura COMPLETA de esta matriz tras el hallazgo
 * documentado en la versión anterior de este archivo: 53 de 96 combinaciones (ángulos ±30°/45°/90°/−30°)
 * SÍ colisionaban con el arco a la escala realmente emitida, porque el piso `TREND_MIN_SCALE` (30%) no
 * bastaba para separar la geometría REAL del arco a esas magnitudes de ángulo.
 *
 * La corrección final no toca `TREND_MIN_SCALE` ni el padding/holgura de la caja automática (cambios de
 * mayor alcance, fuera de autorización): en vez de eso, `Gauge.tsx` ahora LIMITA el ángulo efectivamente
 * dibujado — `fitTrendAngleAndScaleForShapes` (trendFit.ts) recorta el ángulo pedido a
 * ±`TREND_MAX_ANGLE_DEG` y, si ni así libra los obstáculos (posición/tamaño personalizados), busca de
 * forma determinista hacia 0° el mayor ángulo que sí libre, sin mover X/Y ni el pivote.
 * `TREND_MAX_ANGLE_DEG` (8°) se determinó EMPÍRICAMENTE barriendo estas mismas 16 combinaciones de
 * tamaño/chartType/Programado (posición/tamaño AUTOMÁTICOS) a cada ángulo entero — ver su JSDoc en
 * trendFit.ts para la evidencia completa (incluida la asimetría +21°/−9° que explica por qué el límite
 * simétrico final es 8° y no los ~15° estimados inicialmente).
 *
 * Esta matriz AHORA exige CERO colisiones en las 11 × 16 = 176 combinaciones (2 tamaños × 4 chartType ×
 * Programado visible/oculto × 11 ángulos: 0°, ±5°, ±10°, ±A (±8°), 30°, 45°, 90°, −30°) — los ángulos
 * ±30°/45°/90°/−30° YA NO colisionan porque Gauge.tsx los recorta a ±8° antes de dibujar; ±10° tampoco
 * colisiona por la misma razón (recortado a ±8°); 0°/±5°/±8° están DENTRO del límite global y nunca lo
 * necesitaron. `KNOWN_COLLIDING_CASES`/`EXPECTED_COLLISIONS` de la versión anterior se ELIMINA por
 * completo: ya no hay ninguna colisión documentada que tolerar.
 *
 * La verificación de colisión sigue siendo COMPLETAMENTE INDEPENDIENTE de `fitTrendScaleForShapes`/
 * `fitTrendAngleAndScaleForShapes` (no importa `shapesClear`/`polygonClearsArc`/`circleClearsArc`, no
 * exportadas de trendFit.ts, precisamente para que nada fuera de ese módulo pueda heredar un bug de
 * cableado suyo) — reutiliza las primitivas geométricas de bajo nivel ya exportadas y probadas por
 * separado (`segmentDistanceToAnnularSector`, `pointDistanceToAnnularSector`, `pointInConvexPolygon`,
 * `arcRepresentativePoint`, ver tests/trendFit.test.ts), con `clearance = 0` — SIN el margen de 0.5px
 * (`TREND_SAFETY_CLEARANCE`) que el FITTER de producción exige de más: este archivo mide la colisión
 * REAL tal cual es, nunca con el margen de seguridad adicional que el fitter ya aplicó de su lado.
 *
 * Diferencia clave con `tests/trendRotationMatrix.test.ts` (que SÍ llama a `fitTrendAngleAndScaleForShapes`
 * para verificar que Gauge.tsx de verdad delega en trendFit.ts, no en un cálculo paralelo): este archivo
 * extrae el ÁNGULO y la ESCALA REALMENTE emitidos del propio markup (`matrix(a,b,c,d,e,f)`:
 * `scale = hypot(a,b)`, `angle = atan2(-b,a)`) y transforma la geometría LOCAL real
 * (`buildTrendDrawnShapes`) con esos valores — nunca asume que el ángulo dibujado es el pedido en
 * `settings.trendAngle` (ya no lo es, en general, por el recorte).
 */

const KNOWN_COLLIDING_CASES = new Set<string>(); // 0.4.1.1: ninguna colisión documentada — ver JSDoc arriba.

const thresholds = { lowThreshold: 80, midThreshold: 95 };
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

const DEFAULT_START_ANGLE = -120;
const DEFAULT_END_ANGLE = 60;
const baseSettings = { ...baseline.settings, startAngle: DEFAULT_START_ANGLE, endAngle: DEFAULT_END_ANGLE } as GaugeSettings;

function settingsFor(chartType: TrendChartType, angle: number, showProgrammed: boolean): GaugeSettings {
    return { ...baseSettings, trendChartType: chartType, trendAngle: angle, trendShowProgrammed: showProgrammed } as GaugeSettings;
}

function gaugeDataFor(): GaugeData {
    return { ...baseline.markers, trend: points, trendCurrentIndex: CURRENT_INDEX } as GaugeData;
}

function render(s: GaugeSettings, width: number, height: number): string {
    return renderToStaticMarkup(React.createElement(Gauge, { viewport: { width, height }, settings: s, gaugeData: gaugeDataFor() }));
}

/** Escala Y ÁNGULO (grados) REALMENTE emitidos por el `matrix(a,b,c,d,e,f)`; sin atributo (identidad), {scale:1, angleDeg:0}. */
function transformFromMarkup(markup: string): { scale: number; angleDeg: number } {
    const m = /class="trend-sparkline" transform="matrix\(([^)]+)\)"/.exec(markup);
    if (!m) return { scale: 1, angleDeg: 0 };
    const [a, b] = m[1].split(",").map(Number);
    const scale = Math.hypot(a, b);
    const angleDeg = scale === 0 ? 0 : (Math.atan2(-b, a) * 180) / Math.PI;
    return { scale, angleDeg };
}

/** Caja REAL (chartType-aware) + los 2 obstáculos reales (banda + anillo), misma fuente que Gauge.tsx. */
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
    return { box, footerTop: height - 40, arcs: [band, ringArc] as TrendArcObstacle[] };
}

/** Geometría LOCAL real (polígonos/círculos), misma fuente que TrendSparkline.tsx usa para dibujar. */
function shapesFor(boxWidth: number, boxHeight: number, chartType: TrendChartType, showProgrammed: boolean) {
    return buildTrendDrawnShapes({ points, width: boxWidth, height: boxHeight, chartType, currentIndex: CURRENT_INDEX, showProgrammed });
}

/**
 * Implementación INDEPENDIENTE (no importada de trendFit.ts) de "¿el polígono libra la corona del
 * arco?": por borde (ningún borde puede atravesar el sector anular) y, si todos los bordes libran,
 * comprobando que la corona no esté ENTERA encerrada dentro del polígono (su punto representativo no
 * puede caer dentro). `clearance = 0`: sin holgura alguna, para medir la colisión real tal cual es.
 */
function polygonClearsArcIndependently(corners: Point[], arc: TrendArcObstacle): boolean {
    const edgesClear = corners.every((corner, i) => {
        const next = corners[(i + 1) % corners.length];
        const p: Point = { x: corner.x - arc.center.x, y: corner.y - arc.center.y };
        const q: Point = { x: next.x - arc.center.x, y: next.y - arc.center.y };
        return segmentDistanceToAnnularSector(p, q, arc.innerRadius, arc.outerRadius, arc.startAngle, arc.endAngle) > 0;
    });
    if (!edgesClear) return false;
    return !pointInConvexPolygon(arcRepresentativePoint(arc), corners);
}

/** Análogo a `polygonClearsArcIndependently`, para un círculo (convexo: basta la distancia centro→sector). */
function circleClearsArcIndependently(circle: { center: Point; radius: number }, arc: TrendArcObstacle): boolean {
    const relative: Point = { x: circle.center.x - arc.center.x, y: circle.center.y - arc.center.y };
    return pointDistanceToAnnularSector(relative, arc.innerRadius, arc.outerRadius, arc.startAngle, arc.endAngle) > circle.radius;
}

/** Libra el viewport y el pie: cada esquina/círculo dentro de [0,width]x[0,height] y por encima del pie. */
function clearsViewportAndFooter(
    shapes: { polygons: Point[][]; circles: { center: Point; radius: number }[] },
    width: number,
    footerTop: number
): boolean {
    const polysOk = shapes.polygons.every((poly) =>
        poly.every((corner) => corner.x >= 0 && corner.x <= width && corner.y >= 0 && corner.y <= footerTop)
    );
    const circlesOk = shapes.circles.every(
        (circle) =>
            circle.center.x - circle.radius >= 0 &&
            circle.center.x + circle.radius <= width &&
            circle.center.y - circle.radius >= 0 &&
            circle.center.y + circle.radius <= footerTop
    );
    return polysOk && circlesOk;
}

/** ¿Colisiona la geometría absoluta con el viewport/pie o con ALGÚN arco? Sin holgura (`clearance = 0`). */
function collidesIndependently(
    absoluteShapes: { polygons: Point[][]; circles: { center: Point; radius: number }[] },
    width: number,
    footerTop: number,
    arcs: TrendArcObstacle[]
): boolean {
    if (!clearsViewportAndFooter(absoluteShapes, width, footerTop)) return true;
    return arcs.some(
        (arc) =>
            absoluteShapes.polygons.some((polygon) => !polygonClearsArcIndependently(polygon, arc)) ||
            absoluteShapes.circles.some((circle) => !circleClearsArcIndependently(circle, arc))
    );
}

const SIZES: Array<[number, number]> = [[430, 338], [430, 268]];
// 0.4.1.1 — 11 ángulos (0, ±5, ±10, ±A, 30, 45, 90, −30): A = TREND_MAX_ANGLE_DEG (8°, ver JSDoc del
// archivo). Los 4 ángulos "extremos" (30/45/90/−30) y ±10 están fuera de ±A a propósito — ejercitan el
// RECORTE de Gauge.tsx (deben renderizar en realidad a ±A, nunca a su valor nominal).
const ANGLES = [0, 5, -5, 10, -10, TREND_MAX_ANGLE_DEG, -TREND_MAX_ANGLE_DEG, 30, 45, 90, -30];
const CHART_TYPES: TrendChartType[] = ["lineDots", "line", "bars", "area"];
const PROGRAMMED = [true, false];

describe("Gauge — matriz 0.4.1.1 (176 combinaciones): verificación INDEPENDIENTE de no-colisión a escala/ángulo REALMENTE emitidos, tras el recorte de ángulo", () => {
    for (const [width, height] of SIZES) {
        describe(`tarjeta ${width}×${height}`, () => {
            for (const chartType of CHART_TYPES) {
                for (const showProgrammed of PROGRAMMED) {
                    describe(`chartType=${chartType} showProgrammed=${showProgrammed}`, () => {
                        it.each(ANGLES)(
                            "ángulo pedido %s°: la geometría REAL, al ÁNGULO/ESCALA REALMENTE emitidos (tras el recorte de Gauge.tsx), NUNCA colisiona — verificado con primitivas de distancia independientes, nunca con fitTrendScaleForShapes/fitTrendAngleAndScaleForShapes",
                            (angle) => {
                                const settings = settingsFor(chartType, angle, showProgrammed);
                                const markup = render(settings, width, height);

                                const { scale: emittedScale, angleDeg: emittedAngle } = transformFromMarkup(markup);
                                // Tolerancia 0.01°: el redondeo del `matrix(...)` emitido (MATRIX_PRECISION=4
                                // decimales, trendTransform.ts) introduce un error angular sub-milésima al
                                // reconstruir el ángulo con atan2 — nunca una colisión real, sólo ruido de
                                // representación del markup (mismo fenómeno que motivó TREND_SAFETY_CLEARANCE).
                                expect(Math.abs(emittedAngle)).toBeLessThanOrEqual(TREND_MAX_ANGLE_DEG + 0.01); // el recorte SIEMPRE se respeta.

                                const slot = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup)!;
                                const boxOrigin: Point = { x: Number(slot[1]), y: Number(slot[2]) };
                                const { box, footerTop, arcs } = obstaclesFor(width, height, chartType);
                                const localShapes = shapesFor(box.width, box.height, chartType, showProgrammed);

                                const absoluteShapes = {
                                    polygons: localShapes.polygons.map((polygon) =>
                                        polygon.map((corner) => {
                                            const t = applyTrendTransform(corner, box.height, emittedAngle, emittedScale);
                                            return { x: boxOrigin.x + t.x, y: boxOrigin.y + t.y };
                                        })
                                    ),
                                    circles: localShapes.circles.map((circle) => {
                                        const t = applyTrendTransform(circle.center, box.height, emittedAngle, emittedScale);
                                        return { center: { x: boxOrigin.x + t.x, y: boxOrigin.y + t.y }, radius: circle.radius * emittedScale };
                                    }),
                                };

                                const collides = collidesIndependently(absoluteShapes, width, footerTop, arcs);
                                const key = `${width},${height},${chartType},${showProgrammed},${angle}`;
                                if (KNOWN_COLLIDING_CASES.has(key)) {
                                    // 0.4.1.1: la lista está VACÍA a propósito (ver JSDoc) — esta rama es inalcanzable
                                    // salvo que alguien reintroduzca una excepción sin autorización.
                                    expect(collides).toBe(true);
                                } else {
                                    expect(collides).toBe(false);
                                }
                            }
                        );
                    });
                }
            }
        });
    }

    it("ninguna colisión documentada (KNOWN_COLLIDING_CASES vacío): si alguna combinación colisionara, la prueba de arriba debe fallar, nunca absorberse aquí en silencio", () => {
        expect(KNOWN_COLLIDING_CASES.size).toBe(0);
    });
});
