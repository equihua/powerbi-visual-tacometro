import * as React from 'react';

interface ValueMarkerProps {
    radius: number;
    value: number;
    thickness: number;
    markerSize: number;
    markerColor: string;
    markerStyle: string;
    scale: (value: number) => number;
}

export const ValueMarker: React.FC<ValueMarkerProps> = ({
    radius,
    value,
    thickness,
    markerSize,
    markerColor,
    markerStyle,
    scale
}) => {
    const valueAngle = scale(value);
    const markerRadius = radius * 0.88;
    
    const renderMarker = () => {
        switch (markerStyle) {
            case "line": {
                const outerPoint = markerRadius + thickness / 2 + 5;
                const innerPoint = markerRadius - thickness / 2;
                
                return (
                    <g transform={`rotate(${valueAngle * 180 / Math.PI})`}>
                        <line
                            x1={0}
                            y1={-outerPoint}
                            x2={0}
                            y2={-innerPoint}
                            stroke={markerColor}
                            strokeWidth={markerSize / 2}
                            strokeLinecap="round"
                        />
                    </g>
                );
            }
            
            case "circle": {
                const x = Math.sin(valueAngle) * markerRadius;
                const y = -Math.cos(valueAngle) * markerRadius;
                
                return (
                    <g transform={`translate(${x}, ${y})`}>
                        <circle
                            cx={0}
                            cy={0}
                            r={markerSize}
                            fill={markerColor}
                            stroke={markerColor}
                            strokeWidth={1}
                        />
                    </g>
                );
            }
            
            case "triangle": {
                const x = Math.sin(valueAngle) * markerRadius;
                const y = -Math.cos(valueAngle) * markerRadius;
                const trianglePath = `M 0,${-markerSize * 1.2} L ${-markerSize},${markerSize * 0.6} L ${markerSize},${markerSize * 0.6} Z`;
                
                return (
                    <g transform={`translate(${x}, ${y}) rotate(${valueAngle * 180 / Math.PI})`}>
                        <path
                            d={trianglePath}
                            fill={markerColor}
                            stroke={markerColor}
                            strokeWidth={1}
                        />
                    </g>
                );
            }
            
            case "diamond": {
                const x = Math.sin(valueAngle) * markerRadius;
                const y = -Math.cos(valueAngle) * markerRadius;
                const diamondPath = `M 0,${-markerSize} L ${markerSize},0 L 0,${markerSize} L ${-markerSize},0 Z`;
                
                return (
                    <g transform={`translate(${x}, ${y})`}>
                        <path
                            d={diamondPath}
                            fill={markerColor}
                            stroke={markerColor}
                            strokeWidth={1}
                        />
                    </g>
                );
            }
            
            default: {
                const x = Math.sin(valueAngle) * markerRadius;
                const y = -Math.cos(valueAngle) * markerRadius;
                
                return (
                    <g transform={`translate(${x}, ${y})`}>
                        <circle
                            cx={0}
                            cy={0}
                            r={markerSize}
                            fill={markerColor}
                            stroke={markerColor}
                            strokeWidth={1}
                        />
                    </g>
                );
            }
        }
    };
    
    return (
        <g className="value-marker">
            {renderMarker()}
        </g>
    );
};
