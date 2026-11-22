import * as React from 'react';
import { arcPath, bandRadii } from './arcUtils';

interface GaugeBackgroundProps {
    radius: number;
    startAngle: number;
    endAngle: number;
    thickness: number;
    fill?: string;
    stroke?: string;
}

export const GaugeBackground: React.FC<GaugeBackgroundProps> = ({ radius, startAngle, endAngle, thickness, fill = "#e0e0e0", stroke = "none" }) => {
    const pathData = arcPath({
        ...bandRadii(radius, thickness),
        startAngle,
        endAngle
    });

    return (
        <path
            className="gauge-background"
            d={pathData}
            fill={fill}
            stroke={stroke}
        />
    );
};
