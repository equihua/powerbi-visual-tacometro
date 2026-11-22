import { describe, expect, it, vi } from "vitest";
import powerbi from "powerbi-visuals-api";
import { GaugeData } from "../src/components/types";
import { TooltipItem } from "../src/tooltips";

// react-dom/client necesita DOM; se sustituye para probar sólo la extracción de datos.
const render = vi.fn();
vi.mock("react-dom/client", () => ({
    createRoot: () => ({ render }),
}));

import { Visual } from "../src/visual";

import DataView = powerbi.DataView;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

type Cell = number | string | null;

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

/** DataView categórico con el rol «period» (Grouping) y una columna por rol de medida. */
function monthlyDataView(months: Cell[], columns: Record<string, Cell[]>): DataView {
    return {
        metadata: { columns: [] },
        categorical: {
            categories: [{ source: { displayName: "Abrev", roles: { period: true } }, values: months }],
            values: Object.entries(columns).map(([role, values]) => ({
                source: { displayName: role, roles: { [role]: true } },
                values,
            })),
        },
    } as unknown as DataView;
}

function gaugeDataFor(visual: Visual, dataView: DataView): GaugeData {
    render.mockClear();
    visual.update({ dataViews: [dataView], viewport: { width: 300, height: 300 } } as unknown as VisualUpdateOptions);
    return (render.mock.calls[0][0] as { props: { gaugeData: GaugeData } }).props.gaugeData;
}

const months = ["Ene", "Feb", "Mar", "Abr"];
const columns = {
    measure: [80, 88, 91.47, null],
    programmed: [85, 90, 95, 97],
    semaphore: ["Rojo", "Amarillo", "Amarillo", null],
    min: [0, 0, 0, 0],
    max: [120, 120, 120, 120],
    tooltips: [1, 2, 3, 4],
};

describe("0.3.0.0 — rol «Periodo (mes)»: serie mensual", () => {
    it("sin periodo enlazado no hay serie (comportamiento 0.2.0.0)", () => {
        const dataView = {
            metadata: { columns: [] },
            categorical: { values: [{ source: { displayName: "m", roles: { measure: true } }, values: [65] }] },
        } as unknown as DataView;
        const data = gaugeDataFor(createVisual(), dataView);
        expect(data.value).toBe(65);
        expect(data.trend).toBeUndefined();
        expect(data.trendCurrentIndex).toBeUndefined();
    });

    it("construye un punto por mes con Real, Programado y semáforo del mes", () => {
        const data = gaugeDataFor(createVisual(), monthlyDataView(months, columns));
        // Revisión B2: cada punto lleva los umbrales de su mes (sin umbrales: tercios de 0..120).
        const thresholds = { lowThreshold: 40, midThreshold: 80 };
        expect(data.trend).toEqual([
            { label: "Ene", real: 80, programmed: 85, semaphore: "Rojo", thresholds },
            { label: "Feb", real: 88, programmed: 90, semaphore: "Amarillo", thresholds },
            { label: "Mar", real: 91.47, programmed: 95, semaphore: "Amarillo", thresholds },
            { label: "Abr", real: null, programmed: 97, semaphore: null, thresholds },
        ]);
    });

    it("el medidor y el pie muestran el último mes con Real (mes actual)", () => {
        const data = gaugeDataFor(createVisual(), monthlyDataView(months, columns));
        expect(data.trendCurrentIndex).toBe(2);
        expect(data).toMatchObject({ value: 91.47, programmed: 95, semaphore: "Amarillo", min: 0, max: 120, hasValidData: true });
    });

    it("los campos de tooltip también se toman del mes actual", () => {
        const visual = createVisual();
        gaugeDataFor(visual, monthlyDataView(months, columns));
        const extras = (visual as unknown as { tooltipExtras: TooltipItem[] }).tooltipExtras;
        expect(extras).toEqual([{ displayName: "tooltips", value: "3" }]);
    });

    it("sin ningún Real usa el último mes y no hay datos válidos (página de inicio)", () => {
        const data = gaugeDataFor(createVisual(), monthlyDataView(months, { ...columns, measure: [null, null, null, null] }));
        expect(data.trendCurrentIndex).toBe(3);
        expect(data.hasValidData).toBe(false);
    });

    it("etiquetas numéricas o vacías del periodo se convierten a texto", () => {
        const data = gaugeDataFor(createVisual(), monthlyDataView([1, null], { measure: [5, 6] }));
        expect(data.trend?.map((point) => point.label)).toEqual(["1", ""]);
        expect(data.trend?.[0]).toMatchObject({ programmed: null, semaphore: null });
    });

    it("periodo enlazado sin filas no produce serie ni índice inválido", () => {
        const data = gaugeDataFor(createVisual(), monthlyDataView([], { measure: [] }));
        expect(data.trend).toBeUndefined();
        expect(data.trendCurrentIndex).toBeUndefined();
    });
});
