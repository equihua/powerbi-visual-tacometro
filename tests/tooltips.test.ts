import { describe, expect, it } from "vitest";
import { buildAriaLabel, buildTooltipItems } from "../src/tooltips";
import { GaugeData } from "../src/components/types";

function data(overrides: Partial<GaugeData> = {}): GaugeData {
    return {
        value: 65.25,
        min: 0,
        max: 100,
        lowThreshold: 40,
        midThreshold: 70,
        hasValidData: true,
        dataFormat: { decimalPlaces: 1, isPercentage: false },
        semaphore: null,
        ...overrides,
    };
}

describe("A3 Tooltips: buildTooltipItems", () => {
    it("incluye valor, mínimo y máximo con el formato del measure", () => {
        expect(buildTooltipItems(data())).toEqual([
            { displayName: "Valor", value: "65.3" },
            { displayName: "Mínimo", value: "0.0" },
            { displayName: "Máximo", value: "100.0" },
        ]);
    });

    it("añade sólo los marcadores presentes y el semáforo de la fuente", () => {
        const items = buildTooltipItems(data({ target: 80, programmed: 70, previousMonth: 60, semaphore: "Verde" }));
        expect(items.slice(3)).toEqual([
            { displayName: "Objetivo", value: "80.0" },
            { displayName: "Programado", value: "70.0" },
            { displayName: "Real mes anterior", value: "60.0" },
            { displayName: "Semáforo", value: "Verde" },
        ]);
    });

    it("añade los campos del rol 'tooltips' al final", () => {
        const items = buildTooltipItems(data({ targetWithMargin: 85 }), [
            { displayName: "Unidad", value: "min/cliente" },
        ]);
        expect(items.slice(3)).toEqual([
            { displayName: "Meta con margen", value: "85.0" },
            { displayName: "Unidad", value: "min/cliente" },
        ]);
    });

    it("muestra el valor real del measure aunque el dibujo lo recorte a [min, max]", () => {
        const items = buildTooltipItems(data({ value: 100, actualValue: 120 }));
        expect(items[0]).toEqual({ displayName: "Valor", value: "120.0" });
    });

    it("la etiqueta accesible anuncia el valor real, no el recortado", () => {
        expect(buildAriaLabel(data({ value: 0, actualValue: -5 }))).toContain("Valor: -5.0");
    });
});
