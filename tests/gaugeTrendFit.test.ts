import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gauge from "../src/components/Gauge";
import { GaugeData, GaugeSettings } from "../src/components/types";
import { buildTrendDrawnShapes, TrendPoint } from "../src/components/trend";
import { computeGaugeFrame, computeInnerTrendBox } from "../src/components/layout";
import { bandRadii, semaphoreIndicatorRing } from "../src/components/arcUtils";
import {
    fitTrendAngleAndScaleForShapes,
    TREND_MAX_ANGLE_DEG,
    TREND_MIN_SCALE,
    TREND_SAFETY_CLEARANCE,
    TrendArcObstacle,
} from "../src/components/trendFit";
import { resolveTrendBoxFromPercentOverrides } from "../src/components/trendBoxPercent";
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

/** `scale`/ángulo (grados) reales de un matrix(a,b,c,d,e,f): la escala es la norma de la primera
 * columna (a,b); el ángulo se recupera con atan2(-b,a) (coherente con trendTransformCoefficients). Sin
 * matrix (identidad, sin reducción/recorte): {scale:1, angleDeg:0}. */
function transformFromMatrix(markup: string): { scale: number; angleDeg: number } {
    const m = /class="trend-sparkline" transform="matrix\(([^)]+)\)"/.exec(markup);
    if (!m) return { scale: 1, angleDeg: 0 };
    const [a, b] = m[1].split(",").map(Number);
    const scale = Math.hypot(a, b);
    const angleDeg = scale === 0 ? 0 : (Math.atan2(-b, a) * 180) / Math.PI;
    return { scale, angleDeg };
}

/**
 * Reconstruye, de forma independiente, exactamente lo que Gauge.tsx usa para la homotecia: la caja
 * automática (computeInnerTrendBox — chartType por omisión "lineDots", no "bars", así que no necesita
 * computeInnerTrendBoxForChartType/holgura extra, ver trend.ts), la geometría REAL dibujada
 * (buildTrendDrawnShapes, misma fuente que TrendSparkline.tsx) y los 2 obstáculos que Gauge.tsx dibuja de
 * verdad con esta configuración (showRanges=true y semáforo resuelto no nulo en baseline.markers/withTrend,
 * así que el anillo del semáforo SIEMPRE aplica aquí, igual que la banda): banda (+ sobresaliente de
 * marcadores) y anillo del indicador. Incluye el mismo margen de seguridad (`TREND_SAFETY_CLEARANCE`)
 * que Gauge.tsx exige en su fitter de producción.
 *
 * 0.4.1.1 — fix QA rotación 30°/Barras (DICTAMEN-QA.md): Gauge.tsx ya NO prueba el rectángulo NOMINAL de
 * la caja (`fitTrendScale`, insuficiente para "bars") sino la geometría REAL (`fitTrendScaleForShapes`),
 * y además AJUSTA el ángulo cuando esa escala no basta (`fitTrendAngleAndScaleForShapes`, fix FINAL
 * autorizado por el usuario: LIMITAR el ángulo en vez de tolerar la colisión) — esta suite (chartType
 * por omisión "lineDots") se adapta a esa misma fuente en vez de duplicar un cálculo que ya no es el que
 * usa producción.
 */
