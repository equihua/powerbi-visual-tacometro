import * as React from 'react';

interface GaugeBackgroundProps {
    radius: number;
    startAngle: number;
    endAngle: number;
    thickness: number;
}

export const GaugeBackground: React.FC<GaugeBackgroundProps> = ({ radius, startAngle, endAngle, thickness }) => {
    const innerRadius = radius * 0.95;
    
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
    
    const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInRadians: number) => {
        return {
            x: centerX + (radius * Math.sin(angleInRadians)),
            y: centerY - (radius * Math.cos(angleInRadians))
        };
    };
    
    const pathData = describeArc(
        innerRadius - thickness / 2,
        innerRadius + thickness / 2,
        startAngle,
        endAngle
    );
    
    return (
        <path
            className="gauge-background"
            d={pathData}
            fill="#e0e0e0"
            stroke="none"
        />
    );
};
