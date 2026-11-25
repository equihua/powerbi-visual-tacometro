import { describe, expect, it } from "vitest";
import { fitTrendScale, fitTrendScaleForShapes, TREND_MIN_SCALE } from "../src/components/trendFit";
import { trendBoxCorners } from "../src/components/trendTransform";

/**
 * 0.4.1.1 — fix QA rotación 30°/Barras (DICTAMEN-QA.md): `fitTrendScaleForShapes` generaliza la
 * homotecia anticolisión (antes sólo probaba las 4 esquinas de la caja NOMINAL) a un conjunto arbitrario
 * de polígonos y círculos — la geometría REAL de todo lo dibujado (`buildTrendDrawnShapes`, trend.ts),
 * no una aproximación. `fitTrendScale` (ya existente, con todas sus pruebas previas intactas en
 * trendFit.test.ts) pasa a ser el caso particular de un único polígono rectangular (la caja completa) —
 * delega en `fitTrendScaleForShapes`, nunca un cálculo paralelo.
 */
describe("fitTrendScaleForShapes — generaliza la homotecia a polígonos y círculos arbitrarios", () => {
    it("sin obstáculos: la escala pedida se devuelve tal cual, para cualquier conjunto de formas", () => {
        const shapes = { polygons: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]], circles: [{ center: { x: 5, y: 5 }, radius: 2 }] };
        const result = fitTrendScaleForShapes(50, { x: 0, y: 0 }, 0, 1, shapes, { viewportWidth: 1000, viewportHeight: 1000 });
        expect(result).toEqual({ scale: 1, fits: true });
    });

    it("un solo polígono = la caja completa: coincide exactamente con fitTrendScale (caso particular)", () => {
        const obstacles = {
            viewportWidth: 150,
            viewportHeight: 200,
        };
        const viaShapes = fitTrendScaleForShapes(50, { x: 80, y: 10 }, 0, 1, { polygons: [trendBoxCorners(100, 50)], circles: [] }, obstacles);
        const viaBox = fitTrendScale(100, 50, { x: 80, y: 10 }, 0, 1, obstacles);
        expect(viaShapes).toEqual(viaBox);
    });

    it("círculo que colisiona con la corona del arco: se reduce la escala hasta librarlo", () => {
        const obstacles = {
            viewportWidth: 1000,
            viewportHeight: 2000,
            arc: { center: { x: 500, y: 1000 }, innerRadius: 50, outerRadius: 60, startAngle: -10, endAngle: 10 },
        };
        // boxOrigin/arc.center en (500,1000) sólo para que todo (incluido el radio) quede bien dentro
        // del viewport (el chequeo de colisión con el arco es relativo al centro, el resultado no cambia).
        // Pivote local (0, height=10) en boxOrigin (500,1000) -> pivote absoluto (500,1010), lejos del arco.
        // Círculo LOCAL en (0,-55): a escala 1 (transform identidad) su centro absoluto es (500,945),
        // relativo al arco (0,-55): ángulo 0° (dirección (0,-ρ)) y ρ=55, dentro de [50,60] -> colisión.
        const shapes = { polygons: [], circles: [{ center: { x: 0, y: -55 }, radius: 2 }] };
        const result = fitTrendScaleForShapes(10, { x: 500, y: 1000 }, 0, 1, shapes, obstacles);
        expect(result.fits).toBe(true);
        expect(result.scale).toBeLessThan(1);
    });

    it("círculo lejos de cualquier obstáculo: nunca se reduce (sin falso positivo)", () => {
        const obstacles = {
            viewportWidth: 2000,
            viewportHeight: 2000,
            arc: { center: { x: 1000, y: 1000 }, innerRadius: 50, outerRadius: 60, startAngle: -10, endAngle: 10 },
        };
        const shapes = { polygons: [], circles: [{ center: { x: 5, y: 5 }, radius: 2 }] };
        const result = fitTrendScaleForShapes(10, { x: 0, y: 0 }, 0, 1, shapes, obstacles);
        expect(result).toEqual({ scale: 1, fits: true });
    });

    it("círculo que se sale del viewport: se reduce la escala hasta que su radio (también escalado) quede dentro", () => {
        const obstacles = { viewportWidth: 20, viewportHeight: 1000 };
        // Pivote en (0,0); círculo local a 15px del pivote en X con radio 10: a escala 1 su borde derecho
        // llega a 25, fuera del viewport (20). Reduciendo la escala también se reduce el radio.
        const shapes = { polygons: [], circles: [{ center: { x: 15, y: 0 }, radius: 10 }] };
        const result = fitTrendScaleForShapes(10, { x: 0, y: 0 }, 0, 1, shapes, obstacles);
        expect(result.fits).toBe(true);
        expect(result.scale).toBeLessThan(1);
        const effectiveRightEdge = result.scale * 15 + result.scale * 10;
        expect(effectiveRightEdge).toBeLessThanOrEqual(20 + 1e-6);
    });

    it("múltiples polígonos (p. ej. varias barras): basta que UNO colisione para que se reduzca la escala", () => {
        const obstacles = {
            viewportWidth: 1000,
            viewportHeight: 2000,
            arc: { center: { x: 500, y: 1000 }, innerRadius: 50, outerRadius: 60, startAngle: -10, endAngle: 10 },
        };
        // Mismo sistema que el caso anterior (boxOrigin en (500,1000)): las coordenadas LOCALES son las
        // mismas (pequeñas, cerca del pivote en (0,10)), no las absolutas.
        const safePolygon = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }]; // lejos del arco.
        // Mismo radio/ángulo que el círculo colisionante del caso anterior (ρ∈[52,58.2], ángulo <5°).
        const collidingPolygon = [{ x: -5, y: -58 }, { x: 5, y: -58 }, { x: 5, y: -52 }, { x: -5, y: -52 }];
        const shapes = { polygons: [safePolygon, collidingPolygon], circles: [] };
        const result = fitTrendScaleForShapes(10, { x: 500, y: 1000 }, 0, 1, shapes, obstacles);
        expect(result.fits).toBe(true);
        expect(result.scale).toBeLessThan(1);
    });

    it("sin ninguna forma (polygons y circles vacíos): nunca reduce la escala (nada que colisione)", () => {
        const obstacles = {
            viewportWidth: 10,
            viewportHeight: 10,
            arc: { center: { x: 5, y: 5 }, innerRadius: 1, outerRadius: 2, startAngle: -400, endAngle: 400 },
        };
        const result = fitTrendScaleForShapes(50, { x: 0, y: 0 }, 0, 1, { polygons: [], circles: [] }, obstacles);
        expect(result).toEqual({ scale: 1, fits: true });
    });

    it("nunca baja de TREND_MIN_SCALE, incluso si ni ese piso libra todo", () => {
        const obstacles = { viewportWidth: 1, viewportHeight: 1000 };
        const shapes = { polygons: [[{ x: -100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 5 }, { x: -100, y: 5 }]], circles: [] };
        const result = fitTrendScaleForShapes(5, { x: 0, y: 0 }, 0, 1, shapes, obstacles);
        expect(result).toEqual({ scale: TREND_MIN_SCALE, fits: false });
    });
});
