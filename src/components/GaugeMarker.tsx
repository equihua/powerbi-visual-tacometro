import * as React from 'react';
import { bandRadii, radiansToDegrees } from './arcUtils';
import { MarkerSpec } from './markers';
import { AngleScale } from './scales';

const OVERHANG = 6;
const STROKE_WIDTH = 3;
const DASH = "4 3";
const TRIANGLE_HALF_WIDTH = 6;
const TRIANGLE_HEIGHT = 10;

interface GaugeMarkerProps {
    marker: MarkerSpec;
    radius: number;
    thickness: number;
    scale: AngleScale;
    /** Texto ya formateado del valor para el título accesible. */
    formattedValue: string;
}

/** Forma del marcador dibujada en la posición de las 12 en punto; el grupo la rota. */
function MarkerShape({ marker, innerRadius, outerRadius }: { marker: MarkerSpec; innerRadius: number; outerRadius: number }) {
    switch (marker.shape) {
        case "triangle": {
            // Apunta hacia el centro desde fuera de la banda.
            const tip = -(outerRadius + 1);
            const base = tip - TRIANGLE_HEIGHT;
            return (
                <polygon
                    points={`0,${tip} ${-TRIANGLE_HALF_WIDTH},${base} ${TRIANGLE_HALF_WIDTH},${base}`}
                    fill={marker.color}
                />
            );
        }
        case "circle":
            return (
                <circle
                    cx={0}
                    cy={-(innerRadius + outerRadius) / 2}
                    r={Math.max(3, (outerRadius - innerRadius) / 4)}
                    fill="none"
                    stroke={marker.color}
                    strokeWidth={2}
                />
            );
        default:
            return (
                <line
                    x1={0}
                    y1={-(outerRadius + OVERHANG)}
                    x2={0}
                    y2={-Math.max(0, innerRadius - OVERHANG)}
                    stroke={marker.color}
                    strokeWidth={STROKE_WIDTH}
                    strokeLinecap="butt"
                    strokeDasharray={marker.shape === "dashed" ? DASH : undefined}
                />
            );
    }
}

export const GaugeMarker: React.FC<GaugeMarkerProps> = ({ marker, radius, thickness, scale, formattedValue }) => {
    const { innerRadius, outerRadius } = bandRadii(radius, thickness);
    const angleDegrees = radiansToDegrees(scale(marker.value));

    return (
        <g className={`gauge-marker marker-${marker.kind}`} transform={`rotate(${angleDegrees})`}>
            <title>{`${marker.label}: ${formattedValue}`}</title>
            <MarkerShape marker={marker} innerRadius={innerRadius} outerRadius={outerRadius} />
        </g>
    );
};
