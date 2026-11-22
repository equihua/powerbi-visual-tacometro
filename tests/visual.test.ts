import { beforeEach, describe, expect, it, vi } from "vitest";
import powerbi from "powerbi-visuals-api";
import { GaugeData, GaugeSettings } from "../src/components/types";

// react-dom/client necesita DOM; se sustituye para probar solo la extracción de datos.
const render = vi.fn();
vi.mock("react-dom/client", () => ({
    createRoot: () => ({ render }),
}));

import { Visual } from "../src/visual";

import DataView = powerbi.DataView;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

type Role =
    | "measure"
    | "min"
    | "max"
    | "target"
    | "lowThreshold"
    | "midThreshold"
    | "semaphore"
    | "targetWithMargin"
    | "programmed"
    | "previousMonth";
type RawValue = number | string | null | undefined;

/** Acceso controlado a los métodos privados que se prueban. */
interface VisualInternals {
    extractValue(categorical: unknown, roleName: string): number | null;
    extractGaugeData(dataView: DataView): GaugeData;
}

function column(role: Role, value: RawValue, format?: string) {
    return {
        source: { displayName: role, roles: { [role]: true }, format },
        values: [value],
    };
}

function categoricalDataView(
    columns: Partial<Record<Role, RawValue>>,
    options: { objects?: Record<string, Record<string, unknown>>; format?: string } = {}
): DataView {
    const values = (Object.keys(columns) as Role[]).map((role) =>
        column(role, columns[role], role === "measure" ? options.format : undefined)
    );
    return {
        metadata: { columns: [], objects: options.objects },
        categorical: { values },
    } as unknown as DataView;
}

/** Host mínimo: los servicios que usa el constructor/update (A3) como funciones vacías. */
function createVisual(): Visual {
    const noop = () => undefined;
    const host = {
        createSelectionManager: () => ({ showContextMenu: noop }),
        eventService: { renderingStarted: noop, renderingFinished: noop, renderingFailed: noop },
        tooltipService: { enabled: () => true, show: noop, hide: noop },
        colorPalette: { isHighContrast: false },
    };
    const options = { element: new EventTarget() as HTMLElement, host } as unknown as VisualConstructorOptions;
    return new Visual(options);
}

/** Ejecuta update() (API pública) y devuelve las props entregadas a <Gauge>. */
function gaugePropsFor(dataView: DataView): { gaugeData: GaugeData; settings: GaugeSettings } {
    const visual = createVisual();
    render.mockClear();
    visual.update({
        dataViews: [dataView],
        viewport: { width: 300, height: 300 },
    } as unknown as VisualUpdateOptions);
    expect(render).toHaveBeenCalledTimes(1);
    const element = render.mock.calls[0][0] as { props: { gaugeData: GaugeData; settings: GaugeSettings } };
    return element.props;
}

function gaugeDataFor(dataView: DataView): GaugeData {
    return gaugePropsFor(dataView).gaugeData;
}

beforeEach(() => {
    render.mockClear();
});

describe("Visual.extractValue", () => {
    const internals = createVisual() as unknown as VisualInternals;

    it("toma el valor del measure con el rol pedido", () => {
        const categorical = {
            values: [column("measure", 65), column("min", 10), column("target", 80)],
        };
        expect(internals.extractValue(categorical, "measure")).toBe(65);
        expect(internals.extractValue(categorical, "min")).toBe(10);
        expect(internals.extractValue(categorical, "target")).toBe(80);
    });

    it("devuelve null si el rol no está bindeado o no hay values", () => {
        expect(internals.extractValue({ values: [column("measure", 1)] }, "max")).toBeNull();
        expect(internals.extractValue({}, "measure")).toBeNull();
    });

    it("devuelve null para null / undefined", () => {
        expect(internals.extractValue({ values: [column("measure", null)] }, "measure")).toBeNull();
        expect(internals.extractValue({ values: [column("measure", undefined)] }, "measure")).toBeNull();
    });

    it("convierte strings numéricos y rechaza strings no numéricos", () => {
        expect(internals.extractValue({ values: [column("measure", "42.5")] }, "measure")).toBe(42.5);
        expect(internals.extractValue({ values: [column("measure", "abc")] }, "measure")).toBeNull();
        expect(internals.extractValue({ values: [column("measure", "")] }, "measure")).toBeNull();
    });

    it("rechaza NaN e Infinity (bug b: sin NaN propagados)", () => {
        expect(internals.extractValue({ values: [column("measure", Number.NaN)] }, "measure")).toBeNull();
        expect(internals.extractValue({ values: [column("measure", Number.POSITIVE_INFINITY)] }, "measure")).toBeNull();
    });

    it("cae a categories si el rol no está en values", () => {
        const categorical = { values: [], categories: [column("measure", "7")] };
        expect(internals.extractValue(categorical, "measure")).toBe(7);
        expect(internals.extractValue({ categories: [column("measure", null)] }, "measure")).toBeNull();
    });
});

