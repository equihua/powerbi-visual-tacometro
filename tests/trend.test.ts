import { describe, expect, it } from "vitest";
import { buildTrendGeometry, TrendPoint } from "../src/components/trend";

function p(label: string, real: number | null, programmed: number | null = null): TrendPoint {
    return { label, real, programmed, semaphore: null, thresholds: { lowThreshold: 0, midThreshold: 0 } };
}

describe("buildTrendGeometry — sparkline mensual", () => {
    const points = [p("Ene", 10, 20), p("Feb", 30, 20), p("Mar", 20, 40)];

    it("reparte los meses de forma uniforme en el ancho (con margen)", () => {
        const g = buildTrendGeometry(points, 220, 50, 10);
        expect(g.xs).toEqual([10, 110, 210]);
    });

    it("escala real y programado juntos: el mínimo abajo y el máximo arriba", () => {
        const g = buildTrendGeometry(points, 220, 50, 10);
        // extensión 10..40 → y de 40 (abajo) a 10 (arriba)
        expect(g.realPoints.map((pt) => pt.y)).toEqual([40, 20, 30]);
        expect(g.programmedPoints.map((pt) => pt.y)).toEqual([30, 30, 10]);
    });

    it("genera la línea real y la programada como trazos SVG", () => {
        const g = buildTrendGeometry(points, 220, 50, 10);
        expect(g.realPath).toBe("M10,40L110,20L210,30");
        expect(g.programmedPath).toBe("M10,30L110,30L210,10");
    });

    it("los meses sin valor no se dibujan y cortan la línea (sin unir el hueco)", () => {
        const g = buildTrendGeometry([p("Ene", 10), p("Feb", null), p("Mar", 30), p("Abr", 20)], 320, 50, 10);
        expect(g.realPoints.map((pt) => pt.index)).toEqual([0, 2, 3]);
        expect(g.realPath).toBe("M10,40M210,10L310,25");
        expect(g.programmedPath).toBe("");
    });

    it("un solo mes queda centrado y una serie plana queda a media altura", () => {
        const g = buildTrendGeometry([p("Ene", 5, 5)], 200, 50, 10);
        expect(g.xs).toEqual([100]);
        expect(g.realPoints[0].y).toBe(25);
    });

    it("ignora valores no finitos", () => {
        const g = buildTrendGeometry([p("Ene", Number.NaN), p("Feb", 1)], 120, 50, 10);
        expect(g.realPoints.map((pt) => pt.index)).toEqual([1]);
    });
});

import { statusColor } from "../src/components/trend";

describe("statusColor — color de estado (misma precedencia que el medidor)", () => {
    const colors = { lowColor: "#C00000", mediumColor: "#FFC000", highColor: "#007F38", lowerIsBetter: false };
    const thresholds = { lowThreshold: 40, midThreshold: 70 };

    it("el semáforo de la fuente manda sobre los umbrales", () => {
        expect(statusColor(90, "Rojo", thresholds, colors)).toBe("#C00000");
        expect(statusColor(10, "Verde", thresholds, colors)).toBe("#007F38");
    });

    it("sin semáforo reconocido usa los umbrales (bajo / medio / alto)", () => {
        expect(statusColor(30, null, thresholds, colors)).toBe("#C00000");
        expect(statusColor(60, "???", thresholds, colors)).toBe("#FFC000");
        expect(statusColor(90, null, thresholds, colors)).toBe("#007F38");
    });

    it("respeta 'menor es mejor'", () => {
        expect(statusColor(90, null, thresholds, { ...colors, lowerIsBetter: true })).toBe("#C00000");
    });

    it("en alto contraste sólo usa el foreground", () => {
        const hc = { ...colors, highContrast: { foreground: "#FFFF00", background: "#000000" } };
        expect(statusColor(90, "Rojo", thresholds, hc)).toBe("#FFFF00");
    });
});

describe("buildTrendGeometry — bordes (cobertura 0.3.1.0: sparkline dentro de una caja más chica)", () => {
    it("sin ningún valor no dibuja trazos y no falla", () => {
        const g = buildTrendGeometry([p("Ene", null), p("Feb", null)], 100, 40, 6);
        expect(g.realPoints).toEqual([]);
        expect(g.programmedPoints).toEqual([]);
        expect(g.realPath).toBe("");
        expect(g.programmedPath).toBe("");
        expect(g.xs).toEqual([6, 94]);
    });

    it("un solo mes queda centrado en el ancho", () => {
        expect(buildTrendGeometry([p("Ene", 5)], 100, 40, 6).xs).toEqual([50]);
    });
});
