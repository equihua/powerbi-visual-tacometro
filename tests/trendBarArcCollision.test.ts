import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gauge from "../src/components/Gauge";
import { GaugeData, GaugeSettings } from "../src/components/types";
import { TrendPoint } from "../src/components/trend";
import { segmentDistanceToAnnularSector } from "../src/components/trendFit";
import { applyTrendTransform, Point } from "../src/components/trendTransform";
import { computeGaugeFrame, computeInnerTrendBox } from "../src/components/layout";
import { bandRadii, semaphoreIndicatorRing } from "../src/components/arcUtils";
import { baseline } from "./fixtures/gaugeBaseline020";

/**
 * QA 0.4.1.0 — RECHAZADO: escenario 30°/Barras, barra local índice 0 colisiona con la corona del arco
 * (evidencia independiente: TableroMaestro-build/qa/tacometros-0.4.1.0-20261124T215229-0600/
 * verificacion-independiente/{DICTAMEN-QA.md,rotacion-30-barras/metrics.json}: r=127.0881 dentro de
 * [122.5,128.5], ángulo −111.7698°, isPointInFill 6544/12231 — colisión real confirmada por el
 * hit-test nativo del navegador, NO un artefacto de bounding box).
 *
 * Esta prueba usa ÚNICAMENTE utilidades YA EXISTENTES y probadas de trendFit.ts/trendTransform.ts
 * (segmentDistanceToAnnularSector, applyTrendTransform) para verificar, de forma independiente del
 * mecanismo de ajuste automático (`fitTrendScale`), si el rectángulo REAL de cada barra renderizada
 * (extraído del propio markup) colisiona con la banda real del arco (extraída de la configuración real
 * del medidor, misma fórmula que Gauge.tsx usa para dibujarla: bandRadii + MARKER_OVERHANG). No depende
 * de ningún cambio de producción: sirve como RED reproducible sobre 330e49e y como guardia de regresión
 * tras el fix (GREEN).
 */

const thresholds = { lowThreshold: 80, midThreshold: 95 };

/** Serie real tipo TableroMaestro (dev-harness/src/main.ts::POA_SERIES/MONTHS) — 12 meses, Real hasta
 * Oct (índice 9, el mes actual), Nov/Dic sin Real. Mismos valores del escenario QA que confirmó el repro. */
const REAL = [72.1, 78.4, 81.0, 79.5, 85.2, 88.9, 86.3, 90.1, 93.4, 91.47, null, null] as const;
const PROG = [70, 75, 80, 82, 85, 87, 89, 91, 93, 95, 97, 100] as const;
const SEM = ["Rojo", "Rojo", "Amarillo", "Rojo", "Amarillo", "Verde", "Amarillo", "Amarillo", "Verde", "Amarillo", null, null] as const;
const trendPOA: TrendPoint[] = REAL.map((real, i) => ({
    label: `m${i}`,
    real,
    programmed: PROG[i],
    semaphore: real !== null ? SEM[i] : null,
    thresholds,
}));
const withTrendPOA = { ...baseline.markers, trend: trendPOA, trendCurrentIndex: 9 } as GaugeData;

/** Ángulos/grosor/showRanges por OMISIÓN del medidor (settings.ts: startAngle -120, endAngle 60) — el
 * escenario QA real NO los sobreescribe, sólo chartType/angle de «Gráfico de tendencia». */
const DEFAULT_START_ANGLE = -120;
const DEFAULT_END_ANGLE = 60;
const settingsDefaults = { ...baseline.settings, startAngle: DEFAULT_START_ANGLE, endAngle: DEFAULT_END_ANGLE } as GaugeSettings;

/** Tarjeta 300×300: VIEWPORT por omisión del harness (dev-harness/src/main.ts::VIEWPORT) — el tamaño
 * real donde QA confirmó el repro (metrics.json: svg 300×300). */
const CARD_WIDTH = 300;
const CARD_HEIGHT = 300;

const barsRotated30 = { ...settingsDefaults, trendChartType: "bars", trendAngle: 30 } as GaugeSettings;

function render(s: GaugeSettings, width = CARD_WIDTH, height = CARD_HEIGHT): string {
    return renderToStaticMarkup(React.createElement(Gauge, { viewport: { width, height }, settings: s, gaugeData: withTrendPOA }));
}

/** `scale` real de un matrix(a,b,c,d,e,f); sin matrix (sin reducción) la escala es 1. */
function scaleFromMatrix(markup: string): number {
    const m = /class="trend-sparkline" transform="matrix\(([^)]+)\)"/.exec(markup);
    if (!m) return 1;
    const [a, b] = m[1].split(",").map(Number);
    return Math.hypot(a, b);
}

/** Extrae, en orden, los <rect class="trend-bar" ...> renderizados (x/y/width/height LOCALES, antes de
 * la matriz de rotación/escala del grupo contenedor "trend-sparkline"). */
function extractBarRects(markup: string): Array<{ index: number; x: number; y: number; width: number; height: number }> {
    const re = /<rect class="trend-bar" data-trend-index="(\d+)" x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g;
    const bars: Array<{ index: number; x: number; y: number; width: number; height: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(markup)) !== null) {
        bars.push({ index: Number(match[1]), x: Number(match[2]), y: Number(match[3]), width: Number(match[4]), height: Number(match[5]) });
    }
    return bars;
}

/** Centro/encuadre real del medidor (mismas fórmulas que Gauge.tsx usa para dibujar, sin depender del
 * mecanismo de ajuste bajo prueba): centro del SVG en (width/2, cy real de computeGaugeFrame). */