describe("Visual.extractGaugeData (vía update)", () => {
    it("escenario base: min 0, max 100, value 65, umbrales 40/70, target 80", () => {
        const data = gaugeDataFor(
            categoricalDataView({ measure: 65, min: 0, max: 100, lowThreshold: 40, midThreshold: 70, target: 80 })
        );
        expect(data).toMatchObject({
            value: 65,
            min: 0,
            max: 100,
            lowThreshold: 40,
            midThreshold: 70,
            target: 80,
            hasValidData: true,
        });
    });

    it("sin measures de min/max ni panel usa 0 / 100", () => {
        const data = gaugeDataFor(categoricalDataView({ measure: 65 }));
        expect(data.min).toBe(0);
        expect(data.max).toBe(100);
    });

    it("rango no estándar 200..1200 se toma de los datos (bug a)", () => {
        const data = gaugeDataFor(categoricalDataView({ measure: 700, min: 200, max: 1200, target: 1000 }));
        expect(data).toMatchObject({ value: 700, min: 200, max: 1200, target: 1000 });
    });

    it("aplica clamp del valor a [min, max]", () => {
        expect(gaugeDataFor(categoricalDataView({ measure: 150, min: 0, max: 100 })).value).toBe(100);
        expect(gaugeDataFor(categoricalDataView({ measure: -20, min: 0, max: 100 })).value).toBe(0);
        expect(gaugeDataFor(categoricalDataView({ measure: 100, min: 200, max: 1200 })).value).toBe(200);
    });

    it("conserva el valor real sin recortar en actualValue (tooltip/accesibilidad)", () => {
        const data = gaugeDataFor(categoricalDataView({ measure: 150, min: 0, max: 100 }));
        expect(data.value).toBe(100);
        expect(data.actualValue).toBe(150);
    });

    it("measure no numérico / null / NaN → hasValidData = false y valor 0", () => {
        for (const raw of ["abc", null, Number.NaN] as RawValue[]) {
            const data = gaugeDataFor(categoricalDataView({ measure: raw }));
            expect(data.hasValidData).toBe(false);
            expect(data.value).toBe(0);
        }
    });

    it("measure string numérico es válido", () => {
        const data = gaugeDataFor(categoricalDataView({ measure: "12.5" }));
        expect(data.hasValidData).toBe(true);
        expect(data.value).toBe(12.5);
    });

    it("umbrales ausentes → tercios del rango, sin NaN (bug b)", () => {
        const data = gaugeDataFor(categoricalDataView({ measure: 50, min: 0, max: 90 }));
        expect(data.lowThreshold).toBe(30);
        expect(data.midThreshold).toBe(60);
    });

    it("umbrales null / no numéricos se tratan como ausentes", () => {
        const data = gaugeDataFor(
            categoricalDataView({ measure: 50, min: 0, max: 90, lowThreshold: null, midThreshold: "n/a" })
        );
        expect(data.lowThreshold).toBe(30);
        expect(data.midThreshold).toBe(60);
    });

    it("umbrales invertidos o fuera de rango se normalizan", () => {
        const inverted = gaugeDataFor(categoricalDataView({ measure: 50, lowThreshold: 70, midThreshold: 40 }));
        expect([inverted.lowThreshold, inverted.midThreshold]).toEqual([40, 70]);
        const outside = gaugeDataFor(categoricalDataView({ measure: 50, lowThreshold: -10, midThreshold: 300 }));
        expect([outside.lowThreshold, outside.midThreshold]).toEqual([0, 100]);
    });

    it("min == max o min > max se corrige con max = min + 100", () => {
        expect(gaugeDataFor(categoricalDataView({ measure: 50, min: 50, max: 50 }))).toMatchObject({ min: 50, max: 150 });
        expect(gaugeDataFor(categoricalDataView({ measure: 50, min: 100, max: 50 }))).toMatchObject({
            min: 100,
            max: 200,
            value: 100,
        });
    });

    describe("target (bug c)", () => {
        it("ausente → undefined", () => {
            expect(gaugeDataFor(categoricalDataView({ measure: 50 })).target).toBeUndefined();
        });

        it("measure null → undefined", () => {
            expect(gaugeDataFor(categoricalDataView({ measure: 50, target: null })).target).toBeUndefined();
        });

        it("presente como measure", () => {
            expect(gaugeDataFor(categoricalDataView({ measure: 50, target: 80 })).target).toBe(80);
        });

        it("no se recorta al rango (el marcador aplica clamp al dibujar)", () => {
            expect(gaugeDataFor(categoricalDataView({ measure: 50, target: 250 })).target).toBe(250);
        });
    });

    describe("panel de formato (bug d)", () => {
        const objects = { gauge: { min: 10, max: 60, target: 45 } };

        it("usa min / max / target del panel si no hay measures", () => {
            const data = gaugeDataFor(categoricalDataView({ measure: 30 }, { objects }));
            expect(data).toMatchObject({ min: 10, max: 60, target: 45, value: 30 });
        });

        it("el measure bindeado tiene prioridad sobre el panel", () => {
            const data = gaugeDataFor(categoricalDataView({ measure: 30, min: 0, max: 100, target: 90 }, { objects }));
            expect(data).toMatchObject({ min: 0, max: 100, target: 90 });
        });

        it("un measure null no anula el valor del panel", () => {
            const data = gaugeDataFor(categoricalDataView({ measure: 30, min: null, target: null }, { objects }));
            expect(data).toMatchObject({ min: 10, max: 60, target: 45 });
        });
    });

    describe("dataView.single y formato", () => {
        it("lee dataView.single cuando no hay categorical", () => {
            const data = gaugeDataFor({ metadata: { columns: [] }, single: { value: 42 } } as unknown as DataView);
            expect(data).toMatchObject({ value: 42, min: 0, max: 100, hasValidData: true });
        });

        it("dataView.single no numérico → hasValidData = false", () => {
            const data = gaugeDataFor({ metadata: { columns: [] }, single: { value: "x" } } as unknown as DataView);
            expect(data.hasValidData).toBe(false);
            expect(data.value).toBe(0);
        });

        it("detecta porcentaje y decimales del formato del measure", () => {
            const data = gaugeDataFor(categoricalDataView({ measure: 0.5, min: 0, max: 1 }, { format: "0.0%" }));
            expect(data.dataFormat).toEqual({ isPercentage: true, decimalPlaces: 1 });
        });

        it("sin formato y rango <= 1 usa 2 decimales", () => {
            const data = gaugeDataFor(categoricalDataView({ measure: 0.5, min: 0, max: 1 }));
            expect(data.dataFormat).toEqual({ isPercentage: false, decimalPlaces: 2 });
        });
    });
});

