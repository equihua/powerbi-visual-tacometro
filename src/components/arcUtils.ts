import { arc } from "d3-shape";

/** Duración compartida por las animaciones del medidor (rango pedido: 300-500 ms). */
export const TRANSITION_DURATION_MS = 400;

/** Factor del radio en el que se centra la banda del medidor. */
export const BAND_RADIUS_FACTOR = 0.95;

export interface ArcGeometry {
    innerRadius: number;
    outerRadius: number;
    startAngle: number;
    endAngle: number;
}

/**
 * Generador d3-shape. Convención de ángulos (igual que la del repo):
 * radianes, 0 = 12 en punto, sentido horario; centrado en (0, 0).
 */
const arcGenerator = arc<ArcGeometry>();

export function arcPath(geometry: ArcGeometry): string {
    return arcGenerator(geometry) ?? "";
}

/** Radios interior/exterior de la banda del medidor para un radio y grosor dados. */
export function bandRadii(radius: number, thickness: number): { innerRadius: number; outerRadius: number } {
    const center = radius * BAND_RADIUS_FACTOR;
    return {
        innerRadius: center - thickness / 2,
        outerRadius: center + thickness / 2,
    };
}

export function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

export function radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI);
}
