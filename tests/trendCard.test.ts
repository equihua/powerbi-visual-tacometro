import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import powerbi from "powerbi-visuals-api";
import * as capabilities from "../capabilities.json";
import { VisualFormattingSettingsModel } from "../src/settings";
import { TrendSparkline, TrendSparklineProps, TrendChartType } from "../src/components/TrendSparkline";
import { TrendPoint, YScaleMode, computeTrendYDomain } from "../src/components/trend";
import { applyTrendBoxOverrides, Box } from "../src/components/layout";
import { GaugeData, GaugeSettings } from "../src/components/types";

const render = vi.fn();
vi.mock("react-dom/client", () => ({
    createRoot: () => ({ render }),
}));

import { Visual } from "../src/visual";

import DataView = powerbi.DataView;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

/**
 * Parte B (0.4.0.0) — tarjeta de formato «Gráfico de tendencia»: tipo de gráfico, posición/tamaño,
 * ángulo, escala Y (automática/desde cero/manual), mostrar/ocultar Programado, colores por semáforo o
 * fijo, y grosor de línea/tamaño de punto.
 */

// ---------------------------------------------------------------------------------------------------
// 1. settings.ts — defaults de la tarjeta (retrocompatibles con 0.3.5.0 salvo el margen de la escala
//    Y "auto", documentado en computeTrendYDomain).
// ---------------------------------------------------------------------------------------------------
describe("TrendCardSettings — defaults de la tarjeta «Gráfico de tendencia»", () => {
    const trendCard = new VisualFormattingSettingsModel().trendCard;

    it("tipo de gráfico por omisión: línea con puntos (comportamiento 0.3.5.0)", () => {
        expect(trendCard.chartType.value).toEqual({ displayName: "Línea con puntos", value: "lineDots" });
    });

    it("posición/tamaño sin valor por omisión (se usa el cálculo automático)", () => {
        expect(trendCard.posX.value).toBeUndefined();
        expect(trendCard.posY.value).toBeUndefined();
        expect(trendCard.width.value).toBeUndefined();
        expect(trendCard.height.value).toBeUndefined();
    });

    it("ángulo 0° por omisión (horizontal)", () => {
        expect(trendCard.angle.value).toBe(0);
    });

    it("escala Y automática al rango por omisión, sin límites manuales", () => {
        expect(trendCard.yScaleMode.value).toEqual({ displayName: "Automática al rango", value: "auto" });
        expect(trendCard.yMin.value).toBeUndefined();
        expect(trendCard.yMax.value).toBeUndefined();
    });

    it("Programado visible y colores por semáforo activados por omisión", () => {
        expect(trendCard.showProgrammed.value).toBe(true);
        expect(trendCard.useSemaphoreColors.value).toBe(true);
    });

    it("grosor de línea y tamaño de punto con los valores de 0.3.5.0 (1.5 y 2.5)", () => {
        expect(trendCard.lineWidth.value).toBe(1.5);
        expect(trendCard.pointSize.value).toBe(2.5);
    });

    it("declara las 14 propiedades esperadas, en la tarjeta «trend»", () => {
        expect(trendCard.name).toBe("trend");
        expect(trendCard.slices.map((slice) => (slice as { name: string }).name)).toEqual([
            "chartType", "posX", "posY", "width", "height", "angle", "yScaleMode", "yMin", "yMax",
            "showProgrammed", "useSemaphoreColors", "fixedColor", "lineWidth", "pointSize",
        ]);
    });
});

