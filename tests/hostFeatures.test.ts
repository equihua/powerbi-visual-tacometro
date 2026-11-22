import { beforeEach, describe, expect, it, vi } from "vitest";
import powerbi from "powerbi-visuals-api";
import { GaugeSettings } from "../src/components/types";

const render = vi.fn();
vi.mock("react-dom/client", () => ({
    createRoot: () => ({ render }),
}));

import { Visual } from "../src/visual";

import DataView = powerbi.DataView;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

/** Elemento mínimo: Node 24 trae EventTarget/Event; no hace falta un DOM completo. */
class FakeElement extends EventTarget {
    getBoundingClientRect() {
        return { left: 100, top: 50, width: 300, height: 200 };
    }
}

function fire(element: EventTarget, type: string, props: Record<string, unknown> = {}): Event {
    const event = Object.assign(new Event(type, { cancelable: true }), props);
    element.dispatchEvent(event);
    return event;
}

function createHost(overrides: { allowInteractions?: boolean; highContrast?: boolean } = {}) {
    return {
        tooltipService: { enabled: vi.fn(() => true), show: vi.fn(), hide: vi.fn(), move: vi.fn() },
        selectionManager: { showContextMenu: vi.fn(() => Promise.resolve({})) },
        eventService: { renderingStarted: vi.fn(), renderingFinished: vi.fn(), renderingFailed: vi.fn() },
        hostCapabilities: { allowInteractions: overrides.allowInteractions ?? true },
        colorPalette: {
            isHighContrast: overrides.highContrast ?? false,
            foreground: { value: "#FFFF00" },
            background: { value: "#000000" },
        },
    };
}

function setup(overrides: Parameters<typeof createHost>[0] = {}) {
    const host = createHost(overrides);
    const element = new FakeElement();
    const visual = new Visual({
        element: element as unknown as HTMLElement,
        host: { ...host, createSelectionManager: () => host.selectionManager },
    } as unknown as VisualConstructorOptions);
    return { host, element, visual };
}

function dataView(objects?: Record<string, unknown>): DataView {
    const col = (role: string, value: unknown, displayName = role) => ({
        source: { displayName, roles: { [role]: true } },
        values: [value],
    });
    return {
        metadata: { columns: [], objects },
        categorical: {
            values: [col("measure", 65), col("target", 80), col("tooltips", "min/cliente", "Unidad")],
        },
    } as unknown as DataView;
}

function update(visual: Visual, dv: DataView = dataView()): VisualUpdateOptions {
    const options = { dataViews: [dv], viewport: { width: 300, height: 200 } } as unknown as VisualUpdateOptions;
    visual.update(options);
    return options;
}

function lastProps(): { settings: GaugeSettings; onRendered?: () => void } {
    return render.mock.calls[render.mock.calls.length - 1][0].props;
}

beforeEach(() => render.mockClear());

describe("A3 Tooltips (tooltipService)", () => {
    it("mousemove muestra el tooltip con valor, objetivo y campos del rol 'tooltips'", () => {
        const { host, element, visual } = setup();
        update(visual);
        fire(element, "mousemove", { clientX: 160, clientY: 90 });
        expect(host.tooltipService.show).toHaveBeenCalledTimes(1);
        const args = host.tooltipService.show.mock.calls[0][0];
        expect(args.coordinates).toEqual([60, 40]);
        expect(args.isTouchEvent).toBe(false);
        expect(args.identities).toEqual([]);
        expect(args.dataItems).toContainEqual({ displayName: "Valor", value: "65" });
        expect(args.dataItems).toContainEqual({ displayName: "Objetivo", value: "80" });
        expect(args.dataItems).toContainEqual({ displayName: "Unidad", value: "min/cliente" });
    });

    it("mouseleave oculta el tooltip", () => {
        const { host, element, visual } = setup();
        update(visual);
        fire(element, "mouseleave");
        expect(host.tooltipService.hide).toHaveBeenCalledWith({ immediately: true, isTouchEvent: false });
    });

    it("sin datos válidos no muestra tooltip", () => {
        const { host, element } = setup();
        fire(element, "mousemove", { clientX: 1, clientY: 1 });
        expect(host.tooltipService.show).not.toHaveBeenCalled();
    });
});

describe("A3 Keyboard Navigation", () => {
    it("al recibir foco muestra el tooltip en el centro y al perderlo lo oculta", () => {
        const { host, element, visual } = setup();
        update(visual);
        fire(element, "focusin");
        expect(host.tooltipService.show.mock.calls[0][0].coordinates).toEqual([150, 100]);
        fire(element, "focusout");
        expect(host.tooltipService.hide).toHaveBeenCalled();
    });

    it("Shift+F10 o la tecla ContextMenu abren el menú contextual en el centro", () => {
        const { host, element, visual } = setup();
        update(visual);
        const event = fire(element, "keydown", { key: "F10", shiftKey: true });
        fire(element, "keydown", { key: "ContextMenu" });
        fire(element, "keydown", { key: "a" });
        expect(event.defaultPrevented).toBe(true);
        expect(host.selectionManager.showContextMenu).toHaveBeenCalledTimes(2);
        expect(host.selectionManager.showContextMenu).toHaveBeenCalledWith({}, { x: 250, y: 150 });
    });
});

describe("A3 Context Menu", () => {
    it("clic derecho abre el menú contextual del visual en la posición del cursor", () => {
        const { host, element, visual } = setup();
        update(visual);
        const event = fire(element, "contextmenu", { clientX: 120, clientY: 70 });
        expect(event.defaultPrevented).toBe(true);
        expect(host.selectionManager.showContextMenu).toHaveBeenCalledWith({}, { x: 120, y: 70 });
    });
});

describe("A3 Allow Interactions", () => {
    it("con allowInteractions = false no hay tooltip ni menú contextual", () => {
        const { host, element, visual } = setup({ allowInteractions: false });
        update(visual);
        fire(element, "mousemove", { clientX: 1, clientY: 1 });
        fire(element, "focusin");
        const event = fire(element, "contextmenu", { clientX: 1, clientY: 1 });
        expect(host.tooltipService.show).not.toHaveBeenCalled();
        expect(host.selectionManager.showContextMenu).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });
});

describe("A3 Rendering Events", () => {
    it("renderingStarted al iniciar; renderingFinished cuando <Gauge> confirma el render", () => {
        const { host, visual } = setup();
        const options = update(visual);
        expect(host.eventService.renderingStarted).toHaveBeenCalledWith(options);
        expect(host.eventService.renderingFinished).not.toHaveBeenCalled();
        lastProps().onRendered?.();
        expect(host.eventService.renderingFinished).toHaveBeenCalledWith(options);
    });

    it("renderingFailed si la actualización lanza un error", () => {
        const { host, visual } = setup();
        render.mockImplementationOnce(() => {
            throw new Error("boom");
        });
        const options = update(visual);
        expect(host.eventService.renderingFailed).toHaveBeenCalledWith(options, "boom");
    });
});

describe("A3 High Contrast (host.colorPalette)", () => {
    it("aplica foreground/background del host cuando isHighContrast", () => {
        const { visual } = setup({ highContrast: true });
        update(visual);
        expect(lastProps().settings.highContrast).toEqual({ foreground: "#FFFF00", background: "#000000" });
    });

    it("sin alto contraste conserva los colores del panel", () => {
        const { visual } = setup();
        update(visual);
        expect(lastProps().settings.highContrast).toBeUndefined();
        expect(lastProps().settings.lowColor).toBe("#C00000");
    });
});
