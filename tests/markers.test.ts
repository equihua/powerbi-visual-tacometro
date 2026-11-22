import { describe, expect, it } from "vitest";
import { buildMarkers, TARGET_MARKER_COLOR } from "../src/components/markers";

const COLORS = { targetMarginColor: "#AAA", programmedColor: "#BBB", previousMonthColor: "#CCC" };

describe("B3: buildMarkers (marcadores independientes)", () => {
    it("sin valores no hay marcadores", () => {
        expect(buildMarkers({}, COLORS)).toEqual([]);
    });

    it("genera los 4 marcadores con forma, color y etiqueta distintos", () => {
        const markers = buildMarkers({ target: 80, targetWithMargin: 85, programmed: 70, previousMonth: 60 }, COLORS);
        expect(markers).toEqual([
            { kind: "target", label: "Objetivo", value: 80, color: TARGET_MARKER_COLOR, shape: "line" },
            { kind: "targetWithMargin", label: "Meta con margen", value: 85, color: "#AAA", shape: "dashed" },
            { kind: "programmed", label: "Programado", value: 70, color: "#BBB", shape: "triangle" },
            { kind: "previousMonth", label: "Real mes anterior", value: 60, color: "#CCC", shape: "circle" },
        ]);
        expect(new Set(markers.map((m) => m.shape)).size).toBe(4);
    });

    it("cada marcador es independiente: sólo aparecen los que tienen valor finito", () => {
        const markers = buildMarkers({ programmed: 70, previousMonth: Number.NaN }, COLORS);
        expect(markers.map((m) => m.kind)).toEqual(["programmed"]);
    });

    it("conserva el objetivo original (compatibilidad con el rol target)", () => {
        expect(buildMarkers({ target: 0 }, COLORS).map((m) => m.kind)).toEqual(["target"]);
    });
});