// ---------------------------------------------------------------------------------------------------
// 2. capabilities.json — el objeto "trend" declara exactamente las mismas propiedades que settings.ts.
// ---------------------------------------------------------------------------------------------------
describe("capabilities.json — objeto «trend»", () => {
    const trendObject = (capabilities as any).objects.trend;

    it("existe con displayName «Gráfico de tendencia» y las 14 propiedades de la tarjeta", () => {
        expect(trendObject.displayName).toBe("Gráfico de tendencia");
        expect(Object.keys(trendObject.properties)).toEqual([
            "chartType", "posX", "posY", "width", "height", "angle", "yScaleMode", "yMin", "yMax",
            "showProgrammed", "useSemaphoreColors", "fixedColor", "lineWidth", "pointSize",
        ]);
    });

    it("chartType y yScaleMode son enumeraciones con los 4 tipos de gráfico y los 3 modos de escala", () => {
        expect(trendObject.properties.chartType.type.enumeration.map((i: any) => i.value)).toEqual([
            "lineDots", "line", "bars", "area",
        ]);
        expect(trendObject.properties.yScaleMode.type.enumeration.map((i: any) => i.value)).toEqual([
            "auto", "zero", "manual",
        ]);
    });

    it("fixedColor es un color picker y showProgrammed/useSemaphoreColors son booleanos", () => {
        expect(trendObject.properties.fixedColor.type).toEqual({ fill: { solid: { color: true } } });
        expect(trendObject.properties.showProgrammed.type).toEqual({ bool: true });
        expect(trendObject.properties.useSemaphoreColors.type).toEqual({ bool: true });
    });
});

// ---------------------------------------------------------------------------------------------------
// 3. visual.ts → Gauge.tsx — cada propiedad del panel llega como se espera al GaugeSettings que
//    consume el componente (lectura capabilities.json/settings.ts → GaugeSettings).
// ---------------------------------------------------------------------------------------------------
function setupVisual() {
    const host = {
        createSelectionManager: () => ({ showContextMenu: vi.fn() }),
        eventService: { renderingStarted: vi.fn(), renderingFinished: vi.fn(), renderingFailed: vi.fn() },
        tooltipService: { enabled: () => true, show: vi.fn(), hide: vi.fn() },
        hostCapabilities: { allowInteractions: true },
        colorPalette: { isHighContrast: false },
    };
    const visual = new Visual({ element: new EventTarget() as unknown as HTMLElement, host } as unknown as VisualConstructorOptions);
    return visual;
}

function dataViewWithTrendObject(objects: Record<string, unknown>): DataView {
    return {
        metadata: { columns: [], objects: { trend: objects } },
        categorical: { values: [{ source: { displayName: "m", roles: { measure: true } }, values: [42] }] },
    } as unknown as DataView;
}

function settingsOf(visual: Visual, view: DataView): GaugeSettings {
    render.mockClear();
    visual.update({ dataViews: [view], viewport: { width: 300, height: 300 } } as unknown as VisualUpdateOptions);
    return (render.mock.calls[0][0] as { props: { settings: GaugeSettings } }).props.settings;
}

describe("Visual — lectura de la tarjeta «Gráfico de tendencia» hacia GaugeSettings", () => {
    it("sin tocar el panel, GaugeSettings trae los defaults retrocompatibles (undefined donde el cálculo es automático)", () => {
        const settings = settingsOf(setupVisual(), dataViewWithTrendObject({}));
        expect(settings.trendChartType).toBe("lineDots");
        expect(settings.trendPosX).toBeUndefined();
        expect(settings.trendPosY).toBeUndefined();
        expect(settings.trendWidth).toBeUndefined();
        expect(settings.trendHeight).toBeUndefined();
        expect(settings.trendAngle).toBe(0);
        expect(settings.trendYScaleMode).toBe("auto");
        expect(settings.trendYMin).toBeUndefined();
        expect(settings.trendYMax).toBeUndefined();
        expect(settings.trendShowProgrammed).toBe(true);
        expect(settings.trendUseSemaphoreColors).toBe(true);
        expect(settings.trendLineWidth).toBe(1.5);
        expect(settings.trendPointSize).toBe(2.5);
    });

    it("con el panel configurado, cada propiedad llega con su valor (tipo de gráfico, posición/tamaño, ángulo, escala manual, Programado, color fijo, grosor/tamaño)", () => {
        const settings = settingsOf(setupVisual(), dataViewWithTrendObject({
            chartType: "bars",
            posX: 5, posY: 6, width: 120, height: 40,
            angle: 15,
            yScaleMode: "manual", yMin: 10, yMax: 90,
            showProgrammed: false,
            useSemaphoreColors: false,
            fixedColor: { solid: { color: "#112233" } },
            lineWidth: 3,
            pointSize: 6,
        }));
        expect(settings.trendChartType).toBe("bars");
        expect(settings.trendPosX).toBe(5);
        expect(settings.trendPosY).toBe(6);
        expect(settings.trendWidth).toBe(120);
        expect(settings.trendHeight).toBe(40);
        expect(settings.trendAngle).toBe(15);
        expect(settings.trendYScaleMode).toBe("manual");
        expect(settings.trendYMin).toBe(10);
        expect(settings.trendYMax).toBe(90);
        expect(settings.trendShowProgrammed).toBe(false);
        expect(settings.trendUseSemaphoreColors).toBe(false);
        expect(settings.trendFixedColor).toBe("#112233");
        expect(settings.trendLineWidth).toBe(3);
        expect(settings.trendPointSize).toBe(6);
    });
});

