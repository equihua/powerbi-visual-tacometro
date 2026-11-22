import * as React from 'react';
import { easeCubicOut } from 'd3-ease';
import { interpolateNumber } from 'd3-interpolate';
import { select } from 'd3-selection';
// Side effect: registra selection.transition() / selection.interrupt().
import 'd3-transition';
import { radiansToDegrees, TRANSITION_DURATION_MS } from './arcUtils';
import { AngleScale } from './scales';

interface ValueMarkerProps {
    radius: number;
    value: number;
    thickness: number;
    markerSize: number;
    markerColor: string;
    markerStyle: string;
    scale: AngleScale;
}

/** Transform del marcador para un ángulo dado (radianes, 0 = 12 en punto, horario). */
function markerTransform(markerStyle: string, angle: number, markerRadius: number): string {
    const degrees = radiansToDegrees(angle);
    const x = Math.sin(angle) * markerRadius;
    const y = -Math.cos(angle) * markerRadius;

    switch (markerStyle) {
        case "line":
            return `rotate(${degrees})`;
        case "triangle":
            return `translate(${x}, ${y}) rotate(${degrees})`;
        default:
            return `translate(${x}, ${y})`;
    }
}

/**
 * React no controla el atributo "transform" del grupo posicionado: lo escribe
 * D3 para que un re-render no pise la transición. Se anima el ángulo.
 * Se usa useLayoutEffect (no useEffect) para escribir el estado inicial antes
 * del primer paint y evitar un frame sin "transform". El primer render no anima;
 * cambios posteriores interpolan desde el último ángulo dibujado (ref), y
 * interrupt() cancela cualquier transición en curso antes de iniciar otra.
 */
export const ValueMarker: React.FC<ValueMarkerProps> = ({
    radius,
    value,
    thickness,
    markerSize,
    markerColor,
    markerStyle,
    scale
}) => {
    const groupRef = React.useRef<SVGGElement>(null);
    // Ángulo dibujado actualmente (se actualiza en cada frame de la transición).
    const currentAngleRef = React.useRef<number | null>(null);

    const valueAngle = scale(value);
    const markerRadius = radius * 0.88;

    React.useLayoutEffect(() => {
        if (!groupRef.current) {
            return;
        }
        const group = select(groupRef.current);
        const fromAngle = currentAngleRef.current;

        group.interrupt();

        if (fromAngle === null || fromAngle === valueAngle) {
            currentAngleRef.current = valueAngle;
            group.attr("transform", markerTransform(markerStyle, valueAngle, markerRadius));
            return;
        }

        group.transition()
            .duration(TRANSITION_DURATION_MS)
            .ease(easeCubicOut)
            .attrTween("transform", () => {
                const interpolateAngle = interpolateNumber(fromAngle, valueAngle);
                return (t: number) => {
                    const angle = interpolateAngle(t);
                    currentAngleRef.current = angle;
                    return markerTransform(markerStyle, angle, markerRadius);
                };
            });
    }, [valueAngle, markerStyle, markerRadius]);

    React.useEffect(() => {
        const node = groupRef.current;
        return () => {
            if (node) {
                select(node).interrupt();
            }
        };
    }, []);

    const renderShape = () => {
        switch (markerStyle) {
            case "line": {
                const outerPoint = markerRadius + thickness / 2 + 5;
                const innerPoint = markerRadius - thickness / 2;

                return (
                    <line
                        x1={0}
                        y1={-outerPoint}
                        x2={0}
                        y2={-innerPoint}
                        stroke={markerColor}
                        strokeWidth={markerSize / 2}
                        strokeLinecap="round"
                    />
                );
            }

            case "triangle": {
                const trianglePath = `M 0,${-markerSize * 1.2} L ${-markerSize},${markerSize * 0.6} L ${markerSize},${markerSize * 0.6} Z`;

                return (
                    <path
                        d={trianglePath}
                        fill={markerColor}
                        stroke={markerColor}
                        strokeWidth={1}
                    />
                );
            }

            case "diamond": {
                const diamondPath = `M 0,${-markerSize} L ${markerSize},0 L 0,${markerSize} L ${-markerSize},0 Z`;

                return (
                    <path
                        d={diamondPath}
                        fill={markerColor}
                        stroke={markerColor}
                        strokeWidth={1}
                    />
                );
            }

            default:
                // "circle" y cualquier valor desconocido.
                return (
                    <circle
                        cx={0}
                        cy={0}
                        r={markerSize}
                        fill={markerColor}
                        stroke={markerColor}
                        strokeWidth={1}
                    />
                );
        }
    };

    return (
        <g className="value-marker">
            <g ref={groupRef}>
                {renderShape()}
            </g>
        </g>
    );
};
