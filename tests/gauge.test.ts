import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gauge from "../src/components/Gauge";
import { GaugeData, GaugeSettings } from "../src/components/types";

/** Render estático (sin DOM): suficiente para verificar colores/atributos SVG. */
function settings(overrides: Partial<GaugeSettings> = {}): GaugeSettings {
    return {
        thickness: 20,
        startAngle: -120,
        endAngle: 60,
        topMargin: 4,
        arcScale: 100,
        offsetY: 0,
        showRanges: false,
        lowColor: "#C00000",
        mediumColor: "#FFC000",
        highColor: "#007F38",
        showValueMarker: false,
        markerSize: 5,
        markerColor: "#333333",
        markerStyle: "triangle",
        showValueLabel: false,
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
        value: 90,
        min: 0,
        max: 100,
        lowThreshold: 40,
        midThreshold: 70,
        hasValidData: true,
        dataFormat: { decimalPlaces: 0, isPercentage: false },
        semaphore: null,
        ...overrides,
    };
}

function render(s: GaugeSettings, d: GaugeData): string {
    return renderToStaticMarkup(
        React.createElement(Gauge, { viewport: { width: 300, height: 300 }, settings: s, gaugeData: d })
    );
}

function attr(markup: string, className: string, attribute: string): string | undefined {
    const tag = new RegExp(`<[^>]*class="${className}"[^>]*>`).exec(markup)?.[0];
    return tag ? new RegExp(`${attribute}="([^"]*)"`).exec(tag)?.[1] : undefined;
}

describe("Gauge — B1 semáforo de la fuente", () => {
    it("sin semáforo usa el color calculado por umbrales (90 → alto)", () => {
        expect(attr(render(settings(), data()), "performance-arc", "fill")).toBe("#007F38");
    });

    it("el semáforo de la fuente sustituye al color calculado", () => {
        expect(attr(render(settings(), data({ semaphore: "Rojo" })), "performance-arc", "fill")).toBe("#C00000");
        expect(attr(render(settings(), data({ semaphore: "text-warning" })), "performance-arc", "fill")).toBe("#FFC000");
    });

    it("semáforo no reconocido conserva el color calculado", () => {
        expect(attr(render(settings(), data({ semaphore: "???" })), "performance-arc", "fill")).toBe("#007F38");
    });
});

describe("Gauge — B1 semáforo de la fuente con rangos visibles (showRanges=true, predeterminado)", () => {
    const ranges = settings({ showRanges: true });

    it("dibuja un indicador de desempeño con el color del semáforo de la fuente", () => {
        // 90 cae en la banda alta (verde); la fuente dice Rojo y debe verse rojo.
        const markup = render(ranges, data({ value: 90, semaphore: "Rojo" }));
        expect(attr(markup, "semaphore-indicator", "fill")).toBe("#C00000");
        expect(attr(render(ranges, data({ semaphore: "#123ABC" })), "semaphore-indicator", "fill")).toBe("#123ABC");
    });

    it("conserva las tres bandas de umbrales sin alterar", () => {
        const markup = render(ranges, data({ value: 90, semaphore: "Rojo" }));
        expect([attr(markup, "range-low", "fill"), attr(markup, "range-medium", "fill"), attr(markup, "range-high", "fill")])
            .toEqual(["#C00000", "#FFC000", "#007F38"]);
    });

    it("sin semáforo (o no reconocido) no agrega indicador: las bandas ya expresan el color calculado", () => {
        expect(render(ranges, data())).not.toContain("semaphore-indicator");
        expect(render(ranges, data({ semaphore: "???" }))).not.toContain("semaphore-indicator");
    });

    it("alto contraste conserva la precedencia: el indicador usa el foreground", () => {
        const hc = settings({ showRanges: true, highContrast: { foreground: "#FFFF00", background: "#000000" } });
        expect(attr(render(hc, data({ semaphore: "Rojo" })), "semaphore-indicator", "fill")).toBe("#FFFF00");
    });
});