function arcGeometryFor(width: number, height: number, s: GaugeSettings) {
    const gaugeHeight = height - 40; // FOOTER_HEIGHT
    const frame = computeGaugeFrame(width, gaugeHeight, s.thickness, s.startAngle, s.endAngle, true);
    const { innerRadius: bandInner, outerRadius: bandOuter } = bandRadii(frame.radius, s.thickness);
    const band = {
        center: { x: width / 2, y: frame.cy },
        innerRadius: bandInner,
        outerRadius: bandOuter + 11, // MARKER_OVERHANG (layout.ts)
        startAngle: s.startAngle,
        endAngle: s.endAngle,
    };
    // Con showRanges=true (valor por omisión real, settings.ts), Gauge.tsx dibuja TAMBIÉN el anillo
    // delgado del indicador del semáforo (`path.semaphore-indicator`, PerformanceArc), un sector anular
    // DISTINTO de radio MENOR, por dentro del radio interior de la banda (arcUtils.ts). El dictamen QA
    // (rotacion-30-barras/metrics.json) seleccionó justo ese elemento (querySelector prioriza
    // "semaphore-indicator" sobre "performance-arc") al reportar r=127.0881 dentro de [122.5,128.5] —
    // ese rango corresponde al ANILLO, no a la banda (confirmado abajo con las fórmulas reales).
    const ring = s.showRanges ? semaphoreIndicatorRing(bandInner, s.thickness) : null;
    return {
        band,
        ring: ring ? { center: band.center, innerRadius: ring.innerRadius, outerRadius: ring.outerRadius, startAngle: s.startAngle, endAngle: s.endAngle } : null,
    };
}

type ArcSector = { center: Point; innerRadius: number; outerRadius: number; startAngle: number; endAngle: number };

/** ¿El rectángulo LOCAL de una barra, YA transformado (rotación/escala reales del grupo "trend-sparkline"
 * + traslación real de "gauge-trend-slot"), colisiona con un sector anular dado? Motor independiente
 * (segmentDistanceToAnnularSector, ya existente y probado) aplicado a las 4 esquinas REALES de la barra. */
function barCollidesWithArc(
    bar: { x: number; y: number; width: number; height: number },
    height: number,
    angleDeg: number,
    scale: number,
    boxOrigin: Point,
    arc: ArcSector
): boolean {
    const localCorners: Point[] = [
        { x: bar.x, y: bar.y },
        { x: bar.x + bar.width, y: bar.y },
        { x: bar.x + bar.width, y: bar.y + bar.height },
        { x: bar.x, y: bar.y + bar.height },
    ];
    const relativeCorners = localCorners.map((corner) => {
        const transformed = applyTrendTransform(corner, height, angleDeg, scale);
        return { x: boxOrigin.x + transformed.x - arc.center.x, y: boxOrigin.y + transformed.y - arc.center.y };
    });
    return relativeCorners.some((corner, i) => {
        const next = relativeCorners[(i + 1) % relativeCorners.length];
        return segmentDistanceToAnnularSector(corner, next, arc.innerRadius, arc.outerRadius, arc.startAngle, arc.endAngle) <= 0;
    });
}

describe("Gauge — chartType=Barras + rotación: la barra real (no sólo la caja nominal) debe librar la banda Y el anillo reales del arco", () => {
    it("REGRESIÓN QA 30°/Barras (300×300, barrido por omisión −120..60, serie POA real 12 meses): ninguna barra renderizada colisiona con la banda ni con el anillo del semáforo", () => {
        const markup = render(barsRotated30);
        const bars = extractBarRects(markup);
        expect(bars.length).toBe(10); // 12 meses en el período, pero sólo 10 con Real dibujan barra.

        const scale = scaleFromMatrix(markup);
        const slot = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup)!;
        const boxOrigin: Point = { x: Number(slot[1]), y: Number(slot[2]) };
        const { band, ring } = arcGeometryFor(CARD_WIDTH, CARD_HEIGHT, barsRotated30);
        expect(/class="trend-sparkline"/.test(markup)).toBe(true);
        expect(ring).not.toBeNull(); // showRanges=true por omisión (settings.ts): el anillo existe.

        // Alto real de la caja de tendencia: mismo valor que Gauge.tsx pasa como `height` a TrendSparkline
        // (computeInnerTrendBox). No depende del mecanismo bajo prueba: se mide directamente con las
        // mismas fórmulas de layout.ts/arcUtils.ts, que este fix no toca.
        const gaugeHeight = CARD_HEIGHT - 40;
        const frame = computeGaugeFrame(CARD_WIDTH, gaugeHeight, barsRotated30.thickness, barsRotated30.startAngle, barsRotated30.endAngle, true);
        const box = computeInnerTrendBox(frame.radius, barsRotated30.thickness, barsRotated30.startAngle, barsRotated30.endAngle, CARD_WIDTH, barsRotated30.showRanges)!;

        const bandCollisions = bars.filter((bar) => barCollidesWithArc(bar, box.height, 30, scale, boxOrigin, band)).map((b) => b.index);
        expect(bandCollisions).toEqual([]);
        const ringCollisions = bars.filter((bar) => barCollidesWithArc(bar, box.height, 30, scale, boxOrigin, ring as ArcSector)).map((b) => b.index);
        expect(ringCollisions).toEqual([]); // ANTES del fix: el índice 0 aparece aquí (colisión real confirmada, DICTAMEN-QA.md).
    });
});
