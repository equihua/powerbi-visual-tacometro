import * as React from 'react';

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
    scale: (value: number) => number;
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
    scale
}) => {
    const innerRadius = radius * 0.95;
    
    const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInRadians: number) => {
        return {
            x: centerX + (radius * Math.sin(angleInRadians)),
            y: centerY - (radius * Math.cos(angleInRadians))
        };
    };
    
    const describeArc = (innerR: number, outerR: number, startAngle: number, endAngle: number): string => {
        const startInner = polarToCartesian(0, 0, innerR, endAngle);
        const endInner = polarToCartesian(0, 0, innerR, startAngle);
        const startOuter = polarToCartesian(0, 0, outerR, endAngle);
        const endOuter = polarToCartesian(0, 0, outerR, startAngle);
        
        const largeArcFlag = endAngle - startAngle <= Math.PI ? "0" : "1";
        
        return [
            "M", startInner.x, startInner.y,
            "A", innerR, innerR, 0, largeArcFlag, 0, endInner.x, endInner.y,
            "L", endOuter.x, endOuter.y,
            "A", outerR, outerR, 0, largeArcFlag, 1, startOuter.x, startOuter.y,
            "Z"
        ].join(" ");
    };
    
    const lowEndAngle = scale(lowThreshold);
    const mediumEndAngle = scale(midThreshold);
    
    const lowRangePath = describeArc(
        innerRadius - thickness / 2,
        innerRadius + thickness / 2,
        startAngle,
        lowEndAngle
    );
    
    const mediumRangePath = describeArc(
        innerRadius - thickness / 2,
        innerRadius + thickness / 2,
        lowEndAngle,
        mediumEndAngle
    );
    
    const highRangePath = describeArc(
        innerRadius - thickness / 2,
        innerRadius + thickness / 2,
        mediumEndAngle,
        endAngle
    );
    
    return (
        <g className="gauge-ranges">
            <path
                className="range-low"
                d={lowRangePath}
                fill={lowColor}
                stroke="none"
            />
            <path
                className="range-medium"
                d={mediumRangePath}
                fill={mediumColor}
                stroke="none"
            />
            <path
                className="range-high"
                d={highRangePath}
                fill={highColor}
                stroke="none"
            />
        </g>
    );
};
