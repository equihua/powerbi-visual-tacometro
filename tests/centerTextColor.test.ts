import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gauge from "../src/components/Gauge";
import * as scales from "../src/components/scales";
import { NEUTRAL_SEMAPHORE_COLOR } from "../src/components/semaphore";
import { GaugeData, GaugeSettings } from "../src/components/types";

// 0.3.3.1: el número central toma EXACTAMENTE el color que consume el arco del medidor (performanceColor):
// alto contraste > semáforo de la fuente (resolveSemaphoreColor) > umbrales (createPerformanceColorScale, el
// mismo respaldo que usa el arco). 0.3.3.0 lo clasificaba geométricamente por banda e ignoraba el semáforo:
// 72.89 con semáforo «Rojo» salía verde. Revertido.
function settings(overrides: Partial<GaugeSettings> = {}): GaugeSettings {
    return {
        thickness: 20,
        startAngle: -120,
        endAngle: 60,
        topMargin: 4,
        arcScale: 100,
        offsetY: 0,
        showRanges: true,
        lowColor: "#C00000",
        mediumColor: "#FFC000",
        highColor: "#007F38",
        showValueMarker: false,
        markerSize: 5,
        markerColor: "#333333",
        markerStyle: "triangle",
        showValueLabel: true,
        fontSize: 20,
        fontFamily: "Arial",
        labelColor: "#777777",
        lowerIsBetter: false,
        targetMarginColor: "#605E5C",
        programmedColor: "#0078D4",
        previousMonthColor: "#8764B8",
        ...overrides,
    };
}

function data(overrides: Partial<GaugeData> = {}): GaugeData {
    return {
        value: 72.89,
        min: 0,
        max: 100,
        lowThreshold: 50,
        midThreshold: 70,
        hasValidData: true,
        dataFormat: { decimalPlaces: 2, isPercentage: false },
        semaphore: null,
        ...overrides,
    };
}

function render(s: GaugeSettings, d: GaugeData): string {
    return renderToStaticMarkup(React.createElement(Gauge, { viewport: { width: 300, height: 300 }, settings: s, gaugeData: d }));
}

function centerFill(markup: string): string | undefined {
    const tag = /<text[^>]*class="center-text"[^>]*>/.exec(markup)?.[0];
    return tag ? /fill="([^"]*)"/.exec(tag)?.[1] : undefined;
}

function pathFill(markup: string, className: string): string | undefined {
    return new RegExp(`<path class="${className}"[^>]*fill="([^"]*)"`).exec(markup)?.[1];
}

describe("CenterText 0.3.3.1 — color del semáforo real, el mismo que consume el arco", () => {
    it("regresión: 72.89 (geométricamente en la banda alta 70..100) con semáforo «Rojo» → número ROJO", () => {
        expect(centerFill(render(settings(), data({ semaphore: "Rojo" })))).toBe("#C00000");
    });

    it("el número coincide con el arco indicador del semáforo (rangos visibles)", () => {
        const markup = render(settings(), data({ semaphore: "Rojo" }));
        expect(pathFill(markup, "semaphore-indicator")).toBe("#C00000");
        expect(centerFill(markup)).toBe(pathFill(markup, "semaphore-indicator"));
    });

    it("el número coincide con el arco de desempeño (rangos ocultos): 30 con semáforo «Verde» → verde", () => {
        const markup = render(settings({ showRanges: false }), data({ value: 30, semaphore: "Verde" }));
        expect(pathFill(markup, "performance-arc")).toBe("#007F38");
        expect(centerFill(markup)).toBe("#007F38");
    });

    it.each([
        ["Rojo", "#C00000"],
        ["Amarillo", "#FFC000"],
        ["Verde", "#007F38"],
        ["text-danger", "#C00000"],
        ["#123456", "#123456"],
        ["Sin semaforizar", NEUTRAL_SEMAPHORE_COLOR],
    ])("semáforo de la fuente «%s» → %s (mismo mapeo resolveSemaphoreColor que el arco)", (semaphore, expected) => {
        const markup = render(settings(), data({ semaphore }));
        expect(centerFill(markup)).toBe(expected);
        expect(pathFill(markup, "semaphore-indicator")).toBe(expected);
    });

    it("menor es mejor no reclasifica: semáforo «Verde» → verde aunque 72.89 caiga en la banda alta (roja)", () => {
        expect(centerFill(render(settings({ lowerIsBetter: true }), data({ semaphore: "Verde" })))).toBe("#007F38");
    });

    it("sin semáforo: mismo respaldo por umbrales que el arco de desempeño (createPerformanceColorScale)", () => {
        for (const value of [30, 50, 60, 70, 72.89]) {
            const hidden = render(settings({ showRanges: false }), data({ value }));
            const expected = scales.createPerformanceColorScale(50, 70, settings())(value);
            expect(pathFill(hidden, "performance-arc")).toBe(expected);
            expect(centerFill(hidden)).toBe(expected);
            expect(centerFill(render(settings(), data({ value })))).toBe(expected);
        }
    });

    it("alto contraste: el número usa foreground (misma precedencia que el arco)", () => {
        const hc = settings({
            lowColor: "#000000", mediumColor: "#000000", highColor: "#000000", labelColor: "#FFFF00",
            highContrast: { foreground: "#FFFF00", background: "#000000" },
        });
        expect(centerFill(render(hc, data({ semaphore: "Rojo" })))).toBe("#FFFF00");
    });

    it("ya no existe la clasificación geométrica aparte (rangeBandColorAt eliminado)", () => {
        expect((scales as Record<string, unknown>).rangeBandColorAt).toBeUndefined();
    });
});
