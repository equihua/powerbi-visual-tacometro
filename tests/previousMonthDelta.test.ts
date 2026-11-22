import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gauge from "../src/components/Gauge";
import { GaugeFooter, GaugeFooterProps } from "../src/components/GaugeFooter";
import { comparisonColor } from "../src/components/scales";
import { GaugeData, GaugeSettings } from "../src/components/types";
import { TrendPoint } from "../src/components/trend";
import { baseline } from "./fixtures/gaugeBaseline020";

// Revisión 0.3.2.0: «Real & Mes anterior» = Real actual SIN recortar − Real mes anterior, coloreado por
// favorabilidad de esa diferencia (no por la zona del medidor): verde si favorable, rojo si desfavorable,
// invertido con «menor es mejor».
const GREEN = "#007F38";
const AMBER = "#FFC000";
const RED = "#C00000";
const NEUTRAL = "#252423";
const colors = { lowColor: RED, mediumColor: AMBER, highColor: GREEN };

describe("comparisonColor — color semántico de una diferencia", () => {
    it("mayor es mejor: subir es favorable (verde), bajar desfavorable (rojo), 0 neutral", () => {
        expect(comparisonColor(8, colors, false, NEUTRAL)).toBe(GREEN);
        expect(comparisonColor(-8, colors, false, NEUTRAL)).toBe(RED);
        expect(comparisonColor(0, colors, false, NEUTRAL)).toBe(NEUTRAL);
    });

    it("menor es mejor: bajar es favorable (verde), subir desfavorable (rojo), 0 neutral", () => {
        expect(comparisonColor(-8, colors, true, NEUTRAL)).toBe(GREEN);
        expect(comparisonColor(8, colors, true, NEUTRAL)).toBe(RED);
        expect(comparisonColor(0, colors, true, NEUTRAL)).toBe(NEUTRAL);
    });
});

function footerDescriptor(overrides: Partial<GaugeFooterProps>): string {
    const props: GaugeFooterProps = {
        width: 300,
        height: 40,
        real: 91.47,
        actualReal: 91.47,
        programmed: 95,
        difColor: AMBER,
        previousMonthDifColor: (delta: number) => comparisonColor(delta, colors, false, NEUTRAL),
        showDescriptor: true,
        format: (value: number) => value.toFixed(2),
        fontFamily: "Arial",
        valueColor: NEUTRAL,
        labelColor: "#605E5C",
        ...overrides,
    };
    const markup = renderToStaticMarkup(React.createElement("svg", null, React.createElement(GaugeFooter, props)));
    const start = markup.indexOf('class="footer-item footer-descriptor"');
    expect(start).toBeGreaterThan(-1);
    return markup.slice(start, markup.indexOf("</g>", start));
}

describe("GaugeFooter — 'Real & Mes anterior' con Real sin recortar y color propio", () => {
    it("usa actualReal (no el Real recortado) y el color que resuelve previousMonthDifColor(delta)", () => {
        const descriptor = footerDescriptor({ real: 120, actualReal: 150, previousMonth: 100 });
        expect(descriptor).toMatch(new RegExp(`class="footer-value"[^>]*fill="${GREEN}"[^>]*>\\+50.00<`));
    });

    it("no hereda difColor: Real 110 vs 118 se pinta desfavorable aunque difColor sea verde", () => {
        const descriptor = footerDescriptor({ real: 110, actualReal: 110, previousMonth: 118, difColor: GREEN });
        expect(descriptor).toMatch(new RegExp(`class="footer-value"[^>]*fill="${RED}"[^>]*>-8.00<`));
    });
});

const settings = baseline.settings as GaugeSettings;
const thresholds = { lowThreshold: 80, midThreshold: 95 };
const trend: TrendPoint[] = [
    { label: "Ene", real: 80, programmed: 85, semaphore: "Rojo", thresholds },
    { label: "Feb", real: 88, programmed: 90, semaphore: "Amarillo", thresholds },
];

/** Medidor con sparkline (pie visible) y sin semáforo de la fuente: el color de zona sale de los umbrales. */
function renderGauge(data: Partial<GaugeData>, s: GaugeSettings = settings): string {
    const gaugeData = {
        ...baseline.markers, semaphore: null, programmed: 95, trend, trendCurrentIndex: 1, ...data,
    } as GaugeData;
    return renderToStaticMarkup(React.createElement(Gauge, { viewport: { width: 300, height: 300 }, settings: s, gaugeData }));
}

function previousMonthValue(markup: string): string {
    const match = /footer-descriptor"[^]*?(<text class="footer-value"[^>]*>[^<]*<)/.exec(markup);
    expect(match).not.toBeNull();
    return match![1];
}

describe("Gauge — 'Real & Mes anterior' (revisión de requisito 0.3.2.0)", () => {
    it("mayor es mejor, Real 110 < mes anterior 118 (zona verde): -8.00 en rojo, no en verde", () => {
        const value = previousMonthValue(renderGauge({ value: 110, actualValue: 110, previousMonth: 118 }));
        expect(value).toContain(`fill="${RED}"`);
        expect(value).toContain(">-8.00<");
    });

    it("mayor es mejor, Real 40 > mes anterior 20 (zona roja): +20.00 en verde, no en rojo", () => {
        const value = previousMonthValue(renderGauge({ value: 40, actualValue: 40, previousMonth: 20 }));
        expect(value).toContain(`fill="${GREEN}"`);
        expect(value).toContain(">+20.00<");
    });

    it("menor es mejor: bajar (110 vs 118) es favorable (verde) y subir (40 vs 20) desfavorable (rojo)", () => {
        const lower = { ...settings, lowerIsBetter: true };
        expect(previousMonthValue(renderGauge({ value: 110, actualValue: 110, previousMonth: 118 }, lower))).toContain(`fill="${GREEN}"`);
        expect(previousMonthValue(renderGauge({ value: 40, actualValue: 40, previousMonth: 20 }, lower))).toContain(`fill="${RED}"`);
    });

    it("sin cambio frente al mes anterior: 0.00 en color neutro del pie", () => {
        const value = previousMonthValue(renderGauge({ value: 90, actualValue: 90, previousMonth: 90 }));
        expect(value).toContain(`fill="${NEUTRAL}"`);
        expect(value).toContain(">0.00<");
    });

    it("Real fuera de rango (150 con máximo 120): usa el Real sin recortar → +50.00; Dif. Real & Prog. no cambia", () => {
        const markup = renderGauge({ value: 120, actualValue: 150, previousMonth: 100 });
        expect(previousMonthValue(markup)).toContain(">+50.00<");
        expect(previousMonthValue(markup)).toContain(`fill="${GREEN}"`);
        // Sin cambios: Dif. Real & Prog. sigue usando el Real del centro (120.00 − 95.00).
        expect(markup).toMatch(/footer-difference[^]*?class="footer-value"[^>]*>\+25.00</);
    });

    it("alto contraste: la diferencia con el mes anterior usa el foreground", () => {
        const hc = { ...settings, highContrast: { foreground: "#FFFF00", background: "#000000" } };
        expect(previousMonthValue(renderGauge({ value: 110, actualValue: 110, previousMonth: 118 }, hc))).toContain('fill="#FFFF00"');
    });
});
