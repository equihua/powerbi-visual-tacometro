import * as React from 'react';
import { bandRadii, radiansToDegrees } from './arcUtils';
import { AngleScale } from './scales';

/** Color fijo y contrastante con los rangos (rojo/amarillo/verde) y el fondo gris. */
const TARGET_MARKER_COLOR = "#252423";
const TARGET_MARKER_OVERHANG = 6;
const TARGET_MARKER_WIDTH = 3;

interface TargetMarkerProps {
    radius: number;
    thickness: number;
    target: number;
    scale: AngleScale;
}

export const TargetMarker: React.FC<TargetMarkerProps> = ({ radius, thickness, target, scale }) => {
    const { innerRadius, outerRadius } = bandRadii(radius, thickness);
    const angleDegrees = radiansToDegrees(scale(target));

    return (
        <g className="target-marker" transform={`rotate(${angleDegrees})`}>
            <title>Objetivo</title>
            <line
                x1={0}
                y1={-(outerRadius + TARGET_MARKER_OVERHANG)}
                x2={0}
                y2={-Math.max(0, innerRadius - TARGET_MARKER_OVERHANG)}
                stroke={TARGET_MARKER_COLOR}
                strokeWidth={TARGET_MARKER_WIDTH}
                strokeLinecap="butt"
            />
        </g>
    );
};
