import { describe, expect, it, vi } from "vitest";
import powerbi from "powerbi-visuals-api";

// react-dom/client necesita DOM; se sustituye para probar sólo getFormattingModel().
const render = vi.fn();
vi.mock("react-dom/client", () => ({
    createRoot: () => ({ render }),
}));

import { Visual } from "../src/visual";
import { computeGaugeFrame } from "../src/components/layout";
import { computeInnerTrendBoxForChartType } from "../src/components/trend";
import { boxToPercent } from "../src/components/trendBoxPercent";

import DataView = powerbi.DataView;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

type Cell = number | string | null;

const TREND_AUTO_UIDS = ["trend-posXPct", "trend-posYPct", "trend-widthPct", "trend-heightPct", "trend-yMin", "trend-yMax", "trend-pointSize"];

function createVisual(): Visual {
    const noop = () => undefined;
    const host = {
        createSelectionManager: () => ({ showContextMenu: noop }),
        eventService: { renderingStarted: noop, renderingFinished: noop, renderingFailed: noop },
        tooltipService: { enabled: () => true, show: noop, hide: noop },
        colorPalette: { isHighContrast: false },
    };
    return new Visual({ element: new EventTarget() as HTMLElement, host } as unknown as VisualConstructorOptions);
}

/** DataView categórico con el rol «period» (serie mensual) y una columna por rol de medida. */
function monthlyDataView(
    months: Cell[],
    columns: Record<string, Cell[]>,
    objects?: Record<string, Record<string, unknown>>
): DataView {
    return {
        metadata: { columns: [], objects },
        categorical: {
            categories: [{ source: { displayName: "Abrev", roles: { period: true } }, values: months }],
            values: Object.entries(columns).map(([role, values]) => ({
                source: { displayName: role, roles: { [role]: true } },
                values,
            })),
        },
    } as unknown as DataView;
}

function update(visual: Visual, dataView: DataView, viewport = { width: 300, height: 300 }): void {
    visual.update({ dataViews: [dataView], viewport } as unknown as VisualUpdateOptions);
}

/** Valor (`control.properties.value`) del slice NumUpDown `trend-<uid>` del modelo construido; undefined si no está. */
function trendValue(model: powerbi.visuals.FormattingModel, uid: string): unknown {
    const trendCard = model.cards.find((card): card is powerbi.visuals.FormattingCard => "uid" in card && card.uid === "trend-card");
    for (const group of trendCard?.groups ?? []) {
        if (!("slices" in group)) continue;
        for (const slice of group.slices ?? []) {
            if ("control" in slice && slice.uid === uid && slice.control.type === "NumUpDown") {
                return slice.control.properties.value;
            }
        }
    }
    return undefined;
}

const months = ["Ene", "Feb", "Mar"];
const columns = {
    measure: [80, 88, 91.47],
    programmed: [85, 90, 95],
};

