import { isFiniteNumber } from "./scales";

/** Color fijo y contrastante con los rangos (rojo/amarillo/verde) y el fondo gris. */
export const TARGET_MARKER_COLOR = "#252423";

export type MarkerKind = "target" | "targetWithMargin" | "programmed" | "previousMonth";
/** Formas distintas para que los marcadores se distingan también sin color (alto contraste). */
export type MarkerShape = "line" | "dashed" | "triangle" | "circle";

export interface MarkerSpec {
    kind: MarkerKind;
    label: string;
    value: number;
    color: string;
    shape: MarkerShape;
}

export interface MarkerValues {
    target?: number;
    targetWithMargin?: number;
    programmed?: number;
    previousMonth?: number;
}

export interface MarkerColors {
    targetMarginColor: string;
    programmedColor: string;
    previousMonthColor: string;
}

/** Marcadores a dibujar; cada uno aparece sólo si su valor es finito. */
export function buildMarkers(values: MarkerValues, colors: MarkerColors): MarkerSpec[] {
    const candidates: Array<Omit<MarkerSpec, "value"> & { value: number | undefined }> = [
        { kind: "target", label: "Objetivo", value: values.target, color: TARGET_MARKER_COLOR, shape: "line" },
        {
            kind: "targetWithMargin",
            label: "Meta con margen",
            value: values.targetWithMargin,
            color: colors.targetMarginColor,
            shape: "dashed",
        },
        {
            kind: "programmed",
            label: "Programado",
            value: values.programmed,
            color: colors.programmedColor,
            shape: "triangle",
        },
        {
            kind: "previousMonth",
            label: "Real mes anterior",
            value: values.previousMonth,
            color: colors.previousMonthColor,
            shape: "circle",
        },
    ];
    return candidates.filter((marker): marker is MarkerSpec => isFiniteNumber(marker.value));
}
