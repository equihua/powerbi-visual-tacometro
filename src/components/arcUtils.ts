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

/**
 * 0.3.3.1: anillo del indicador del semáforo (PerformanceArc "semaphore-indicator"), delgado y por dentro de la
 * banda: grosor max(3, 0.3·grosor) a 2 px del radio interior. Fuente única para Gauge (lo dibuja) y layout (la
 * sparkline no debe tocarlo).
 */
export function semaphoreIndicatorRing(
    bandInnerRadius: number,
    thickness: number
): { innerRadius: number; outerRadius: number; thickness: number } {
    const ringThickness = Math.max(3, thickness * 0.3);
    const center = Math.max(ringThickness / 2, bandInnerRadius - 2 - ringThickness / 2);
    return { innerRadius: center - ringThickness / 2, outerRadius: center + ringThickness / 2, thickness: ringThickness };
}

export function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

export function radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI);
}
