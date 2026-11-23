import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import powerbi from "powerbi-visuals-api";
import { TrendSparkline } from "../src/components/TrendSparkline";
import { TrendPoint } from "../src/components/trend";

const render = vi.fn();
vi.mock("react-dom/client", () => ({
    createRoot: () => ({ render }),
}));

import { Visual } from "../src/visual";

import DataView = powerbi.DataView;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

// 0.3.2.1: al pasar el mouse por un punto de la sparkline mensual, el tooltip del host debe mostrar
// el periodo y los valores de ESE punto, no los del mes actual del medidor.

/** Nodo mínimo del DOM con atributos y `closest("[attr]")` (Node no trae DOM). */
class FakeNode extends EventTarget {
    constructor(private attributes: Record<string, string> = {}, private parent: FakeNode | null = null) {
        super();
    }
    getAttribute(name: string): string | null {
        return this.attributes[name] ?? null;
    }
    closest(selector: string): FakeNode | null {
        const attr = /^\[([\w-]+)\]$/.exec(selector)?.[1];
        for (let node: FakeNode | null = this; node; node = node.parent) {
            if (attr && node.getAttribute(attr) !== null) {
                return node;
            }
        }
        return null;
    }
    getBoundingClientRect() {
        return { left: 100, top: 50, width: 300, height: 300 };
    }
}

function setup() {
    const tooltipService = { enabled: vi.fn(() => true), show: vi.fn(), hide: vi.fn() };
    const host = {
        tooltipService,
        createSelectionManager: () => ({ showContextMenu: vi.fn() }),
        eventService: { renderingStarted: vi.fn(), renderingFinished: vi.fn(), renderingFailed: vi.fn() },
        hostCapabilities: { allowInteractions: true },
        colorPalette: { isHighContrast: false },
    };
    const element = new FakeNode();
    const visual = new Visual({ element: element as unknown as HTMLElement, host } as unknown as VisualConstructorOptions);
    return { element, visual, tooltipService };
}

const months = ["Ene", "Feb", "Mar", "Abr"];
const series: Record<string, Array<number | string | null>> = {
    measure: [80, 88, 91, null],
    programmed: [85, 90, 95, 97],
    semaphore: ["Rojo", "Amarillo", "Verde", null],
    min: [0, 0, 0, 0],
    max: [120, 120, 120, 120],
};

function monthlyDataView(): DataView {
    return {
        metadata: { columns: [] },
        categorical: {
            categories: [{ source: { displayName: "Abrev", roles: { period: true } }, values: months }],
            values: Object.entries(series).map(([role, values]) => ({
                source: { displayName: role, roles: { [role]: true } },
                values,
            })),
        },
    } as unknown as DataView;
}

/** mousemove sobre `target` (el host entrega el evento al elemento raíz del visual). */
function hover(element: FakeNode, target: FakeNode) {
    const event = Object.assign(new Event("mousemove"), { clientX: 160, clientY: 90 });
    Object.defineProperty(event, "target", { value: target });
    element.dispatchEvent(event);
}

