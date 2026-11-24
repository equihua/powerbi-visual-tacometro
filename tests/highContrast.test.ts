import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gauge from "../src/components/Gauge";
import { applyHighContrast } from "../src/highContrast";
import { GaugeData, GaugeSettings } from "../src/components/types";

const BASE: GaugeSettings = {
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
    showValueMarker: true,
    markerSize: 5,
    markerColor: "#333333",
    markerStyle: "circle",
    showValueLabel: true,
    fontSize: 20,
    fontFamily: "Arial",
    labelColor: "#777777",
    lowerIsBetter: false,
    targetMarginColor: "#605E5C",
    programmedColor: "#0078D4",
    previousMonthColor: "#8764B8",
};

const HC = { isHighContrast: true, foreground: { value: "#FFFF00" }, background: { value: "#000000" } };

const DATA: GaugeData = {
    value: 90,
    min: 0,
    max: 100,
    lowThreshold: 40,
    midThreshold: 70,
    target: 80,
    programmed: 70,
    hasValidData: true,
    dataFormat: { decimalPlaces: 0, isPercentage: false },
    semaphore: "Rojo",
};

function render(settings: GaugeSettings): string {
    return renderToStaticMarkup(
        React.createElement(Gauge, { viewport: { width: 300, height: 300 }, settings, gaugeData: DATA })
    );
}

describe("A3 High Contrast: applyHighContrast", () => {
    it("sin alto contraste devuelve la configuración sin cambios", () => {
        expect(applyHighContrast(BASE, { isHighContrast: false } as never)).toBe(BASE);
        expect(applyHighContrast(BASE, undefined)).toBe(BASE);
    });

    it("con alto contraste usa sólo foreground/background del host", () => {
        const hc = applyHighContrast(BASE, HC as never);
        expect(hc).toMatchObject({
            lowColor: "#000000",
            mediumColor: "#000000",
            highColor: "#000000",
            markerColor: "#FFFF00",
            labelColor: "#FFFF00",
            targetMarginColor: "#FFFF00",
            programmedColor: "#FFFF00",
            previousMonthColor: "#FFFF00",
            highContrast: { foreground: "#FFFF00", background: "#000000" },
        });
    });
});

describe("A3 High Contrast: <Gauge>", () => {
    const hc = applyHighContrast(BASE, HC as never);

    it("bandas y fondo con relleno background y contorno foreground", () => {
        const markup = render(hc);
        expect(markup).toMatch(/class="gauge-background"[^>]*fill="#000000"[^>]*stroke="#FFFF00"/);
        for (const band of ["range-low", "range-medium", "range-high"]) {
            expect(markup).toMatch(new RegExp(`class="${band}"[^>]*fill="#000000"[^>]*stroke="#FFFF00"`));
        }
    });

    it("arco de desempeño en foreground aunque haya semáforo; marcadores en foreground", () => {
        const markup = render({ ...hc, showRanges: false });
        expect(markup).toMatch(/class="performance-arc" fill="#FFFF00"/);
        expect(markup).toMatch(/marker-target"[^]*?<line[^>]*stroke="#FFFF00"/);
        expect(markup).toMatch(/marker-programmed"[^]*?<polygon[^>]*fill="#FFFF00"/);
    });
});