function obstaclesFor(width: number, height: number) {
    const gaugeHeight = height - 40; // FOOTER_HEIGHT
    const frame = computeGaugeFrame(width, gaugeHeight, settings.thickness, settings.startAngle, settings.endAngle, true);
    const { innerRadius, outerRadius } = bandRadii(frame.radius, settings.thickness);
    const box = computeInnerTrendBox(frame.radius, settings.thickness, settings.startAngle, settings.endAngle, width, settings.showRanges)!;
    const ring = semaphoreIndicatorRing(innerRadius, settings.thickness);
    const band: TrendArcObstacle = {
        center: { x: width / 2, y: frame.cy },
        innerRadius,
        outerRadius: outerRadius + 11, // MARKER_OVERHANG
        startAngle: settings.startAngle,
        endAngle: settings.endAngle,
    };
    const ringArc: TrendArcObstacle = {
        center: { x: width / 2, y: frame.cy },
        innerRadius: ring.innerRadius,
        outerRadius: ring.outerRadius,
        startAngle: settings.startAngle,
        endAngle: settings.endAngle,
    };
    return {
        frame,
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

/** Misma geometría REAL (polígonos/círculos) que Gauge.tsx construye para `withTrend` sobre una caja dada
 * — chartType por omisión "lineDots" (settings sin tocar `trendChartType`). */
function shapesFor(boxWidth: number, boxHeight: number) {
    return buildTrendDrawnShapes({ points: trend, width: boxWidth, height: boxHeight, currentIndex: 2 });
}

describe("Gauge — homotecia automática anticolisión del gráfico de tendencia (reducir escala/ajustar ángulo sin mover X,Y ni el pivote)", () => {
    it("ángulo 0 (comportamiento 0.3.x/0.4.0.0): la caja ya es segura por construcción, nunca se reduce (sin transform)", () => {
        const markup = render(settings);
        expect(markup).toContain('class="trend-sparkline">'); // sin matrix ni rotate: scale=1, angle=0
        expect(transformFromMatrix(markup)).toEqual({ scale: 1, angleDeg: 0 });
    });

    /**
     * 0.4.1.1 (fix FINAL, recorte de ángulo) — `trendAngle=15°` excede ±TREND_MAX_ANGLE_DEG (8°): el
     * ÁNGULO EFECTIVAMENTE dibujado queda recortado a 8° (nunca 15°), y la escala se reduce lo necesario
     * (si hace falta) para que esa caja, YA al ángulo recortado, libre todos los obstáculos — ambos
     * valores calculados por la MISMA fuente que Gauge.tsx usa, nunca a mano.
     */
    it("trendAngle=15° excede ±A: Gauge.tsx recorta el ángulo efectivo a ±TREND_MAX_ANGLE_DEG y ajusta la escala en consecuencia, sin mover X/Y", () => {
        const rotated = { ...settings, trendAngle: 15 } as GaugeSettings;
        const markup = render(rotated);
        const { scale, angleDeg } = transformFromMatrix(markup);
        expect(Math.abs(angleDeg)).toBeLessThanOrEqual(TREND_MAX_ANGLE_DEG + 0.01); // nunca excede el límite global.
        expect(scale).toBeGreaterThan(0);
        expect(scale).toBeLessThanOrEqual(1);

        // La posición (traslación del <g class="gauge-trend-slot">) no cambia: sigue calculada por
        // computeInnerTrendBox/computeGaugeFrame exactamente igual que sin rotar — sólo el ángulo/escala
        // del contenido (matrix dentro de "trend-sparkline") cambian.
        const slotRotated = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup);
        const slotBaseline = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(render(settings));
        expect(slotRotated![1]).toBe(slotBaseline![1]);
        expect(slotRotated![2]).toBe(slotBaseline![2]);

        // Coincide con fitTrendAngleAndScaleForShapes llamada con la misma geometría/obstáculos (misma
        // fuente, no duplicada a mano): verifica que Gauge.tsx de verdad delega en trendFit.ts.
        const { box, obstacles } = obstaclesFor(300, 300);
        const boxOrigin = { x: Number(slotRotated![1]), y: Number(slotRotated![2]) };
        const shapes = shapesFor(box.width, box.height);
        const expected = fitTrendAngleAndScaleForShapes(box.height, boxOrigin, 15, 1, shapes, obstacles);
        expect(expected.fits).toBe(true);
        expect(angleDeg).toBeCloseTo(expected.angle, 2);
        expect(scale).toBeCloseTo(expected.scale, 3);
    });

    it("trendAngle=90° (muy por encima de ±A): se recorta igual a ±TREND_MAX_ANGLE_DEG; nunca se recorta el contenido con clip-path, sea cual sea el resultado de la homotecia a ese ángulo", () => {
        const rotated = { ...settings, trendAngle: 90 } as GaugeSettings;
        const markup = render(rotated);
        const { scale, angleDeg } = transformFromMatrix(markup);
        expect(Math.abs(angleDeg)).toBeLessThanOrEqual(TREND_MAX_ANGLE_DEG + 0.01);

        const { box, obstacles } = obstaclesFor(300, 300);
        const slot = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup)!;
        const boxOrigin = { x: Number(slot[1]), y: Number(slot[2]) };
        const shapes = shapesFor(box.width, box.height);
        const expected = fitTrendAngleAndScaleForShapes(box.height, boxOrigin, 90, 1, shapes, obstacles);
        expect(angleDeg).toBeCloseTo(expected.angle, 2);
        expect(scale).toBeCloseTo(expected.scale, 3);
        expect(markup).not.toContain("clip-path"); // sin recorte, aunque el ángulo pedido no quepa tal cual.
    });

    it("nunca agrega clip-path (ni en el grupo de la serie ni en el de la ranura), quepa o no, para cualquier ángulo pedido", () => {
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
 * — ver el diagnóstico de ancho en layout.ts, computeInnerTrendBox). En ambos, `fitTrendAngleAndScaleForShapes`
 * debe seguir coincidiendo exactamente con la misma fuente que usa Gauge.tsx (nunca un cálculo paralelo a
 * mano), nunca reportar una escala que en realidad colisiona por el borde, y nunca emitir un ángulo
 * efectivo fuera de ±TREND_MAX_ANGLE_DEG.
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
                expect(transformFromMatrix(markup)).toEqual({ scale: 1, angleDeg: 0 });
            });

            it.each([15, 30, 45, 75, 90, -30, -75, 135, 180])("ángulo pedido %s°: el ángulo/escala reales coinciden exactamente con fitTrendAngleAndScaleForShapes (misma fuente que Gauge.tsx), nunca exceden ±TREND_MAX_ANGLE_DEG ni lo que el borde realmente libra", (angle) => {
                const rotated = { ...settings, trendAngle: angle } as GaugeSettings;
                const markup = render(rotated, width, height);
                const { scale, angleDeg } = transformFromMatrix(markup);

                const { box, obstacles } = obstaclesFor(width, height);
                const slot = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup)!;
                const boxOrigin = { x: Number(slot[1]), y: Number(slot[2]) };
                const shapes = shapesFor(box.width, box.height);
                const expected = fitTrendAngleAndScaleForShapes(box.height, boxOrigin, angle, 1, shapes, obstacles);

                if (expected.scale === 1 && expected.angle === 0) {
                    // Sin reducción/recorte: Gauge.tsx no emite matrix (regresión visual exacta, igual que ángulo 0).
                    expect(transformFromMatrix(markup)).toEqual({ scale: 1, angleDeg: 0 });
                } else {
                    expect(scale).toBeCloseTo(expected.scale, 3);
                    // Verificador independiente: margen explícito de 0.01° (en vez de
                    // toBeCloseTo(expected.angle, 2), que exige <0.005°) — la bisección determinista de
                    // fitTrendAngleAndScaleForShapes (50 iteraciones) y el redondeo a 4 decimales del
                    // matrix(...) emitido (MATRIX_PRECISION, trendTransform.ts) pueden diferir hasta
                    // ~0.006° al reconstruir el ángulo con atan2 sobre esos coeficientes redondeados —
                    // ruido de representación del markup, nunca una colisión real (mismo fenómeno que
                    // motivó TREND_SAFETY_CLEARANCE; ver también la tolerancia 0.01° equivalente en
                    // tests/trendRotationMatrixIndependentCollision.test.ts).
                    expect(Math.abs(angleDeg - expected.angle)).toBeLessThanOrEqual(0.01);
                }
                expect(expected.scale).toBeGreaterThanOrEqual(TREND_MIN_SCALE);
                expect(expected.scale).toBeLessThanOrEqual(1);
                expect(Math.abs(expected.angle)).toBeLessThanOrEqual(TREND_MAX_ANGLE_DEG);
                expect(markup).not.toContain("clip-path"); // nunca se recorta, quepa o no.
            });
        });
    }
});

