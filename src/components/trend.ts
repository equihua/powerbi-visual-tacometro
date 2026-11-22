import { createPerformanceColorScale, isFiniteNumber, PerformanceColors } from "./scales";
import { resolveSemaphoreColor } from "./semaphore";
import type { HighContrastColors } from "./types";

export interface StatusColors extends PerformanceColors {
    lowerIsBetter: boolean;
    highContrast?: HighContrastColors;
}

/**
 * Color de estado de un valor con la misma precedencia que el arco del medidor:
 * alto contraste > semáforo de la fuente > umbrales (respetando «menor es mejor»).
 */
export function statusColor(
    value: number,
    semaphore: string | null,
    thresholds: { lowThreshold: number; midThreshold: number },
    colors: StatusColors
): string {
    return (
        colors.highContrast?.foreground ??
        resolveSemaphoreColor(semaphore, colors) ??
        createPerformanceColorScale(thresholds.lowThreshold, thresholds.midThreshold, colors, colors.lowerIsBetter)(value)
    );
}

/** Umbrales bajo/medio ya resueltos (mismo criterio que el medidor). */
export interface TrendThresholds {
    lowThreshold: number;
    midThreshold: number;
}

/**
 * Un periodo de la serie con datos de ESE periodo: Real, Programado, semáforo («Semáforo por periodo»
 * o, si está vacío, el semáforo del medidor evaluado en ese periodo) y umbrales resueltos de su fila.
 */
export interface TrendPoint {
    label: string;
    real: number | null;
    programmed: number | null;
    semaphore: string | null;
    thresholds: TrendThresholds;
}

/**
 * Clave de orden explícita de un periodo (rol «Orden del periodo»): número, fecha o texto numérico.
 * Cualquier otro valor (p. ej. «Ene», «Oct») devuelve null: el orden nunca se infiere de nombres de mes.
 */
export function periodSortKey(value: unknown): number | null {
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? time : null;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string" && /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(value)) {
        return Number(value);
    }
    return null;
}

/**
 * Permutación de filas en orden cronológico: ascendente por clave, estable ante empates; las filas
 * sin clave van al final en el orden del host. Devuelve índices de fila del DataView.
 */
export function orderPeriodRows(keys: Array<number | null>): number[] {
    return keys
        .map((key, row) => ({ key, row }))
        .sort((a, b) => {
            if (a.key === null || b.key === null) {
                return a.key === b.key ? a.row - b.row : a.key === null ? 1 : -1;
            }
            return a.key - b.key || a.row - b.row;
        })
        .map((entry) => entry.row);
}

/**
 * Posición del periodo actual explícito (rol «Periodo actual»). Con clave de orden se compara con la
 * clave; sin ella, con la etiqueta (sin distinguir mayúsculas ni espacios). -1 si no coincide ninguno.
 */
export function findCurrentPosition(
    current: unknown,
    periods: Array<{ key: number | null; label: string }>,
    byKey: boolean
): number {
    if (byKey) {
        const key = periodSortKey(current);
        return key === null ? -1 : periods.findIndex((period) => period.key === key);
    }
    const label = String(current).trim().toLowerCase();
    return periods.findIndex((period) => period.label.trim().toLowerCase() === label);
}

/** Último punto (en orden cronológico) con Real; -1 si ninguno tiene. */
export function lastIndexWithReal(points: Array<{ real: number | null }>): number {
    for (let index = points.length - 1; index >= 0; index--) {
        if (points[index].real !== null) {
            return index;
        }
    }
    return -1;
}

export interface TrendVertex {
    index: number;
    x: number;
    y: number;
    value: number;
}

export interface TrendGeometry {
    xs: number[];
    realPoints: TrendVertex[];
    programmedPoints: TrendVertex[];
    realPath: string;
    programmedPath: string;
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Trazo SVG; un hueco (mes sin valor) inicia un segmento nuevo en vez de unir los extremos. */
function toPath(vertices: TrendVertex[]): string {
    return vertices
        .map((v, i) => `${i > 0 && vertices[i - 1].index === v.index - 1 ? "L" : "M"}${v.x},${v.y}`)
        .join("");
}

/**
 * Geometría pura de la sparkline: meses repartidos en el ancho y Real/Programado en una
 * misma escala vertical (min abajo, max arriba), dentro de un margen `padding`.
 */
export function buildTrendGeometry(points: TrendPoint[], width: number, height: number, padding: number): TrendGeometry {
    const innerWidth = Math.max(0, width - padding * 2);
    const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;
    const xs = points.map((_, i) => round(points.length > 1 ? padding + i * step : width / 2));

    const values = points
        .flatMap((point) => [point.real, point.programmed])
        .filter((value): value is number => isFiniteNumber(value));
    const low = values.length ? Math.min(...values) : 0;
    const high = values.length ? Math.max(...values) : 0;
    const top = padding;
    const bottom = height - padding;
    const y = (value: number) => round(high === low ? (top + bottom) / 2 : bottom - ((value - low) / (high - low)) * (bottom - top));

    const vertices = (pick: (point: TrendPoint) => number | null): TrendVertex[] =>
        points.flatMap((point, index) => {
            const value = pick(point);
            return isFiniteNumber(value) ? [{ index, x: xs[index], y: y(value), value }] : [];
        });

    const realPoints = vertices((point) => point.real);
    const programmedPoints = vertices((point) => point.programmed);
    return { xs, realPoints, programmedPoints, realPath: toPath(realPoints), programmedPath: toPath(programmedPoints) };
}
