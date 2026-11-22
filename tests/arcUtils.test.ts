import { describe, expect, it } from "vitest";
import {
    ArcGeometry,
    BAND_RADIUS_FACTOR,
    TRANSITION_DURATION_MS,
    arcPath,
    bandRadii,
    degreesToRadians,
    radiansToDegrees,
} from "../src/components/arcUtils";

function expectValidPath(path: string): void {
    expect(typeof path).toBe("string");
    expect(path.length).toBeGreaterThan(0);
    expect(path).not.toMatch(/NaN|undefined|Infinity/);
    expect(path.startsWith("M")).toBe(true);
}

const geometry = (overrides: Partial<ArcGeometry> = {}): ArcGeometry => ({
    innerRadius: 80,
    outerRadius: 100,
    startAngle: degreesToRadians(-120),
    endAngle: degreesToRadians(60),
    ...overrides,
});

describe("arcPath", () => {
    it("genera un path válido para el arco por defecto (-120°..60°)", () => {
        const path = arcPath(geometry());
        expectValidPath(path);
        expect(path).toContain("A100,100");
        expect(path).toContain("A80,80");
    });

    it("con ángulo 0 (inicio == fin) devuelve un path válido sin NaN", () => {
        expectValidPath(arcPath(geometry({ startAngle: 0, endAngle: 0 })));
        const same = degreesToRadians(24);
        expectValidPath(arcPath(geometry({ startAngle: same, endAngle: same })));
    });

    it("genera un arco completo (2π) como anillo", () => {
        const path = arcPath(geometry({ startAngle: 0, endAngle: 2 * Math.PI }));
        expectValidPath(path);
        // d3 dibuja el anillo completo con dos semicircunferencias por radio.
        expect(path.match(/A100,100/g)?.length).toBe(2);
        expect(path.match(/A80,80/g)?.length).toBe(2);
    });

    it("respeta distintos radios interior/exterior", () => {
        const path = arcPath(geometry({ innerRadius: 30, outerRadius: 45 }));
        expectValidPath(path);
        expect(path).toContain("A45,45");
        expect(path).toContain("A30,30");
    });

    it("con radio interior 0 genera un sector (sin arco interior)", () => {
        const path = arcPath(geometry({ innerRadius: 0 }));
        expectValidPath(path);
        expect(path).toContain("L0,0");
        expect(path).not.toContain("A0,0");
    });

    it("con radios 0 devuelve un path degenerado pero válido", () => {
        const path = arcPath(geometry({ innerRadius: 0, outerRadius: 0 }));
        expectValidPath(path);
        expect(path).toBe("M0,0Z");
    });

    it("acepta ángulos en sentido inverso (fin < inicio)", () => {
        expectValidPath(arcPath(geometry({ startAngle: degreesToRadians(60), endAngle: degreesToRadians(-120) })));
    });
});

describe("bandRadii", () => {
    it("centra la banda en radius * BAND_RADIUS_FACTOR", () => {
        const { innerRadius, outerRadius } = bandRadii(100, 20);
        expect(innerRadius).toBeCloseTo(100 * BAND_RADIUS_FACTOR - 10, 10);
        expect(outerRadius).toBeCloseTo(100 * BAND_RADIUS_FACTOR + 10, 10);
        expect(outerRadius - innerRadius).toBeCloseTo(20, 10);
    });

    it("con grosor 0 los radios coinciden y con radio 0 quedan alrededor del origen", () => {
        expect(bandRadii(100, 0)).toEqual({ innerRadius: 95, outerRadius: 95 });
        expect(bandRadii(0, 10)).toEqual({ innerRadius: -5, outerRadius: 5 });
    });
});

describe("conversión de ángulos y constantes", () => {
    it("convierte grados ↔ radianes", () => {
        expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 12);
        expect(degreesToRadians(-120)).toBeCloseTo((-2 * Math.PI) / 3, 12);
        expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90, 12);
        expect(radiansToDegrees(degreesToRadians(24))).toBeCloseTo(24, 12);
    });

    it("la duración de transición está en el rango pedido (300-500 ms)", () => {
        expect(TRANSITION_DURATION_MS).toBeGreaterThanOrEqual(300);
        expect(TRANSITION_DURATION_MS).toBeLessThanOrEqual(500);
    });
});
