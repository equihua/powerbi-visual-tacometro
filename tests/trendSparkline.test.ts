import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrendSparkline, TrendSparklineProps } from "../src/components/TrendSparkline";
import { TrendPoint } from "../src/components/trend";

const thresholds = { lowThreshold: 40, midThreshold: 70 };
const points: TrendPoint[] = [
    { label: "Ene", real: 30, programmed: 50, semaphore: null, thresholds },
    { label: "Feb", real: 90, programmed: 60, semaphore: "Rojo", thresholds },
    { label: "Mar", real: null, programmed: 70, semaphore: null, thresholds },
    { label: "Abr", real: 60, programmed: 80, semaphore: null, thresholds },
];

function render(overrides: Partial<TrendSparklineProps> = {}): string {
    const props: TrendSparklineProps = {
        points,
        width: 300,
        height: 60,
        currentIndex: 3,
        colors: { lowColor: "#C00000", mediumColor: "#FFC000", highColor: "#007F38", lowerIsBetter: false },
        programmedColor: "#0078D4",
        format: (value: number) => value.toFixed(1),
        ...overrides,
    };
    return renderToStaticMarkup(React.createElement("svg", null, React.createElement(TrendSparkline, props)));
}

const fills = (markup: string) => [...markup.matchAll(/<circle[^>]*class="(trend-point[^"]*)"[^>]*fill="([^"]*)"/g)].map((m) => [m[1], m[2]]);

describe("TrendSparkline — historial mensual Real / Programado", () => {
    it("dibuja la línea de Real y la de Programado (discontinua, color Programado)", () => {
        const markup = render();
        expect(markup).toContain('class="trend-sparkline"');
        expect(markup).toMatch(/<path[^>]*class="trend-real-line"[^>]*d="M[^"]+"[^>]*stroke="#D1D5DB"/);
        expect(markup).toMatch(/<path[^>]*class="trend-programmed-line"[^>]*stroke="#0078D4"[^>]*stroke-dasharray=/);
    });

    it("un punto por mes con Real, coloreado por su estado (semáforo del mes > umbrales)", () => {
        expect(fills(render())).toEqual([
            ["trend-point", "#C00000"], // Ene 30 → bajo
            ["trend-point", "#C00000"], // Feb semáforo Rojo (aunque 90 sería alto)
            ["trend-point trend-point-current", "#FFC000"], // Abr 60 → medio, mes actual
        ]);
    });

    it("revisión B2: cada punto se evalúa con los umbrales de su propio mes, no con los del mes actual", () => {
        const historic: TrendPoint[] = [
            { label: "Ene", real: 50, programmed: null, semaphore: null, thresholds: { lowThreshold: 20, midThreshold: 40 } },
            { label: "Feb", real: 50, programmed: null, semaphore: null, thresholds: { lowThreshold: 60, midThreshold: 80 } },
        ];
        expect(fills(render({ points: historic, currentIndex: 1 }))).toEqual([
            ["trend-point", "#007F38"], // Ene: 50 ≥ 40 (su medio) → alto
            ["trend-point trend-point-current", "#C00000"], // Feb: 50 < 60 (su bajo) → bajo
        ]);
    });

    it("sin mes actual (índice -1) ningún punto se resalta", () => {
        expect(render({ currentIndex: -1 })).not.toContain("trend-point-current");
    });

    it("0.3.4.0: los puntos ya NO llevan <title> SVG nativo (tooltip gris de depuración del navegador, duplicaba la tooltip clara por punto de visual.ts/tooltips.ts)", () => {
        const markup = render();
        expect(markup).not.toContain("<title>");
    });

    it("el mes actual se resalta con un radio mayor", () => {
        const radius = (cls: string) => Number(new RegExp(`<circle[^>]*class="${cls}"[^>]*r="([\\d.]+)"`).exec(render())?.[1]);
        expect(radius("trend-point trend-point-current")).toBeGreaterThan(radius("trend-point"));
    });

    it("alto contraste: líneas y puntos con el foreground", () => {
        const hc = { foreground: "#FFFF00", background: "#000000" };
        const markup = render({
            colors: { lowColor: "#C00000", mediumColor: "#FFC000", highColor: "#007F38", lowerIsBetter: false, highContrast: hc },
        });
        expect(fills(markup).every(([, fill]) => fill === "#FFFF00")).toBe(true);
        expect(markup).toMatch(/class="trend-programmed-line"[^>]*stroke="#FFFF00"/);
        expect(markup).toMatch(/class="trend-real-line"[^>]*stroke="#FFFF00"/);
    });

    it("sin Programado no dibuja su línea", () => {
        const onlyReal = points.map((pt) => ({ ...pt, programmed: null }));
        expect(render({ points: onlyReal })).not.toContain("trend-programmed-line");
    });
});
