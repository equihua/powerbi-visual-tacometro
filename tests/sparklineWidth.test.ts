import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gauge from "../src/components/Gauge";
import { GaugeData, GaugeSettings } from "../src/components/types";
import { TrendPoint } from "../src/components/trend";
import { computeGaugeFrame, FOOTER_GAP, FOOTER_HEIGHT, TREND_EDGE_CLEARANCE } from "../src/components/layout";
import { bandRadii, semaphoreIndicatorRing } from "../src/components/arcUtils";
import { baseline } from "./fixtures/gaugeBaseline020";

// 0.3.3.0: la sparkline mensual ocupa todo el ancho útil de la abertura interior del medidor, sin salir del
// círculo interior y sin invadir el pie (anclado abajo), en tarjeta ancha (480x300) y compacta (220x200).
// 0.3.3.1: ancho máximo seguro por contenido: además del círculo interior, ningún punto toca el anillo del
// indicador del semáforo (dentro de la banda) en el barrido del arco; con -120°..60° es más ancha que 0.3.3.0.
const settings = baseline.settings as GaugeSettings;
const thresholds = { lowThreshold: 80, midThreshold: 95 };
const REAL = [72.1, 78.4, 81.0, 79.5, 85.2, 88.9, 86.3, 90.1, 93.4, 91.47];
const trend: TrendPoint[] = REAL.map((real, i) => ({ label: `M${i + 1}`, real, programmed: 70 + i * 3, semaphore: null, thresholds }));
// Semáforo «Rojo» en el mes actual: el anillo del indicador se dibuja (es el arco que no debe tocarse).
const data = { ...baseline.markers, trend, trendCurrentIndex: 9, previousMonth: 93.4, semaphore: "Rojo" } as GaugeData;
/** Relleno interno de TrendSparkline: los puntos extremos están a PADDING de los bordes de la caja. */
const PADDING = 6;

describe("TrendSparkline 0.3.3.1 — ancho máximo seguro dentro de la abertura interior", () => {
    for (const [width, height] of [[480, 300], [220, 200], [300, 300]]) {
        for (const [startAngle, endAngle] of [[-90, 90], [-120, 60], [-135, 135]]) {
            it(`${width}x${height} (${startAngle}°..${endAngle}°): puntos dentro del círculo, fuera del anillo del semáforo y sobre el pie`, () => {
                const s = { ...settings, startAngle, endAngle };
                const markup = renderToStaticMarkup(
                    React.createElement(Gauge, { viewport: { width, height }, settings: s, gaugeData: data })
                );
                const frame = computeGaugeFrame(width, height - FOOTER_HEIGHT, s.thickness, startAngle, endAngle, true, s.fontSize);
                const inner = bandRadii(frame.radius, s.thickness).innerRadius;
                const cx = width / 2;
                const cy = Math.round(frame.cy * 100) / 100;
                const slot = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup);
                expect(slot).not.toBeNull();
                const circles = [...markup.matchAll(/<circle class="trend-point[^"]*"[^>]*cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/g)].map(
                    ([, x, y, r]) => ({ x: Number(slot![1]) + Number(x), y: Number(slot![2]) + Number(y), r: Number(r) })
                );
                expect(circles.length).toBe(REAL.length);

                // Dentro del círculo interior (con el radio del punto) donde el barrido SÍ dibuja la banda
                // (0.3.5.0: fuera del barrido un punto puede superar `inner` con seguridad — ver layout.ts),
                // y siempre por debajo del centro (bajo el número) y dentro del ancho de la tarjeta.
                for (const c of circles) {
                    const deg = (Math.atan2(c.x - cx, -(c.y - cy)) * 180) / Math.PI;
                    if (deg >= startAngle && deg <= endAngle) {
                        expect(Math.hypot(c.x - cx, c.y - cy) + c.r).toBeLessThan(inner);
                    }
                    expect(c.x).toBeGreaterThan(0);
                    expect(c.x).toBeLessThan(width);
                    expect(c.y).toBeGreaterThan(cy);
                }
                // Sin invadir el pie: el punto más bajo queda por encima de footer.y − FOOTER_GAP.
                const lowest = Math.max(...circles.map((c) => c.y + c.r));
                expect(lowest).toBeLessThanOrEqual(height - FOOTER_HEIGHT - FOOTER_GAP + 0.01);

                // 0.3.3.1: fuera del anillo del indicador del semáforo (con holgura) dentro del barrido del arco.
                const ring = semaphoreIndicatorRing(inner, s.thickness);
                expect(markup).toContain('class="semaphore-indicator"');
                for (const c of circles) {
                    const rho = Math.hypot(c.x - cx, c.y - cy);
                    const deg = (Math.atan2(c.x - cx, -(c.y - cy)) * 180) / Math.PI;
                    if (deg >= startAngle && deg <= endAngle) {
                        expect(rho + c.r + TREND_EDGE_CLEARANCE).toBeLessThanOrEqual(ring.innerRadius + 0.02);
                        // 0.3.5.0: la banda (círculo interior) sólo es obstáculo dentro del barrido real.
                        expect(rho + c.r + TREND_EDGE_CLEARANCE).toBeLessThanOrEqual(inner + 0.02);
                    }
                }

                // Ancho: con -120°..60° y -90°..90° la serie es más ancha que en 0.3.3.0 (cuerda en 0.6·inner × 0.995).
                const spread = circles[circles.length - 1].x - circles[0].x;
                if (startAngle !== -135) {
                    expect(spread).toBeGreaterThan(inner * 1.6 * 0.995 - 2 * PADDING);
                }
            });
        }
    }
});