describe("Gauge — B2 'menor es mejor'", () => {
    it("invierte el color calculado del arco de desempeño", () => {
        expect(attr(render(settings({ lowerIsBetter: true }), data({ value: 90 })), "performance-arc", "fill")).toBe(
            "#C00000"
        );
        expect(attr(render(settings({ lowerIsBetter: true }), data({ value: 10 })), "performance-arc", "fill")).toBe(
            "#007F38"
        );
    });

    it("invierte el orden de color de las bandas", () => {
        const asc = render(settings({ showRanges: true }), data());
        expect([attr(asc, "range-low", "fill"), attr(asc, "range-high", "fill")]).toEqual(["#C00000", "#007F38"]);
        const desc = render(settings({ showRanges: true, lowerIsBetter: true }), data());
        expect([attr(desc, "range-low", "fill"), attr(desc, "range-high", "fill")]).toEqual(["#007F38", "#C00000"]);
    });
});

describe("Gauge — B3 marcadores distintos", () => {
    const all = data({ target: 80, targetWithMargin: 85, programmed: 70, previousMonth: 60 });

    function markerTag(markup: string, kind: string): string {
        const start = markup.indexOf(`class="gauge-marker marker-${kind}"`);
        expect(start).toBeGreaterThan(-1);
        return markup.slice(start, markup.indexOf("</g>", start));
    }

    it("dibuja los 4 marcadores con título y forma propia", () => {
        const markup = render(settings(), all);
        const target = markerTag(markup, "target");
        const margin = markerTag(markup, "targetWithMargin");
        const programmed = markerTag(markup, "programmed");
        const previous = markerTag(markup, "previousMonth");

        expect(target).toContain("<title>Objetivo: 80</title>");
        expect(target).toContain("<line");
        expect(target).not.toContain("stroke-dasharray");
        expect(margin).toContain("<title>Meta con margen: 85</title>");
        expect(margin).toMatch(/<line[^>]*stroke-dasharray=/);
        expect(margin).toContain('stroke="#605E5C"');
        expect(programmed).toContain("<title>Programado: 70</title>");
        expect(programmed).toMatch(/<polygon[^>]*fill="#0078D4"/);
        expect(previous).toContain("<title>Real mes anterior: 60</title>");
        expect(previous).toMatch(/<circle[^>]*stroke="#8764B8"/);
    });

    it("cada marcador se rota al ángulo de su propio valor", () => {
        const markup = render(settings(), all);
        const angle = (kind: string) => Number(/transform="rotate\(([-\d.e]+)\)"/.exec(markerTag(markup, kind))?.[1]);
        // -120°..60° sobre 0..100: 80 → 24°, 85 → 33°, 70 → 6°, 60 → -12°.
        expect(angle("target")).toBeCloseTo(24, 6);
        expect(angle("targetWithMargin")).toBeCloseTo(33, 6);
        expect(angle("programmed")).toBeCloseTo(6, 6);
        expect(angle("previousMonth")).toBeCloseTo(-12, 6);
    });

    it("sólo dibuja los marcadores con valor (independientes)", () => {
        const markup = render(settings(), data({ programmed: 70 }));
        expect(markup).toContain("marker-programmed");
        expect(markup).not.toContain("marker-target");
        expect(markup).not.toContain("marker-previousMonth");
    });
});

describe("Gauge — A3 Keyboard Navigation / accesibilidad", () => {
    it("el SVG es enfocable con teclado y expone una etiqueta accesible", () => {
        const markup = render(settings(), data({ target: 80, semaphore: "Rojo" }));
        expect(markup).toMatch(/<svg[^>]*tabindex="0"/);
        expect(markup).toMatch(/<svg[^>]*role="img"/);
        expect(markup).toMatch(/<svg[^>]*class="gauge-svg"/);
        const label = /<svg[^>]*aria-label="([^"]*)"/.exec(markup)?.[1];
        expect(label).toBe("Tacómetro. Valor: 90; Mínimo: 0; Máximo: 100; Objetivo: 80; Semáforo: Rojo");
    });
});

describe("Gauge — A3 Landing Page", () => {
    it("sin datos muestra una página de inicio con instrucciones", () => {
        const markup = renderToStaticMarkup(
            React.createElement(Gauge, { viewport: { width: 300, height: 300 }, settings: null, gaugeData: null })
        );
        expect(markup).toContain('class="landing-page"');
        expect(markup).toContain("Tacómetro");
        expect(markup).toContain("Agregue una medida al campo «Valor»");
    });
});
