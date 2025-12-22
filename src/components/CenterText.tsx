import * as React from 'react';
import { DataFormat } from './types';

interface CenterTextProps {
    value: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    displayUnits: number;
    dataFormat: DataFormat;
}

export const CenterText: React.FC<CenterTextProps> = ({
    value,
    fontSize,
    fontFamily,
    color,
    displayUnits,
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

        if (displayUnits > 0) {
            formattedValue = value / displayUnits;
            switch (displayUnits) {
                case 1000:
                    suffix = "K";
                    break;
                case 1000000:
                    suffix = "M";
                    break;
                case 1000000000:
                    suffix = "B";
                    break;
                default:
                    suffix = "";
            }
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