// ---------------------------------------------------------------------------------------------------
// 4. computeTrendYDomain — los 3 modos de escala Y, incluido el caso rango = 0.
// ---------------------------------------------------------------------------------------------------
describe("computeTrendYDomain — modos de escala Y", () => {
    it("auto: domina el mín/máx combinado con 10% de margen arriba y abajo", () => {
        // rango 10..40 → margen 10% de 30 = 3
        expect(computeTrendYDomain([10, 40, 25], "auto")).toEqual([7, 43]);
    });

    it("auto con rango 0 y valor != 0: margen = 10% del valor absoluto", () => {
        // todos los valores 50 → rango 0, margen 10% de 50 = 5
        expect(computeTrendYDomain([50, 50, 50], "auto")).toEqual([45, 55]);
    });

    it("auto con rango 0 y valor == 0 (todo cero): margen fijo absoluto de 1 (evita domain [0,0])", () => {
        expect(computeTrendYDomain([0, 0], "auto")).toEqual([-1, 1]);
    });

    it("auto sin ningún valor finito: igual que el caso [0,0] (domain [-1, 1])", () => {
        expect(computeTrendYDomain([], "auto")).toEqual([-1, 1]);
    });

    it("zero: el origen siempre queda dentro del dominio, sin margen adicional", () => {
        expect(computeTrendYDomain([10, 40], "zero")).toEqual([0, 40]);
        expect(computeTrendYDomain([-10, 40], "zero")).toEqual([-10, 40]);
        expect(computeTrendYDomain([-40, -10], "zero")).toEqual([-40, 0]);
    });

    it("manual: usa yMin/yMax del panel tal cual", () => {
        expect(computeTrendYDomain([10, 40], "manual", 0, 100)).toEqual([0, 100]);
    });

    it("manual incompleto o invertido cae a «auto» sobre los mismos valores", () => {
        expect(computeTrendYDomain([10, 40], "manual", undefined, 100)).toEqual(computeTrendYDomain([10, 40], "auto"));
        expect(computeTrendYDomain([10, 40], "manual", 100, 0)).toEqual(computeTrendYDomain([10, 40], "auto"));
    });
});

// ---------------------------------------------------------------------------------------------------
// 5. applyTrendBoxOverrides — posición/tamaño: retrocompatible y sobreescribible eje por eje.
// ---------------------------------------------------------------------------------------------------
describe("applyTrendBoxOverrides — posición/tamaño de la caja de tendencia", () => {
    const auto: Box = { x: 10, y: 20, width: 100, height: 30 };

    it("sin ninguna sobreescritura, el resultado es idéntico al automático", () => {
        expect(applyTrendBoxOverrides(auto, {})).toEqual(auto);
    });

    it("cada eje se sobreescribe de forma independiente", () => {
        expect(applyTrendBoxOverrides(auto, { x: 0 })).toEqual({ x: 0, y: 20, width: 100, height: 30 });
        expect(applyTrendBoxOverrides(auto, { width: 50, height: 10 })).toEqual({ x: 10, y: 20, width: 50, height: 10 });
    });

    it("si no hay caja automática (no cabe) no se crea una desde las sobreescrituras", () => {
        expect(applyTrendBoxOverrides(null, { x: 0, y: 0, width: 50, height: 10 })).toBeNull();
    });
});

// ---------------------------------------------------------------------------------------------------
// 6. TrendSparkline — los 4 tipos de gráfico, rotación, mostrar/ocultar Programado, colores por
//    semáforo o fijo, grosor/tamaño, y la regla de NO romper la tooltip clara / nunca <title>.
// ---------------------------------------------------------------------------------------------------
const thresholds = { lowThreshold: 40, midThreshold: 70 };
const points: TrendPoint[] = [
    { label: "Ene", real: 30, programmed: 50, semaphore: "Rojo", thresholds },
    { label: "Feb", real: 90, programmed: 60, semaphore: "Verde", thresholds },
    { label: "Mar", real: 60, programmed: 80, semaphore: "Amarillo", thresholds },
];