describe("0.3.2.1 — tooltip por punto de la sparkline mensual", () => {
    it("cada punto de la sparkline se identifica con el índice de su periodo (data-trend-index)", () => {
        const thresholds = { lowThreshold: 40, midThreshold: 70 };
        const points: TrendPoint[] = [
            { label: "Ene", real: 30, programmed: 50, semaphore: null, thresholds },
            { label: "Feb", real: null, programmed: 60, semaphore: null, thresholds },
            { label: "Mar", real: 60, programmed: null, semaphore: null, thresholds },
        ];
        const markup = renderToStaticMarkup(
            React.createElement("svg", null, React.createElement(TrendSparkline, {
                points, width: 300, height: 60, currentIndex: 2, programmedColor: "#0078D4",
                colors: { lowColor: "#C00000", mediumColor: "#FFC000", highColor: "#007F38", lowerIsBetter: false },
                format: (value: number) => value.toFixed(1),
            }))
        );
        const indices = [...markup.matchAll(/<circle[^>]*data-trend-index="(\d+)"/g)].map((m) => m[1]);
        expect(indices).toEqual(["0", "2"]); // Feb no tiene Real → no hay punto
    });

    it("al pasar por dos puntos distintos, el tooltip muestra el periodo y los valores de cada uno", () => {
        const { element, visual, tooltipService } = setup();
        visual.update({ dataViews: [monthlyDataView()], viewport: { width: 300, height: 300 } } as unknown as VisualUpdateOptions);
        // Puntos como los dibuja TrendSparkline (data-trend-index = índice del periodo en la serie).
        const sparkline = new FakeNode({ class: "trend-sparkline" }, element);
        const ene = new FakeNode({ "data-trend-index": "0" }, sparkline);
        const feb = new FakeNode({ "data-trend-index": "1" }, sparkline);

        hover(element, ene);
        hover(element, feb);

        expect(tooltipService.show).toHaveBeenCalledTimes(2);
        expect(tooltipService.show.mock.calls[0][0].dataItems).toEqual([
            { displayName: "Periodo", value: "Ene" },
            { displayName: "Real", value: "80" },
            { displayName: "Programado", value: "85" },
            { displayName: "Semáforo", value: "Rojo" },
        ]);
        expect(tooltipService.show.mock.calls[1][0].dataItems).toEqual([
            { displayName: "Periodo", value: "Feb" },
            { displayName: "Real", value: "88" },
            { displayName: "Programado", value: "90" },
            { displayName: "Semáforo", value: "Amarillo" },
        ]);
        expect(tooltipService.show.mock.calls[1][0].coordinates).toEqual([60, 40]);
    });

    it("un punto sin Programado ni semáforo sólo muestra Periodo y Real", () => {
        const { element, visual, tooltipService } = setup();
        const dataView = monthlyDataView();
        const values = dataView.categorical!.values! as unknown as Array<{ source: { roles: Record<string, boolean> }; values: unknown[] }>;
        values.find((c) => c.source.roles.programmed)!.values[2] = null;
        values.find((c) => c.source.roles.semaphore)!.values[2] = null;
        visual.update({ dataViews: [dataView], viewport: { width: 300, height: 300 } } as unknown as VisualUpdateOptions);
        hover(element, new FakeNode({ "data-trend-index": "2" }, element));
        expect(tooltipService.show.mock.calls[0][0].dataItems).toEqual([
            { displayName: "Periodo", value: "Mar" },
            { displayName: "Real", value: "91" },
        ]);
    });

    it("un índice que ya no existe en la serie (DOM desfasado) ya no muestra tooltip (0.3.4.0: sin respaldo del medidor completo)", () => {
        const { element, visual, tooltipService } = setup();
        visual.update({ dataViews: [monthlyDataView()], viewport: { width: 300, height: 300 } } as unknown as VisualUpdateOptions);
        hover(element, new FakeNode({ "data-trend-index": "9" }, element));
        expect(tooltipService.show).not.toHaveBeenCalled();

        // Sin serie mensual (sin rol «Periodo») tampoco hay puntos válidos.
        visual.update({
            dataViews: [{ metadata: { columns: [] }, categorical: { values: [{ source: { displayName: "m", roles: { measure: true } }, values: [42] }] } }],
            viewport: { width: 300, height: 300 },
        } as unknown as VisualUpdateOptions);
        hover(element, new FakeNode({ "data-trend-index": "0" }, element));
        expect(tooltipService.show).not.toHaveBeenCalled();
    });

    it("fuera de los puntos (resto del medidor) ya no muestra tooltip (0.3.4.0: se eliminó la tooltip nativa oscura del medidor completo)", () => {
        const { element, visual, tooltipService } = setup();
        visual.update({ dataViews: [monthlyDataView()], viewport: { width: 300, height: 300 } } as unknown as VisualUpdateOptions);
        hover(element, new FakeNode({ class: "trend-sparkline" }, element));
        expect(tooltipService.show).not.toHaveBeenCalled();
    });
});
