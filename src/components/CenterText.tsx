import * as React from 'react';
import { formatLocale } from 'd3-format';
import { DataFormat } from './types';

interface CenterTextProps {
    value: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    dataFormat: DataFormat;
}

/**
 * Locale en-US de d3 con guion ASCII como signo negativo (d3 usa "−" U+2212 por
 * defecto) para conservar el texto que producía toFixed.
 */
const numberLocale = formatLocale({
    decimal: ".",
    thousands: ",",
    grouping: [3],
    currency: ["$", ""],
    minus: "-"
});

/** d3-format sólo admite precisión entera en 0..20; null/NaN → 0. */
export function clampPrecision(decimalPlaces: number | null): number {
    if (decimalPlaces === null || !Number.isFinite(decimalPlaces)) {
        return 0;
    }
    return Math.min(20, Math.max(0, Math.round(decimalPlaces)));
}

/**
 * Especificador d3-format. El tipo "%" multiplica por 100, igual que el cálculo
 * previo (value * 100 + "%"), por lo que el número mostrado no cambia:
 * la entrada se asume fracción (0.75 → "75%"), como el formato % de Power BI.
 * Cambio deliberado: se agrega separador de miles (1234.5 → "1,234.5").
 */
export function formatSpecifier(dataFormat: DataFormat): string {
    const precision = clampPrecision(dataFormat.decimalPlaces);
    return dataFormat.isPercentage ? `,.${precision}%` : `,.${precision}f`;
}

/** Formatea un valor del medidor con el mismo formato que la etiqueta central. */
export function formatGaugeValue(value: number, dataFormat: DataFormat): string {
    return numberLocale.format(formatSpecifier(dataFormat))(value);
}

export const CenterText: React.FC<CenterTextProps> = ({
    value,
    fontSize,
    fontFamily,
    color,
    dataFormat
}) => {
    const formatValue = numberLocale.format(formatSpecifier(dataFormat));

    return (
        <text
            className="center-text"
            textAnchor="middle"
            dominantBaseline="middle"
            y={-fontSize * .5}
            fontSize={fontSize}
            fontFamily={fontFamily}
            fill={color}
        >
            {formatValue(value)}
        </text>
    );
};
