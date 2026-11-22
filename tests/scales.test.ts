import { describe, expect, it } from "vitest";
import {
    createAngleScale,
    createPerformanceColorScale,
    isFiniteNumber,
    resolveRange,
    resolveThresholds,
} from "../src/components/scales";
import { degreesToRadians, radiansToDegrees } from "../src/components/arcUtils";

const START = degreesToRadians(-120);
const END = degreesToRadians(60);
const COLORS = { lowColor: "LOW", mediumColor: "MED", highColor: "HIGH" };

/** Ángulo en grados para un valor, con la configuración por defecto del visual (-120°..60°). */
function angleDeg(min: number, max: number, value: number): number {
    return radiansToDegrees(createAngleScale(min, max, START, END)(value));
}

describe("createAngleScale", () => {
    it("mapea valores dentro del rango de forma lineal (0..100, 65 → -3°, 80 → 24°)", () => {
        expect(angleDeg(0, 100, 65)).toBeCloseTo(-3, 10);
        expect(angleDeg(0, 100, 80)).toBeCloseTo(24, 10);
        expect(angleDeg(0, 100, 50)).toBeCloseTo(-30, 10);
    });

    it("mapea los límites min y max a los ángulos inicial y final", () => {
        expect(angleDeg(0, 100, 0)).toBeCloseTo(-120, 10);
        expect(angleDeg(0, 100, 100)).toBeCloseTo(60, 10);
    });

    it("aplica clamp a valores fuera de rango", () => {
        expect(angleDeg(0, 100, 150)).toBeCloseTo(60, 10);
        expect(angleDeg(0, 100, -20)).toBeCloseTo(-120, 10);
    });

    it("usa los datos como dominio y los ángulos como rango (bug a: 200..1200)", () => {
        expect(angleDeg(200, 1200, 200)).toBeCloseTo(-120, 10);
        expect(angleDeg(200, 1200, 700)).toBeCloseTo(-30, 10);
        expect(angleDeg(200, 1200, 1000)).toBeCloseTo(24, 10);
        expect(angleDeg(200, 1200, 1200)).toBeCloseTo(60, 10);
        // Un valor por debajo del mínimo de datos no debe interpretarse como ángulo.
        expect(angleDeg(200, 1200, 0)).toBeCloseTo(-120, 10);
    });

    it("devuelve radianes y respeta ángulos arbitrarios", () => {
        const scale = createAngleScale(0, 10, 0, Math.PI);
        expect(scale(5)).toBeCloseTo(Math.PI / 2, 12);
    });

    it("con min == max no produce NaN (d3 devuelve el punto medio del rango)", () => {
        const scale = createAngleScale(50, 50, START, END);
        const result = scale(50);
        expect(Number.isFinite(result)).toBe(true);
        expect(radiansToDegrees(result)).toBeCloseTo(-30, 10);
    });

    it("min == max se evita en el visual mediante resolveRange", () => {
        const { min, max } = resolveRange(50, 50);
        expect(angleDeg(min, max, 50)).toBeCloseTo(-120, 10);
        expect(angleDeg(min, max, 150)).toBeCloseTo(60, 10);
    });
});

describe("createPerformanceColorScale", () => {
    const color = createPerformanceColorScale(40, 70, COLORS);

    it("asigna bajo / medio / alto en valores normales", () => {
        expect(color(10)).toBe("LOW");
        expect(color(55)).toBe("MED");
        expect(color(65)).toBe("MED");
        expect(color(90)).toBe("HIGH");
    });

    it("los umbrales son inclusivos (value <= low → bajo; value <= mid → medio)", () => {
        expect(color(40)).toBe("LOW");
        expect(color(40.0001)).toBe("MED");
        expect(color(70)).toBe("MED");
        expect(color(70.0001)).toBe("HIGH");
    });

    it("con umbrales invertidos (low > mid) se comporta como si estuvieran ordenados", () => {
        const inverted = createPerformanceColorScale(70, 40, COLORS);
        expect(inverted(10)).toBe("LOW");
        expect(inverted(40)).toBe("LOW");
        expect(inverted(55)).toBe("MED");
        expect(inverted(70)).toBe("MED");
        expect(inverted(90)).toBe("HIGH");
    });

    it("con umbrales iguales no hay zona media", () => {
        const equal = createPerformanceColorScale(50, 50, COLORS);
        expect(equal(50)).toBe("LOW");
        expect(equal(51)).toBe("HIGH");
    });

    it("con umbrales resueltos desde undefined/NaN usa tercios del rango (bug b)", () => {
        const t = resolveThresholds({ min: 0, max: 90 }, null, Number.NaN);
        const scale = createPerformanceColorScale(t.lowThreshold, t.midThreshold, COLORS);
        expect(scale(30)).toBe("LOW");
        expect(scale(31)).toBe("MED");
        expect(scale(60)).toBe("MED");
        expect(scale(61)).toBe("HIGH");
    });
});

