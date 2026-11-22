import { scaleLinear, scaleThreshold } from "d3-scale";

export type AngleScale = (value: number) => number;

/** Escala valor → ángulo (radianes) con clamp al rango [min, max]. */
export function createAngleScale(
    min: number,
    max: number,
    startAngle: number,
    endAngle: number
): AngleScale {
    const scale = scaleLinear<number, number>()
        .domain([min, max])
        .range([startAngle, endAngle])
        .clamp(true);
    return (value: number) => scale(value);
}

export interface PerformanceColors {
    lowColor: string;
    mediumColor: string;
    highColor: string;
}

/**
 * Escala valor → color de desempeño.
 * Semántica: value <= low → bajo; value <= mid → medio; en otro caso → alto.
 * scaleThreshold usa límites inferiores inclusivos (t <= x), así que se evalúa
 * sobre -value con dominio [-mid, -low] para conservar los límites "<=".
 * scaleThreshold exige dominio ordenado: si low > mid se intercambian.
 */
export function createPerformanceColorScale(
    lowThreshold: number,
    midThreshold: number,
    colors: PerformanceColors,
    lowerIsBetter: boolean = false
): (value: number) => string {
    const low = Math.min(lowThreshold, midThreshold);
    const mid = Math.max(lowThreshold, midThreshold);
    const [firstBand, secondBand, thirdBand] = rangeBandColors(colors, lowerIsBetter);
    const scale = scaleThreshold<number, string>()
        .domain([-mid, -low])
        .range([thirdBand, secondBand, firstBand]);
    return (value: number) => scale(-value);
}

/**
 * Colores de las bandas en orden min → max. Con "menor es mejor" la banda baja
 * es la favorable (color alto) y la alta la desfavorable (color bajo).
 */
export function rangeBandColors(colors: PerformanceColors, lowerIsBetter: boolean): [string, string, string] {
    return lowerIsBetter
        ? [colors.highColor, colors.mediumColor, colors.lowColor]
        : [colors.lowColor, colors.mediumColor, colors.highColor];
}

/**
 * Color semántico de una diferencia (p. ej. Real − Real mes anterior): favorable → highColor,
 * desfavorable → lowColor, sin cambio → neutralColor. Con "menor es mejor" bajar es lo favorable.
 */
export function comparisonColor(
    delta: number,
    colors: PerformanceColors,
    lowerIsBetter: boolean,
    neutralColor: string
): string {
    if (delta === 0) {
        return neutralColor;
    }
    return (delta < 0) === lowerIsBetter ? colors.highColor : colors.lowColor;
}

export interface GaugeRange {
    min: number;
    max: number;
}

/** Garantiza min < max (si no, max = min + 100, como el comportamiento previo). */
export function resolveRange(min: number, max: number): GaugeRange {
    return min < max ? { min, max } : { min, max: min + 100 };
}

export interface Thresholds {
    lowThreshold: number;
    midThreshold: number;
}

export function isFiniteNumber(value: number | null | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Umbrales siempre definidos y dentro de [min, max]:
 * - sin valor (null/NaN) → tercios del rango;
 * - fuera de rango → clamp;
 * - low > mid → se intercambian.
 */
export function resolveThresholds(
    range: GaugeRange,
    lowThreshold: number | null,
    midThreshold: number | null
): Thresholds {
    const { min, max } = range;
    const span = max - min;
    const low = isFiniteNumber(lowThreshold) ? clamp(lowThreshold, min, max) : min + span / 3;
    const mid = isFiniteNumber(midThreshold) ? clamp(midThreshold, min, max) : min + (2 * span) / 3;
    return low <= mid
        ? { lowThreshold: low, midThreshold: mid }
        : { lowThreshold: mid, midThreshold: low };
}
