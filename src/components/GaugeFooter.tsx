import * as React from 'react';
import { isFiniteNumber } from './scales';

/**
 * Etiqueta de la tercera columna del pie (texto exacto del boceto). 0.3.2.0: lleva valor
 * (Real − Real mes anterior) sólo si hay «Real mes anterior»; si falta, queda sólo la etiqueta.
 */
export const TREND_DESCRIPTOR = "Real & Mes anterior";
const VALUE_FONT_SIZE = 13;
const LABEL_FONT_SIZE = 9;
const MIN_LABEL_FONT_SIZE = 6;
/** Ancho medio estimado de un carácter (em) y aire horizontal por columna, para ajustar la fuente sin DOM. */
const CHAR_WIDTH_EM = 0.5;
const COLUMN_GAP = 4;

/**
 * 0.3.1.0 responsivo: tamaño común de las etiquetas para que la más larga quepa en su columna
 * (entre MIN_LABEL_FONT_SIZE y LABEL_FONT_SIZE). Un solo tamaño mantiene el renglón alineado.
 */
function fitLabelFontSize(labels: string[], columnWidth: number): number {
    const longest = Math.max(1, ...labels.map((label) => label.length));
    const fitting = (columnWidth - COLUMN_GAP) / (longest * CHAR_WIDTH_EM);
    // Truncar (no redondear) a 0.1 px: redondear hacia arriba podía desbordar la columna por centésimas.
    return Math.floor(Math.max(MIN_LABEL_FONT_SIZE, Math.min(LABEL_FONT_SIZE, fitting)) * 10) / 10;
}

export interface GaugeFooterProps {
    width: number;
    height: number;
    /** Real actual tal como lo muestra el centro (recortado a [mín, máx]), para que Dif. cuadre con lo visible. */
    real: number;
    /** Real actual sin recortar: base de «Real & Mes anterior» (Real − Real mes anterior). */
    actualReal: number;
    /** Programado actual; sin él no hay Programado ni diferencia. */
    programmed?: number;
    /** 0.3.2.0: Real del mes anterior (rol opcional); sin él la 3.ª columna no muestra valor. */
    previousMonth?: number;
    /** Color de estado de «Dif. Real & Prog.» (mismo criterio que el medidor). */
    difColor: string;
    /** Color de «Real & Mes anterior» según la diferencia (favorable / desfavorable). */
    previousMonthDifColor: (delta: number) => string;
    /** Se muestra sólo si hay sparkline. */
    showDescriptor: boolean;
    format: (value: number) => string;
    fontFamily: string;
    valueColor: string;
    labelColor: string;
}

interface FooterItem {
    kind: "programmed" | "difference" | "descriptor";
    value?: string;
    valueColor?: string;
    label: string;
}

/** Diferencia con signo explícito cuando es positiva (el formato ya pone el «-»). */
function signed(value: number, format: (value: number) => string): string {
    return value > 0 ? `+${format(value)}` : format(value);
}

/** Pie horizontal: Programado, Dif. Real & Prog. (color de zona) y Real & Mes anterior (color de favorabilidad). */
export const GaugeFooter: React.FC<GaugeFooterProps> = ({
    width,
    height,
    real,
    actualReal,
    programmed,
    previousMonth,
    difColor,
    previousMonthDifColor,
    showDescriptor,
    format,
    fontFamily,
    valueColor,
    labelColor,
}) => {
    const items: FooterItem[] = [];
    if (isFiniteNumber(programmed)) {
        items.push({ kind: "programmed", value: format(programmed), valueColor, label: "Programado" });
        items.push({ kind: "difference", value: signed(real - programmed, format), valueColor: difColor, label: "Dif. Real & Prog." });
    }
    if (showDescriptor) {
        // 0.3.2.0: Real sin recortar − Real mes anterior, mismo formato y signo que «Dif. Real & Prog.»,
        // coloreado por la favorabilidad de la diferencia (no por la zona del medidor).
        const delta = isFiniteNumber(previousMonth) ? actualReal - previousMonth : undefined;
        items.push({
            kind: "descriptor",
            value: delta !== undefined ? signed(delta, format) : undefined,
            valueColor: delta !== undefined ? previousMonthDifColor(delta) : undefined,
            label: TREND_DESCRIPTOR,
        });
    }

    const columnWidth = width / Math.max(1, items.length);
    const labelFontSize = fitLabelFontSize(items.map((item) => item.label), columnWidth);
    return (
        <g className="gauge-footer" fontFamily={fontFamily}>
            {items.map((item, i) => (
                <g
                    key={item.kind}
                    className={`footer-item footer-${item.kind}`}
                    transform={`translate(${columnWidth * (i + 0.5)}, 0)`}
                    textAnchor="middle"
                >
                    {item.value !== undefined && (
                        <text className="footer-value" y={height * 0.42} fontSize={VALUE_FONT_SIZE} fontWeight={600} fill={item.valueColor}>
                            {item.value}
                        </text>
                    )}
                    <text
                        className="footer-label"
                        // 0.3.1.0: todas las etiquetas en el mismo renglón inferior (boceto).
                        y={height * 0.82}
                        fontSize={labelFontSize}
                        fill={labelColor}
                    >
                        {item.label}
                    </text>
                </g>
            ))}
        </g>
    );
};