function render_(overrides: Partial<TrendSparklineProps> = {}): string {
    const props: TrendSparklineProps = {
        points,
        width: 300,
        height: 60,
        currentIndex: 2,
        colors: { lowColor: "#C00000", mediumColor: "#FFC000", highColor: "#007F38", lowerIsBetter: false },
        programmedColor: "#0078D4",
        format: (value: number) => value.toFixed(1),
        ...overrides,
    };
    return renderToStaticMarkup(React.createElement("svg", null, React.createElement(TrendSparkline, props)));
}

describe("TrendSparkline — 4 tipos de gráfico", () => {
    const chartTypes: TrendChartType[] = ["lineDots", "line", "bars", "area"];

    it("ningún tipo de gráfico usa el atributo SVG <title> (tooltip nativa oscura prohibida, requisito 6)", () => {
        for (const chartType of chartTypes) {
            expect(render_({ chartType })).not.toContain("<title>");
        }
    });

    it("todos los puntos con Real llevan data-trend-index, en todos los tipos de gráfico (tooltip clara)", () => {
        for (const chartType of chartTypes) {
            const markup = render_({ chartType });
            const indices = [...markup.matchAll(/data-trend-index="(\d+)"/g)].map((m) => m[1]);
            expect(indices, chartType).toEqual(expect.arrayContaining(["0", "1", "2"]));
        }
    });

    it('"lineDots": path de la línea de Real + circle por punto', () => {
        const markup = render_({ chartType: "lineDots" });
        expect(markup).toMatch(/<path[^>]*class="trend-real-line"/);
        expect([...markup.matchAll(/<circle[^>]*class="trend-point/g)]).toHaveLength(3);
    });

    it('"line": sin circle visible (solo los de impacto para el tooltip, transparentes)', () => {
        const markup = render_({ chartType: "line", useSemaphoreColors: false });
        expect(markup).not.toMatch(/class="trend-point/);
        // El path o las líneas de segmento llevan el trazo de Real; con useSemaphoreColors apagado es un único path.
        expect(markup).toMatch(/<path[^>]*class="trend-real-line"/);
        // Círculos de impacto (tooltip), invisibles.
        expect([...markup.matchAll(/<circle[^>]*class="trend-hit-point"[^>]*fill="transparent"/g)]).toHaveLength(3);
    });

    it('"line" con colores por semáforo: segmentos <line> coloreados individualmente', () => {
        const markup = render_({ chartType: "line", useSemaphoreColors: true });
        const segments = [...markup.matchAll(/<line[^>]*class="trend-line-segment"[^>]*stroke="([^"]+)"/g)];
        expect(segments).toHaveLength(2); // 3 puntos consecutivos con Real → 2 segmentos
        // Verde (Feb) y Amarillo (Mar): colores de estado distintos entre segmentos.
        expect(segments[0][1]).not.toBe(segments[1][1]);
    });

    it('"bars": un <rect> por punto con Real, con data-trend-index', () => {
        const markup = render_({ chartType: "bars" });
        const bars = [...markup.matchAll(/<rect[^>]*class="trend-bar"[^>]*data-trend-index="(\d+)"/g)];
        expect(bars.map((m) => m[1])).toEqual(["0", "1", "2"]);
    });

    it('"area": un <path> cerrado (Z) con clase trend-area', () => {
        const markup = render_({ chartType: "area" });
        const match = /<path[^>]*class="trend-area"[^>]*d="([^"]+)"/.exec(markup);
        expect(match).not.toBeNull();
        expect(match![1]).toMatch(/^M.*Z$/);
    });

    it("mostrar/ocultar Programado: con showProgrammed=false no se dibuja su línea, en ningún tipo de gráfico", () => {
        for (const chartType of chartTypes) {
            expect(render_({ chartType, showProgrammed: false })).not.toContain("trend-programmed-line");
            expect(render_({ chartType, showProgrammed: true })).toContain("trend-programmed-line");
        }
    });
});

describe("TrendSparkline — rotación por ángulo", () => {
    it("angle=0 (por omisión) no agrega transform al grupo de la serie", () => {
        const markup = render_();
        expect(markup).toMatch(/<g class="trend-sparkline">/);
    });

    it("angle != 0 rota el grupo alrededor del centro de la caja (width/2, height/2)", () => {
        const markup = render_({ angle: 30, width: 300, height: 60 });
        expect(markup).toContain('<g class="trend-sparkline" transform="rotate(30, 150, 30)">');
    });
});

describe("TrendSparkline — colores por semáforo o color fijo", () => {
    it("por omisión (useSemaphoreColors=true), cada punto usa el color de SU semáforo", () => {
        const markup = render_({ chartType: "lineDots" });
        const fills = [...markup.matchAll(/<circle[^>]*class="trend-point[^"]*"[^>]*fill="([^"]+)"/g)].map((m) => m[1]);
        expect(fills).toEqual(["#C00000", "#007F38", "#FFC000"]); // Rojo, Verde, Amarillo
    });

    it("con useSemaphoreColors=false, todos los puntos/barras usan fixedColor", () => {
        const markup = render_({ chartType: "bars", useSemaphoreColors: false, fixedColor: "#123456" });
        const fills = [...markup.matchAll(/<rect[^>]*class="trend-bar"[^>]*fill="([^"]+)"/g)].map((m) => m[1]);
        expect(fills.every((fill) => fill === "#123456")).toBe(true);
    });

    it('"area" con useSemaphoreColors=false: el relleno único usa fixedColor (rama de singleStatusColor sin semáforo)', () => {
        const markup = render_({ chartType: "area", useSemaphoreColors: false, fixedColor: "#654321" });
        const match = /<path[^>]*class="trend-area"[^>]*fill="([^"]+)"/.exec(markup);
        expect(match).not.toBeNull();
        expect(match![1]).toBe("#654321");
    });

    it('"area" sin ningún punto con Real: singleStatusColor cae a la rama index < 0 (lastIndexWithReal = -1) sin lanzar, y no dibuja ningún <path> de área (no hay runs de Real)', () => {
        const noRealPoints: TrendPoint[] = points.map((p) => ({ ...p, real: null }));
        expect(() =>
            render_({
                chartType: "area",
                points: noRealPoints,
                currentIndex: -1,
                fixedColor: "#abcdef",
            })
        ).not.toThrow();
        const markup = render_({ chartType: "area", points: noRealPoints, currentIndex: -1, fixedColor: "#abcdef" });
        expect(markup).not.toContain("trend-area");
    });

    it("alto contraste: el color fijo cede ante el foreground del host (misma precedencia que el resto del medidor)", () => {
        const hc = { foreground: "#FFFF00", background: "#000000" };
        const markup = render_({
            chartType: "bars",
            useSemaphoreColors: false,
            fixedColor: "#123456",
            colors: { lowColor: "#C00000", mediumColor: "#FFC000", highColor: "#007F38", lowerIsBetter: false, highContrast: hc },
        });
        const fills = [...markup.matchAll(/<rect[^>]*class="trend-bar"[^>]*fill="([^"]+)"/g)].map((m) => m[1]);
        expect(fills.every((fill) => fill === "#FFFF00")).toBe(true);
    });
});

describe("TrendSparkline — grosor de línea y tamaño de punto configurables", () => {
    it("lineWidth cambia el stroke-width de la línea de Real", () => {
        const markup = render_({ chartType: "lineDots", lineWidth: 4 });
        expect(markup).toMatch(/<path[^>]*class="trend-real-line"[^>]*stroke-width="4"/);
    });

    it("pointSize cambia el radio de los puntos (el actual conserva el mismo margen por encima)", () => {
        const markup = render_({ chartType: "lineDots", pointSize: 5 });
        const radius = (cls: string) => Number(new RegExp(`<circle[^>]*class="${cls}"[^>]*r="([\\d.]+)"`).exec(markup)?.[1]);
        expect(radius("trend-point")).toBe(5);
        expect(radius("trend-point trend-point-current")).toBe(6.5); // 5 + (4 − 2.5) de 0.3.3.1
    });
});
