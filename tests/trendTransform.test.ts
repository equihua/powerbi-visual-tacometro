import { describe, expect, it } from "vitest";
import {
    applyTrendTransform,
    trendBoxCorners,
    trendTransformAttribute,
    trendTransformCoefficients,
    transformedTrendBoxCorners,
} from "../src/components/trendTransform";

/**
 * Geometría pura del transform de la serie de tendencia: pivote fijo en la esquina inferior izquierda
 * LOCAL de la caja (0, height), rotación positiva con apariencia antihoraria en pantalla, escala
 * (homotecia) sobre el mismo pivote, expresado como una única matriz afín SVG. Valores de referencia
 * verificados con un cálculo independiente (no copiados de la implementación) — ver bitácora.
 */
describe("trendTransformAttribute — caso identidad (regresión visual del default)", () => {
    it("ángulo 0 y escala 1 (los valores por omisión) no agregan transform (undefined)", () => {
        expect(trendTransformAttribute(60, 0, 1)).toBeUndefined();
        expect(trendTransformAttribute(338, 0, 1)).toBeUndefined();
    });

    it("ángulo != 0 o escala != 1 sí agregan un matrix(...)", () => {
        expect(trendTransformAttribute(60, 1, 1)).toMatch(/^matrix\(/);
        expect(trendTransformAttribute(60, 0, 0.9)).toMatch(/^matrix\(/);
    });
});

describe("trendTransformCoefficients / applyTrendTransform — pivote fijo (esquina inferior izquierda)", () => {
    it("el pivote local (0, height) es invariante ante cualquier ángulo y escala", () => {
        const height = 338;
        for (const angle of [0, 15, 30, 45, 90, -30, 120, 270]) {
            for (const scale of [1, 0.9, 0.5, 0.3, 0.25]) {
                const p = applyTrendTransform({ x: 0, y: height }, height, angle, scale);
                expect(p.x, `angle=${angle} scale=${scale}`).toBeCloseTo(0, 9);
                expect(p.y, `angle=${angle} scale=${scale}`).toBeCloseTo(height, 9);
            }
        }
    });

    it("+90° mueve el punto arriba del pivote (esquina superior izquierda) a su izquierda, misma altura — antihorario visual", () => {
        // Caja H=100: esquina superior izquierda local (0,0) está directamente "arriba" del pivote (0,100).
        const p = applyTrendTransform({ x: 0, y: 0 }, 100, 90, 1);
        expect(p.x).toBeCloseTo(-100, 9);
        expect(p.y).toBeCloseTo(100, 9);
    });

    it("-90° (horario visual) mueve el mismo punto a la derecha del pivote, misma altura", () => {
        const p = applyTrendTransform({ x: 0, y: 0 }, 100, -90, 1);
        expect(p.x).toBeCloseTo(100, 9);
        expect(p.y).toBeCloseTo(100, 9);
    });

    it("30° — coeficientes de la matriz (caja 430x338, escala 1)", () => {
        const c = trendTransformCoefficients(338, 30, 1);
        expect(c.a).toBeCloseTo(0.8660254, 6);
        expect(c.b).toBeCloseTo(-0.5, 6);
        expect(c.c).toBeCloseTo(0.5, 6);
        expect(c.d).toBeCloseTo(0.8660254, 6);
        expect(c.e).toBeCloseTo(-169, 6);
        expect(c.f).toBeCloseTo(45.2834135, 6);
    });

    it("30° — esquina superior derecha de una caja 430x338 (pivote inferior izquierdo)", () => {
        const p = applyTrendTransform({ x: 430, y: 0 }, 338, 30, 1);
        expect(p.x).toBeCloseTo(203.3909236, 5);
        expect(p.y).toBeCloseTo(-169.7165865, 5);
    });

    it("90° — las 4 esquinas de una caja 430x268 (pivote inferior izquierdo)", () => {
        const corners = transformedTrendBoxCorners(430, 268, 90, 1);
        // orden: sup-izq, sup-der, inf-der, inf-izq
        expect(corners[0]).toEqual({ x: -268, y: 268 }); // sup-izq
        expect(corners[1]).toEqual({ x: -268, y: -162 }); // sup-der
        expect(corners[2]).toEqual({ x: 0, y: -162 }); // inf-der
        expect(corners[3]).toEqual({ x: 0, y: 268 }); // inf-izq (pivote)
    });

    it.each([
        [430, 338, 15, { x: 327.8672681, y: -99.7751187 }],
        [430, 268, 45, { x: 114.5512986, y: -225.5605333 }],
    ])("esquina superior derecha, caja %sx%s, %s°", (width, height, angle, expected) => {
        const p = applyTrendTransform({ x: width as number, y: 0 }, height as number, angle as number, 1);
        expect(p.x).toBeCloseTo((expected as Point).x, 5);
        expect(p.y).toBeCloseTo((expected as Point).y, 5);
    });
});

type Point = { x: number; y: number };

describe("trendBoxCorners — caja local sin transformar", () => {
    it("devuelve las 4 esquinas en orden sup-izq, sup-der, inf-der, inf-izq", () => {
        expect(trendBoxCorners(100, 50)).toEqual([
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 50 },
            { x: 0, y: 50 },
        ]);
    });
});

describe("homotecia — escalar reduce el tamaño sin mover el pivote ni cambiar el ángulo", () => {
    it("a menor escala, cada esquina (salvo el pivote) queda más cerca de él, en la misma dirección", () => {
        const width = 100;
        const height = 50;
        const angle = 25;
        const pivot = { x: 0, y: height };
        for (const corner of trendBoxCorners(width, height).slice(0, 3)) {
            // top-left, top-right, bottom-right (no el pivote mismo)
            const full = applyTrendTransform(corner, height, angle, 1);
            const half = applyTrendTransform(corner, height, angle, 0.5);
            const distFull = Math.hypot(full.x - pivot.x, full.y - pivot.y);
            const distHalf = Math.hypot(half.x - pivot.x, half.y - pivot.y);
            expect(distHalf).toBeCloseTo(distFull / 2, 6);
        }
    });

    it("el ángulo no cambia con la escala: la dirección (esquina → pivote) es idéntica a cualquier escala", () => {
        const height = 50;
        const angle = 40;
        const corner = { x: 100, y: 0 };
        const pivot = { x: 0, y: height };
        const direction = (scale: number) => {
            const p = applyTrendTransform(corner, height, angle, scale);
            return Math.atan2(p.y - pivot.y, p.x - pivot.x);
        };
        expect(direction(1)).toBeCloseTo(direction(0.5), 9);
        expect(direction(1)).toBeCloseTo(direction(0.25), 9);
    });
});