describe("resolveThresholds", () => {
    it("conserva umbrales válidos", () => {
        expect(resolveThresholds({ min: 0, max: 100 }, 40, 70)).toEqual({ lowThreshold: 40, midThreshold: 70 });
    });

    it("sin umbrales usa tercios (max = 90 → 30 / 60)", () => {
        expect(resolveThresholds({ min: 0, max: 90 }, null, null)).toEqual({ lowThreshold: 30, midThreshold: 60 });
    });

    it("trata NaN, Infinity y undefined como ausentes, sin producir NaN", () => {
        const t = resolveThresholds({ min: 200, max: 1100 }, Number.NaN, undefined as unknown as null);
        expect(t).toEqual({ lowThreshold: 500, midThreshold: 800 });
        const inf = resolveThresholds({ min: 0, max: 90 }, Number.POSITIVE_INFINITY, null);
        expect(inf).toEqual({ lowThreshold: 30, midThreshold: 60 });
    });

    it("mezcla un umbral presente y otro ausente", () => {
        expect(resolveThresholds({ min: 0, max: 90 }, 10, null)).toEqual({ lowThreshold: 10, midThreshold: 60 });
        expect(resolveThresholds({ min: 0, max: 90 }, null, 45)).toEqual({ lowThreshold: 30, midThreshold: 45 });
    });

    it("intercambia umbrales invertidos (low > mid)", () => {
        expect(resolveThresholds({ min: 0, max: 100 }, 70, 40)).toEqual({ lowThreshold: 40, midThreshold: 70 });
        // Un umbral ausente puede quedar invertido respecto al tercio por defecto.
        expect(resolveThresholds({ min: 0, max: 90 }, 80, null)).toEqual({ lowThreshold: 60, midThreshold: 80 });
    });

    it("aplica clamp a umbrales fuera de [min, max]", () => {
        expect(resolveThresholds({ min: 0, max: 100 }, -50, 500)).toEqual({ lowThreshold: 0, midThreshold: 100 });
        expect(resolveThresholds({ min: 200, max: 1200 }, 100, 5000)).toEqual({ lowThreshold: 200, midThreshold: 1200 });
    });
});

describe("resolveRange", () => {
    it("conserva rangos válidos, incluso negativos", () => {
        expect(resolveRange(0, 100)).toEqual({ min: 0, max: 100 });
        expect(resolveRange(-50, -10)).toEqual({ min: -50, max: -10 });
    });

    it("corrige min == max y min > max con max = min + 100", () => {
        expect(resolveRange(50, 50)).toEqual({ min: 50, max: 150 });
        expect(resolveRange(100, 50)).toEqual({ min: 100, max: 200 });
    });
});

describe("isFiniteNumber", () => {
    it("acepta solo números finitos", () => {
        expect(isFiniteNumber(0)).toBe(true);
        expect(isFiniteNumber(-3.5)).toBe(true);
        expect(isFiniteNumber(Number.NaN)).toBe(false);
        expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
        expect(isFiniteNumber(null)).toBe(false);
        expect(isFiniteNumber(undefined)).toBe(false);
        expect(isFiniteNumber("5" as unknown as number)).toBe(false);
    });
});
