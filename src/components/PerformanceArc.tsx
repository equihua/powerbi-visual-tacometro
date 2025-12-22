import * as React from 'react';

interface PerformanceArcProps {
    radius: number;
    value: number;
    startAngle: number;
    thickness: number;
    color: string;
    scale: (value: number) => number;
}

export const PerformanceArc: React.FC<PerformanceArcProps> = ({
    radius,
    value,
    startAngle,
    thickness,
    color,
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
    
    const endAngle = scale(value);
    
    const pathData = describeArc(
        innerRadius - thickness / 2,
        innerRadius + thickness / 2,
        startAngle,
        endAngle
    );
    
    return (
        <path
            className="performance-arc"
            d={pathData}
            fill={color}
            stroke="none"
        />
    );
};
