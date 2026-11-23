import { formatGaugeValue } from "./components/CenterText";
import { buildMarkers } from "./components/markers";
import { GaugeData } from "./components/types";
import { TrendPoint } from "./components/trend";

/** Estructura compatible con powerbi.extensibility.VisualTooltipDataItem. */
export interface TooltipItem {
    displayName: string;
    value: string;
}

const NO_COLORS = { targetMarginColor: "", programmedColor: "", previousMonthColor: "" };

/** Elementos del tooltip del medidor: valor, escala, marcadores, semáforo y campos extra. */
export function buildTooltipItems(gaugeData: GaugeData, extras: TooltipItem[] = []): TooltipItem[] {
    const format = (value: number) => formatGaugeValue(value, gaugeData.dataFormat);
    const items: TooltipItem[] = [
        { displayName: "Valor", value: format(gaugeData.actualValue ?? gaugeData.value) },
        { displayName: "Mínimo", value: format(gaugeData.min) },
        { displayName: "Máximo", value: format(gaugeData.max) },
    ];
    for (const marker of buildMarkers(gaugeData, NO_COLORS)) {
        items.push({ displayName: marker.label, value: format(marker.value) });
    }
    if (gaugeData.semaphore) {
        items.push({ displayName: "Semáforo", value: gaugeData.semaphore });
    }
    return items.concat(extras);
}

/** 0.3.2.1: tooltip de un punto de la sparkline mensual, con el periodo y los valores de ESE punto. */
export function buildTrendPointTooltipItems(point: TrendPoint, format: (value: number) => string): TooltipItem[] {
    const items: TooltipItem[] = [
        { displayName: "Periodo", value: point.label },
        // Sólo hay punto (círculo) en los periodos con Real.
        { displayName: "Real", value: format(point.real as number) },
    ];
    if (point.programmed !== null) {
        items.push({ displayName: "Programado", value: format(point.programmed) });
    }
    if (point.semaphore) {
        items.push({ displayName: "Semáforo", value: point.semaphore });
    }
    return items;
}

/** Etiqueta accesible (lectores de pantalla / navegación por teclado). */
export function buildAriaLabel(gaugeData: GaugeData): string {
    const parts = buildTooltipItems(gaugeData).map((item) => `${item.displayName}: ${item.value}`);
    return `Tacómetro. ${parts.join("; ")}`;
}
