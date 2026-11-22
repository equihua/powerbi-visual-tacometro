import { describe, expect, it, vi } from "vitest";
import powerbi from "powerbi-visuals-api";
import { GaugeData } from "../src/components/types";
import { TooltipItem } from "../src/tooltips";

// Revisión independiente 0.3.0.0: bloqueadores 1 (orden y mes actual) y 2 (semáforo por periodo).
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

/** Categorías por rol (period / periodOrder) y una columna de valores por rol de medida. */
function dataView(categories: Record<string, Cell[]>, columns: Record<string, Cell[]>): DataView {
    return {
        metadata: { columns: [] },
        categorical: {
            categories: Object.entries(categories).map(([role, values]) => ({
                source: { displayName: role, roles: { [role]: true } },
                values,
            })),
            values: Object.entries(columns).map(([role, values]) => ({
                source: { displayName: role, roles: { [role]: true } },
                values,
            })),
        },
    } as unknown as DataView;
}

function gaugeDataFor(visual: Visual, view: DataView): GaugeData {
    render.mockClear();
    visual.update({ dataViews: [view], viewport: { width: 300, height: 300 } } as unknown as VisualUpdateOptions);
    return (render.mock.calls[0][0] as { props: { gaugeData: GaugeData } }).props.gaugeData;
}

const extrasOf = (visual: Visual) => (visual as unknown as { tooltipExtras: TooltipItem[] }).tooltipExtras;

// Filas en un orden de host NO cronológico (Mar, Ene, Abr, Feb).
const shuffled = { period: ["Mar", "Ene", "Abr", "Feb"], periodOrder: [3, 1, 4, 2] };
const shuffledColumns = {
    measure: [91.47, 80, null, 88],
    programmed: [95, 85, 97, 90],
    min: [0, 0, 0, 0],
    max: [120, 120, 120, 120],
    tooltips: [3, 1, 4, 2],
};

describe("B1 — orden cronológico determinista con «Orden del periodo»", () => {
    it("la serie se ordena por la clave explícita, no por el orden de filas del host", () => {
        const data = gaugeDataFor(createVisual(), dataView(shuffled, shuffledColumns));
        expect(data.trend?.map((point) => point.label)).toEqual(["Ene", "Feb", "Mar", "Abr"]);
        expect(data.trend?.map((point) => point.real)).toEqual([80, 88, 91.47, null]);
    });

    it("el mes actual por omisión es el último con Real en orden cronológico (Mar), no la última fila del host", () => {
        const visual = createVisual();
        const data = gaugeDataFor(visual, dataView(shuffled, shuffledColumns));
        expect(data.trendCurrentIndex).toBe(2);
        expect(data).toMatchObject({ value: 91.47, programmed: 95, hasValidData: true });
        expect(extrasOf(visual)).toEqual([{ displayName: "tooltips", value: "3" }]);
    });

    it("sin «Orden del periodo» no se infiere orden desde las abreviaturas: se respeta el orden del host", () => {
        const data = gaugeDataFor(createVisual(), dataView({ period: shuffled.period }, shuffledColumns));
        expect(data.trend?.map((point) => point.label)).toEqual(["Mar", "Ene", "Abr", "Feb"]);
    });

    it("con sólo «Orden del periodo» (sin etiqueta) la clave sirve de etiqueta y ordena la serie", () => {
        const data = gaugeDataFor(createVisual(), dataView({ periodOrder: shuffled.periodOrder }, shuffledColumns));
        expect(data.trend?.map((point) => point.label)).toEqual(["1", "2", "3", "4"]);
        expect(data.value).toBe(91.47);
    });
});

describe("B1 — «Periodo actual» explícito conserva la semántica del valor actual", () => {
    it("con clave de orden, el medidor, el pie y los tooltips usan la fila cuyo orden = Periodo actual", () => {
        const visual = createVisual();
        const data = gaugeDataFor(visual, dataView(shuffled, { ...shuffledColumns, currentPeriod: [2, 2, 2, 2] }));
        expect(data.trendCurrentIndex).toBe(1);
        expect(data).toMatchObject({ value: 88, programmed: 90, hasValidData: true });
        expect(extrasOf(visual)).toEqual([{ displayName: "tooltips", value: "2" }]);
    });

    it("sin clave de orden, Periodo actual se compara con la etiqueta del periodo", () => {
        const data = gaugeDataFor(createVisual(), dataView({ period: shuffled.period }, { ...shuffledColumns, currentPeriod: ["Ene", "Ene", "Ene", "Ene"] }));
        expect(data.trendCurrentIndex).toBe(1);
        expect(data.value).toBe(80);
    });

    it("si Periodo actual no coincide con ninguna fila no se elige otra: sin dato actual (página de inicio)", () => {
        const data = gaugeDataFor(createVisual(), dataView(shuffled, { ...shuffledColumns, currentPeriod: [12, 12, 12, 12] }));
        expect(data.trendCurrentIndex).toBeUndefined();
        expect(data.hasValidData).toBe(false);
        expect(data.trend).toHaveLength(4);
    });
});

describe("B2 — estado de cada punto con datos de su propio periodo", () => {
    const months = { period: ["Ene", "Feb"], periodOrder: [1, 2] };

    it("«Semáforo por periodo» define el semáforo de cada punto; el del medidor sigue saliendo de «semaphore»", () => {
        const data = gaugeDataFor(createVisual(), dataView(months, {
            measure: [50, 60],
            semaphore: ["#9c9c9c", "#FFC107"],
            trendSemaphore: ["#D50000", "#158d67"],
        }));
        expect(data.trend?.map((point) => point.semaphore)).toEqual(["#D50000", "#158d67"]);
        expect(data.semaphore).toBe("#FFC107");
    });

    it("sin valor de «Semáforo por periodo» en un mes, ese punto usa el semáforo del medidor evaluado en su mes", () => {
        const data = gaugeDataFor(createVisual(), dataView(months, {
            measure: [50, 60],
            semaphore: ["Rojo", "Verde"],
            trendSemaphore: [null, "Amarillo"],
        }));
        expect(data.trend?.map((point) => point.semaphore)).toEqual(["Rojo", "Amarillo"]);
    });

    it("cada punto lleva los umbrales de su propio periodo (no los del mes actual)", () => {
        const data = gaugeDataFor(createVisual(), dataView(months, {
            measure: [50, 60],
            min: [0, 0],
            max: [100, 100],
            lowThreshold: [20, 70],
            midThreshold: [40, 90],
        }));
        expect(data.trend?.map((point) => point.thresholds)).toEqual([
            { lowThreshold: 20, midThreshold: 40 },
            { lowThreshold: 70, midThreshold: 90 },
        ]);
        expect(data).toMatchObject({ lowThreshold: 70, midThreshold: 90 });
    });

    it("sin umbrales enlazados, cada periodo usa los tercios de su propio rango", () => {
        const data = gaugeDataFor(createVisual(), dataView(months, { measure: [50, 60], min: [0, 0], max: [90, 300] }));
        expect(data.trend?.map((point) => point.thresholds)).toEqual([
            { lowThreshold: 30, midThreshold: 60 },
            { lowThreshold: 100, midThreshold: 200 },
        ]);
    });
});
