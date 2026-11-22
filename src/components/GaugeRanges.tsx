import * as React from 'react';
import { arcPath, bandRadii } from './arcUtils';
import { AngleScale } from './scales';

interface GaugeRangesProps {
    radius: number;
    startAngle: number;
    endAngle: number;
    thickness: number;
    lowThreshold: number;
    midThreshold: number;
    lowColor: string;
    mediumColor: string;
    highColor: string;
    scale: AngleScale;
    /** Contorno de las bandas (alto contraste); "none" por defecto. */
    stroke?: string;
}

export const GaugeRanges: React.FC<GaugeRangesProps> = ({
    radius,
    startAngle,
    endAngle,
    thickness,
    lowThreshold,
    midThreshold,
    lowColor,
    mediumColor,
    highColor,
    scale,
    stroke = "none"
}) => {
    const radii = bandRadii(radius, thickness);
    const lowEndAngle = scale(lowThreshold);
    const mediumEndAngle = scale(midThreshold);

    const lowRangePath = arcPath({ ...radii, startAngle, endAngle: lowEndAngle });
    const mediumRangePath = arcPath({ ...radii, startAngle: lowEndAngle, endAngle: mediumEndAngle });
    const highRangePath = arcPath({ ...radii, startAngle: mediumEndAngle, endAngle });

    return (
        <g className="gauge-ranges">
            <path
                className="range-low"
                d={lowRangePath}
                fill={lowColor}
                stroke={stroke}
            />
            <path
                className="range-medium"
                d={mediumRangePath}
                fill={mediumColor}
                stroke={stroke}
            />
            <path
                className="range-high"
                d={highRangePath}
                fill={highColor}
                stroke={stroke}
            />
        </g>
    );
};
