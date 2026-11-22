import * as React from 'react';
import { easeCubicOut } from 'd3-ease';
import { interpolateNumber } from 'd3-interpolate';
import { select } from 'd3-selection';
// Side effect: registra selection.transition() / selection.interrupt().
import 'd3-transition';
import { arcPath, bandRadii, TRANSITION_DURATION_MS } from './arcUtils';
import { AngleScale } from './scales';

interface PerformanceArcProps {
    radius: number;
    value: number;
    startAngle: number;
    thickness: number;
    color: string;
    scale: AngleScale;
    /** Clase CSS del path; "performance-arc" por defecto. */
    className?: string;
}

/**
 * React no controla el atributo "d": lo escribe D3 para que un re-render no
 * pise la transición. Se anima el ángulo final (no el string "d").
 * Se usa useLayoutEffect (no useEffect) para escribir el estado inicial antes
 * del primer paint y evitar un frame sin "d". El primer render no anima;
 * cambios posteriores interpolan desde el último ángulo dibujado (ref), y
 * interrupt() cancela cualquier transición en curso antes de iniciar otra.
 */
export const PerformanceArc: React.FC<PerformanceArcProps> = ({
    radius,
    value,
    startAngle,
    thickness,
    color,
    scale,
    className = "performance-arc"
}) => {
    const pathRef = React.useRef<SVGPathElement>(null);
    // Ángulo final dibujado actualmente (se actualiza en cada frame de la transición).
    const currentAngleRef = React.useRef<number | null>(null);

    const endAngle = scale(value);
    const { innerRadius, outerRadius } = bandRadii(radius, thickness);

    React.useLayoutEffect(() => {
        if (!pathRef.current) {
            return;
        }
        const path = select(pathRef.current);
        const draw = (angle: number) => arcPath({ innerRadius, outerRadius, startAngle, endAngle: angle });
        const fromAngle = currentAngleRef.current;

        path.interrupt();

        if (fromAngle === null || fromAngle === endAngle) {
            currentAngleRef.current = endAngle;
            path.attr("d", draw(endAngle));
            return;
        }

        path.transition()
            .duration(TRANSITION_DURATION_MS)
            .ease(easeCubicOut)
            .attrTween("d", () => {
                const interpolateAngle = interpolateNumber(fromAngle, endAngle);
                return (t: number) => {
                    const angle = interpolateAngle(t);
                    currentAngleRef.current = angle;
                    return draw(angle);
                };
            });
    }, [endAngle, innerRadius, outerRadius, startAngle]);

    React.useEffect(() => {
        const node = pathRef.current;
        return () => {
            if (node) {
                select(node).interrupt();
            }
        };
    }, []);

    return (
        <path
            ref={pathRef}
            className={className}
            fill={color}
            stroke="none"
        />
    );
};