/**
 * 0.4.1.1 — integración: posición/tamaño PERSONALIZADOS de la caja (panel, trendPosX/trendPosY/
 * trendWidth/trendHeight en %, pivote inferior-izquierdo — ver trendBoxPercent.ts), un caso que el
 * límite GLOBAL del ángulo (±TREND_MAX_ANGLE_DEG, determinado sobre posición/tamaño AUTOMÁTICOS, ver
 * JSDoc de TREND_MAX_ANGLE_DEG) no contempla por sí solo: con una caja personalizada,
 * `fitTrendAngleAndScaleForShapes` puede necesitar buscar un ángulo MENOR que ±A, o incluso no hallar
 * ninguno (ni 0° cabe) si el propio PIVOTE (invariante ante cualquier ángulo/escala) ya colisiona con
 * el pie por construcción — Gauge.tsx debe seguir delegando en la MISMA fuente (nunca un cálculo
 * paralelo a mano) y nunca lanzar ni recortar (clip-path) en ningún caso, quepa o no.
 */
describe("Gauge — integración: posición/tamaño PERSONALIZADOS de la caja (panel) y el caso límite donde NI SIQUIERA el ángulo 0° cabe", () => {
    const width = 300;
    const height = 300;

    it("posición/tamaño personalizados razonables: el ángulo/escala reales coinciden con fitTrendAngleAndScaleForShapes evaluada sobre la caja PERSONALIZADA (no la automática)", () => {
        const overrides = { posX: 60, posY: 70, width: 25, height: 12 };
        const custom = { ...settings, trendPosX: overrides.posX, trendPosY: overrides.posY, trendWidth: overrides.width, trendHeight: overrides.height, trendAngle: 6 } as GaugeSettings;
        const markup = render(custom, width, height);
        const { scale, angleDeg } = transformFromMatrix(markup);

        const { frame, box: autoBox, obstacles } = obstaclesFor(width, height);
        const customBox = resolveTrendBoxFromPercentOverrides(autoBox, overrides, { x: frame.cx, y: frame.cy }, { width, height })!;
        const slot = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup)!;
        const boxOrigin = { x: Number(slot[1]), y: Number(slot[2]) };
        const shapes = shapesFor(customBox.width, customBox.height);
        const expected = fitTrendAngleAndScaleForShapes(customBox.height, boxOrigin, 6, 1, shapes, obstacles);

        if (expected.scale === 1 && expected.angle === 0) {
            expect(transformFromMatrix(markup)).toEqual({ scale: 1, angleDeg: 0 });
        } else {
            expect(scale).toBeCloseTo(expected.scale, 3);
            expect(Math.abs(angleDeg - expected.angle)).toBeLessThanOrEqual(0.01);
        }
        expect(markup).not.toContain("clip-path");
    });

    /**
     * `trendPosY=100%`: el PIVOTE (esquina inferior-izquierda de la caja, el único punto que
     * trendTransform.ts mantiene fijo ante cualquier ángulo/escala) queda exactamente en el borde
     * inferior del viewport (y = height), por debajo del pie (footerTop = height − 40 = 260 en un
     * viewport de 300×300) — ninguna reducción de escala ni de ángulo puede corregirlo, porque el
     * propio pivote NUNCA se mueve. `chartType="bars"` garantiza que la base de cada barra se dibuja
     * pegada al borde inferior de la caja (misma fila que el pivote), así que la colisión es real
     * independientemente del dominio Y/los valores concretos de la serie.
     */
    it("trendPosY=100% (pivote en el borde inferior, por debajo del pie): ni siquiera el ángulo 0° cabe — Gauge.tsx documenta fits:false (ángulo 0, escala en el piso TREND_MIN_SCALE), nunca lanza ni recorta", () => {
        const overrides = { posX: 50, posY: 100, width: 20, height: 10 };
        const custom = {
            ...settings,
            trendChartType: "bars",
            trendPosX: overrides.posX, trendPosY: overrides.posY, trendWidth: overrides.width, trendHeight: overrides.height,
            trendAngle: 5,
        } as GaugeSettings;

        expect(() => render(custom, width, height)).not.toThrow();
        const markup = render(custom, width, height);
        const { scale, angleDeg } = transformFromMatrix(markup);

        expect(angleDeg).toBeCloseTo(0, 9); // la búsqueda determinista no halla NINGÚN ángulo (ni 0°) que libre el pie (atan2 puede devolver -0, equivalente a 0).
        expect(scale).toBeCloseTo(TREND_MIN_SCALE, 6); // igualmente documenta el piso, sin forzar un ajuste imposible.
        expect(markup).not.toContain("clip-path"); // nunca se recorta, quepa o no.

        // Verificación independiente, misma fuente que Gauge.tsx (nunca un cálculo paralelo a mano).
        const { frame, box: autoBox, obstacles } = obstaclesFor(width, height);
        const customBox = resolveTrendBoxFromPercentOverrides(autoBox, overrides, { x: frame.cx, y: frame.cy }, { width, height })!;
        const slot = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup)!;
        const boxOrigin = { x: Number(slot[1]), y: Number(slot[2]) };
        const shapes = buildTrendDrawnShapes({ points: trend, width: customBox.width, height: customBox.height, chartType: "bars", currentIndex: 2 });
        const expected = fitTrendAngleAndScaleForShapes(customBox.height, boxOrigin, 5, 1, shapes, obstacles);
        expect(expected).toEqual({ angle: 0, scale: TREND_MIN_SCALE, fits: false });

        // El pivote absoluto (invariante) queda, en efecto, por debajo del pie — la causa raíz documentada.
        expect(boxOrigin.y + customBox.height).toBeGreaterThan(height - 40);
    });
});