describe("0.4.1.0 — getFormattingModel(): defaults efectivos de la tarjeta «Gráfico de tendencia»", () => {
    it("las 7 propiedades auto (posX/posY/width/height/yMin/yMax/pointSize) nunca quedan en blanco con serie + pie", () => {
        const visual = createVisual();
        update(visual, monthlyDataView(months, columns));
        const model = visual.getFormattingModel();
        for (const uid of TREND_AUTO_UIDS) {
            const value = trendValue(model, uid);
            expect(value, uid).not.toBeUndefined();
            expect(typeof value).toBe("number");
            expect(Number.isFinite(value as number)).toBe(true);
        }
    });

    it("posX/posY/width/height coinciden con la caja automática convertida a % (misma geometría que Gauge.tsx)", () => {
        const visual = createVisual();
        update(visual, monthlyDataView(months, columns));
        const model = visual.getFormattingModel();
        // Valores calculados por computeGaugeGeometry/boxToPercent para viewport 300x300 con esta serie (ver layout.ts/trendBoxPercent.ts).
        expect(trendValue(model, "trend-posXPct")).toBeCloseTo(11.81, 1);
        expect(trendValue(model, "trend-posYPct")).toBeCloseTo(75.82, 1);
        expect(trendValue(model, "trend-widthPct")).toBeCloseTo(86.19, 1);
        expect(trendValue(model, "trend-heightPct")).toBeCloseTo(13.05, 1);
    });

    /**
     * 0.4.1.1 — RED del desajuste panel vs render para chartType "bars": `computeDisplayDefaults`
     * (visual.ts) calculaba la caja "auto" mostrada en el panel con `computeGaugeGeometry`
     * (layout.ts → `computeInnerTrendBox` sin holgura de barra), mientras que Gauge.tsx YA renderiza
     * con `computeInnerTrendBoxForChartType` (trend.ts, holgura = mitad del ancho real de la barra
     * para "bars"). Con 3 meses a 300×300 la diferencia es grande (~32px de ancho, ~12%): el panel
     * mostraba un "automático" más ancho/desplazado que la caja de verdad dibujada, engañoso para
     * quien ajusta posX/width a mano partiendo de ese valor. El "expected" se calcula aquí con las
     * MISMAS funciones que Gauge.tsx usa para dibujar (computeGaugeFrame + computeInnerTrendBoxForChartType),
     * nunca un número mágico — así la prueba sigue siendo válida si cambia cualquier fórmula de layout.
     */
    it("chartType=\"bars\": posX/posY/width/height efectivos coinciden con la caja que Gauge.tsx REALMENTE dibuja (computeInnerTrendBoxForChartType), no con la caja nominal sin holgura de barra", () => {
        const objects = { trend: { chartType: "bars" } };
        const visual = createVisual();
        update(visual, monthlyDataView(months, columns, objects));
        const model = visual.getFormattingModel();

        const viewport = { width: 300, height: 300 };
        const gaugeHeight = viewport.height - 40; // FOOTER_HEIGHT (layout.ts)
        const thickness = 20; // default settings.ts
        const startAngle = -120;
        const endAngle = 60;
        const frame = computeGaugeFrame(viewport.width, gaugeHeight, thickness, startAngle, endAngle, true);
        const renderedBox = computeInnerTrendBoxForChartType(
            frame.radius, thickness, startAngle, endAngle, viewport.width, true, "bars", months.length
        )!;
        const expected = boxToPercent(renderedBox, { x: frame.cx, y: frame.cy }, viewport);

        expect(trendValue(model, "trend-posXPct")).toBeCloseTo(expected.posX, 2);
        expect(trendValue(model, "trend-posYPct")).toBeCloseTo(expected.posY, 2);
        expect(trendValue(model, "trend-widthPct")).toBeCloseTo(expected.width, 2);
        expect(trendValue(model, "trend-heightPct")).toBeCloseTo(expected.height, 2);
    });

    it("yMin/yMax son el dominio automático Real+Programado ± 10%, independiente de yScaleMode seleccionado", () => {
        // Real: 80,88,91.47 · Programado: 85,90,95 → low=80, high=95, margen = 15*0.1 = 1.5.
        const objects = { trend: { yScaleMode: { displayName: "Desde cero", value: "zero" } } };
        const visual = createVisual();
        update(visual, monthlyDataView(months, columns, objects));
        const model = visual.getFormattingModel();
        expect(trendValue(model, "trend-yMin")).toBeCloseTo(78.5, 5);
        expect(trendValue(model, "trend-yMax")).toBeCloseTo(96.5, 5);
    });

    it("pointSize efectivo es proporcional al grosor de línea configurado (lineWidth × 2.5/1.5)", () => {
        const objects = { trend: { lineWidth: 3 } };
        const visual = createVisual();
        update(visual, monthlyDataView(months, columns, objects));
        const model = visual.getFormattingModel();
        expect(trendValue(model, "trend-pointSize")).toBeCloseTo(5, 5);
    });

    it("sin serie mensual (sin período enlazado) posX/posY/width/height quedan en blanco, pero yMin/yMax/pointSize siguen con su default", () => {
        const dataView = {
            metadata: { columns: [] },
            categorical: { values: [{ source: { displayName: "m", roles: { measure: true } }, values: [65] }] },
        } as unknown as DataView;
        const visual = createVisual();
        update(visual, dataView);
        const model = visual.getFormattingModel();
        expect(trendValue(model, "trend-posXPct")).toBeUndefined();
        expect(trendValue(model, "trend-posYPct")).toBeUndefined();
        expect(trendValue(model, "trend-widthPct")).toBeUndefined();
        expect(trendValue(model, "trend-heightPct")).toBeUndefined();
        // Sin valores Real/Programado el dominio "auto" cae al caso límite V == 0 → margen fijo ±1.
        expect(trendValue(model, "trend-yMin")).toBe(-1);
        expect(trendValue(model, "trend-yMax")).toBe(1);
        expect(trendValue(model, "trend-pointSize")).toBe(2.5);
    });

    it("un valor explícito del panel NUNCA se sobreescribe con el default efectivo", () => {
        const objects = {
            trend: { posXPct: 5, posYPct: 10, widthPct: 20, heightPct: 30, yMin: 1, yMax: 2, pointSize: 9 },
        };
        const visual = createVisual();
        update(visual, monthlyDataView(months, columns, objects));
        const model = visual.getFormattingModel();
        expect(trendValue(model, "trend-posXPct")).toBe(5);
        expect(trendValue(model, "trend-posYPct")).toBe(10);
        expect(trendValue(model, "trend-widthPct")).toBe(20);
        expect(trendValue(model, "trend-heightPct")).toBe(30);
        expect(trendValue(model, "trend-yMin")).toBe(1);
        expect(trendValue(model, "trend-yMax")).toBe(2);
        expect(trendValue(model, "trend-pointSize")).toBe(9);
    });

    it("rellenar el panel NO escribe overrides: el modelo de settings vivo sigue sin valor y el reset (revertToDefaultDescriptors) sigue disponible para las 7 propiedades", () => {
        const visual = createVisual();
        update(visual, monthlyDataView(months, columns));
        const model = visual.getFormattingModel();
        // El modelo de settings interno (fuente de extractSettings() en el siguiente render) no se tocó.
        const liveSettings = (visual as unknown as { formattingSettings: { trendCard: Record<string, { value: unknown }> } })
            .formattingSettings.trendCard;
        expect(liveSettings.posXPct.value).toBeUndefined();
        expect(liveSettings.posYPct.value).toBeUndefined();
        expect(liveSettings.widthPct.value).toBeUndefined();
        expect(liveSettings.heightPct.value).toBeUndefined();
        expect(liveSettings.yMin.value).toBeUndefined();
        expect(liveSettings.yMax.value).toBeUndefined();
        expect(liveSettings.pointSize.value).toBeUndefined();
        // Reset a "automático": el descriptor existe para las 7 propiedades sin depender del valor mostrado.
        const trendCard = model.cards.find((card): card is powerbi.visuals.FormattingCard => "uid" in card && card.uid === "trend-card");
        const propertyNames = (trendCard?.revertToDefaultDescriptors ?? []).map((descriptor) => descriptor.propertyName);
        for (const property of ["posXPct", "posYPct", "widthPct", "heightPct", "yMin", "yMax", "pointSize"]) {
            expect(propertyNames).toContain(property);
        }
        // Llamar getFormattingModel() otra vez sin volver a renderizar da el mismo resultado (idempotente).
        const second = visual.getFormattingModel();
        expect(trendValue(second, "trend-posXPct")).toBe(trendValue(model, "trend-posXPct"));
        expect(liveSettings.posXPct.value).toBeUndefined();
    });
});