describe("B1: rol semaphore (semáforo de la fuente)", () => {
    it("entrega el texto del semáforo tal cual a <Gauge>", () => {
        expect(gaugeDataFor(categoricalDataView({ measure: 50, semaphore: "Verde" })).semaphore).toBe("Verde");
        expect(gaugeDataFor(categoricalDataView({ measure: 50, semaphore: "text-danger" })).semaphore).toBe(
            "text-danger"
        );
    });

    it("sin rol, null o no texto → null (se usa el color calculado)", () => {
        expect(gaugeDataFor(categoricalDataView({ measure: 50 })).semaphore).toBeNull();
        expect(gaugeDataFor(categoricalDataView({ measure: 50, semaphore: null })).semaphore).toBeNull();
        expect(gaugeDataFor(categoricalDataView({ measure: 50, semaphore: 3 })).semaphore).toBeNull();
    });

    it("el semáforo no cuenta como measure numérico", () => {
        expect(gaugeDataFor(categoricalDataView({ semaphore: "Rojo" })).hasValidData).toBe(false);
    });
});

describe("B2: ajuste 'Menor es mejor'", () => {
    it("por defecto es false", () => {
        expect(gaugePropsFor(categoricalDataView({ measure: 50 })).settings.lowerIsBetter).toBe(false);
    });

    it("se lee de ranges.lowerIsBetter", () => {
        const objects = { ranges: { lowerIsBetter: true } };
        expect(gaugePropsFor(categoricalDataView({ measure: 50 }, { objects })).settings.lowerIsBetter).toBe(true);
    });
});

describe("B3: roles de marcadores adicionales", () => {
    it("extrae meta con margen, programado y real del mes anterior de forma independiente", () => {
        const data = gaugeDataFor(
            categoricalDataView({ measure: 50, target: 80, targetWithMargin: 85, programmed: 70, previousMonth: "60" })
        );
        expect(data).toMatchObject({ target: 80, targetWithMargin: 85, programmed: 70, previousMonth: 60 });
    });

    it("roles ausentes o null → undefined", () => {
        const data = gaugeDataFor(categoricalDataView({ measure: 50, programmed: null }));
        expect(data.targetWithMargin).toBeUndefined();
        expect(data.programmed).toBeUndefined();
        expect(data.previousMonth).toBeUndefined();
    });

    it("colores de marcadores: valores por defecto y del panel 'markers'", () => {
        const defaults = gaugePropsFor(categoricalDataView({ measure: 50 })).settings;
        expect(defaults).toMatchObject({
            targetMarginColor: "#605E5C",
            programmedColor: "#0078D4",
            previousMonthColor: "#8764B8",
        });
        const objects = { markers: { programmedColor: { solid: { color: "#123456" } } } };
        expect(gaugePropsFor(categoricalDataView({ measure: 50 }, { objects })).settings.programmedColor).toBe("#123456");
    });
});

describe("Visual.update sin datos", () => {
    it("sin dataViews renderiza el estado vacío", () => {
        const visual = createVisual();
        visual.update({ dataViews: [], viewport: { width: 1, height: 1 } } as unknown as VisualUpdateOptions);
        expect(render).toHaveBeenCalledTimes(1);
        const element = render.mock.calls[0][0] as { props: { gaugeData: GaugeData | null } };
        expect(element.props.gaugeData).toBeNull();
    });
});
