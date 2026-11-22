import { describe, expect, it } from "vitest";
import { createPerformanceColorScale, rangeBandColors } from "../src/components/scales";

const COLORS = { lowColor: "LOW", mediumColor: "MED", highColor: "HIGH" };

describe("B2: 'Menor es mejor' (tendencia descendente favorable)", () => {
    describe("createPerformanceColorScale con lowerIsBetter", () => {
        const color = createPerformanceColorScale(40, 70, COLORS, true);

        it("valores bajos (<= umbral bajo) son favorables → color alto", () => {
            expect(color(0)).toBe("HIGH");
            expect(color(40)).toBe("HIGH");
        });

        it("valores intermedios conservan el color medio", () => {
            expect(color(40.01)).toBe("MED");
            expect(color(70)).toBe("MED");
        });

        it("valores altos (> umbral medio) son desfavorables → color bajo", () => {
            expect(color(70.01)).toBe("LOW");
            expect(color(100)).toBe("LOW");
        });

        it("lowerIsBetter = false conserva el comportamiento ascendente previo", () => {
            const asc = createPerformanceColorScale(40, 70, COLORS, false);
            expect([asc(10), asc(50), asc(90)]).toEqual(["LOW", "MED", "HIGH"]);
        });
    });

    describe("rangeBandColors (orden de las bandas min→max)", () => {
        it("ascendente: bajo, medio, alto", () => {
            expect(rangeBandColors(COLORS, false)).toEqual(["LOW", "MED", "HIGH"]);
        });

        it("descendente: alto, medio, bajo", () => {
            expect(rangeBandColors(COLORS, true)).toEqual(["HIGH", "MED", "LOW"]);
        });
    });
});