/**
 * 0.4.1.1 — `trend-angle` NUNCA queda sin valor (default 0°, no "auto" como las 7 propiedades de
 * arriba): `getFormattingModel()` (visual.ts) sobreescribe el valor MOSTRADO con el ángulo EFECTIVO
 * (`clampTrendAngle`, mismo límite ±TREND_MAX_ANGLE_DEG que settings.ts valida y Gauge.tsx aplica en
 * tiempo de ejecución) cuando el valor guardado lo excede o no es finito — así el panel siempre
 * refleja lo que de verdad se dibuja, sin escribir ningún override real en el documento (el modelo de
 * settings vivo, `formattingSettings.trendCard.angle.value`, nunca se toca).
 */
describe("0.4.1.1 — getFormattingModel(): ángulo EFECTIVO (recortado a ±TREND_MAX_ANGLE_DEG) de la tarjeta «Gráfico de tendencia»", () => {
    it("sin tocar el panel (default 0°, dentro de rango): se muestra tal cual, 0", () => {
        const visual = createVisual();
        update(visual, monthlyDataView(months, columns));
        const model = visual.getFormattingModel();
        expect(trendValue(model, "trend-angle")).toBe(0);
    });

    it("un ángulo guardado DENTRO de ±TREND_MAX_ANGLE_DEG se muestra tal cual, sin recortar", () => {
        const objects = { trend: { angle: 5 } };
        const visual = createVisual();
        update(visual, monthlyDataView(months, columns, objects));
        const model = visual.getFormattingModel();
        expect(trendValue(model, "trend-angle")).toBe(5);

        const negative = createVisual();
        update(negative, monthlyDataView(months, columns, { trend: { angle: -5 } }));
        expect(trendValue(negative.getFormattingModel(), "trend-angle")).toBe(-5);
    });

    it("un ángulo guardado FUERA de ±TREND_MAX_ANGLE_DEG (15°, la estimación inicial descartada; también 100°) se muestra recortado a ±8, nunca el valor nominal guardado", () => {
        for (const stored of [15, 100]) {
            const visual = createVisual();
            update(visual, monthlyDataView(months, columns, { trend: { angle: stored } }));
            const model = visual.getFormattingModel();
            expect(trendValue(model, "trend-angle")).toBe(8);
        }
        const negative = createVisual();
        update(negative, monthlyDataView(months, columns, { trend: { angle: -100 } }));
        expect(trendValue(negative.getFormattingModel(), "trend-angle")).toBe(-8);
    });

    it("un ángulo guardado no finito (NaN/Infinity) se muestra como 0° (mismo criterio que finiteAngle en visual.ts)", () => {
        for (const stored of [NaN, Infinity, -Infinity]) {
            const visual = createVisual();
            update(visual, monthlyDataView(months, columns, { trend: { angle: stored } }));
            expect(trendValue(visual.getFormattingModel(), "trend-angle")).toBe(0);
        }
    });

    it("el recorte sólo afecta el valor MOSTRADO en este FormattingModel: el modelo de settings vivo conserva el valor nominal guardado (extractSettings/Gauge.tsx lo recortan por su lado, por separado)", () => {
        const visual = createVisual();
        update(visual, monthlyDataView(months, columns, { trend: { angle: 100 } }));
        const model = visual.getFormattingModel();
        expect(trendValue(model, "trend-angle")).toBe(8);
        const liveAngle = (visual as unknown as { formattingSettings: { trendCard: { angle: { value: number } } } })
            .formattingSettings.trendCard.angle.value;
        expect(liveAngle).toBe(100); // sin override real escrito: sigue siendo el valor guardado tal cual.
    });
});
