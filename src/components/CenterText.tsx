import * as React from 'react';
import { DataFormat } from './types';

interface CenterTextProps {
    value: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    dataFormat: DataFormat;
}

export const CenterText: React.FC<CenterTextProps> = ({
    value,
    fontSize,
    fontFamily,
    color,
    dataFormat
}) => {
    const formatValue = (value: number): string => {
        let formattedValue = value;
        let suffix = "";

        if (dataFormat.isPercentage) {
            formattedValue = value * 100;
            suffix = "%";
            const precision = dataFormat.decimalPlaces !== null ? dataFormat.decimalPlaces : 0;
            return formattedValue.toFixed(precision) + suffix;
        }

        const precision = dataFormat.decimalPlaces !== null ? dataFormat.decimalPlaces : 0;
        return formattedValue.toFixed(precision) + suffix;
    };

    return (
        <text
            className="center-text"
            textAnchor="middle"
            dominantBaseline="middle"
            y={-fontSize * 0.5}
            fontSize={fontSize}
            fontFamily={fontFamily}
            fill={color}
        >
            {formatValue(value)}
        </text>
    );
};
