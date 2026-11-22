import * as React from 'react';
import { buildTrendGeometry, statusColor, StatusColors, TrendPoint } from './trend';

/** Color neutro de la línea de Real: el estado lo expresan los puntos. */
export const TREND_LINE_COLOR = "#D1D5DB";
const PADDING = 6;
const POINT_RADIUS = 2.5;
const CURRENT_POINT_RADIUS = 4;

export interface TrendSparklineProps {
    points: TrendPoint[];
    width: number;
    height: number;
    /** Índice del mes que muestra el medidor (se resalta); -1 si no hay mes actual. */
    currentIndex: number;
    colors: StatusColors;
    programmedColor: string;
    /** Mismo formato que la etiqueta central. */
    format: (value: number) => string;
}

/**
 * Sparkline mensual: línea de Real con puntos de color de estado y línea discontinua de Programado.
 * Color de cada punto: alto contraste > semáforo del periodo > umbrales del periodo.
 */
export const TrendSparkline: React.FC<TrendSparklineProps> = ({
    points,
    width,
    height,
    currentIndex,
    colors,
    programmedColor,
    format,
}) => {
    const geometry = buildTrendGeometry(points, width, height, PADDING);
    const foreground = colors.highContrast?.foreground;

    return (
        <g className="trend-sparkline">
            {geometry.programmedPath && (
                <path
                    className="trend-programmed-line"
                    d={geometry.programmedPath}
                    fill="none"
                    stroke={foreground ?? programmedColor}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                />
            )}
            <path
                className="trend-real-line"
                d={geometry.realPath}
                fill="none"
                stroke={foreground ?? TREND_LINE_COLOR}
                strokeWidth={1.5}
            />
            {geometry.realPoints.map((vertex) => {
                const point = points[vertex.index];
                const current = vertex.index === currentIndex;
                const programmed = point.programmed !== null ? ` · Prog. ${format(point.programmed)}` : "";
                return (
                    <circle
                        key={vertex.index}
                        className={current ? "trend-point trend-point-current" : "trend-point"}
                        cx={vertex.x}
                        cy={vertex.y}
                        r={current ? CURRENT_POINT_RADIUS : POINT_RADIUS}
                        // Estado del punto con datos de SU periodo (semáforo y umbrales de su fila), no del mes actual.
                        fill={statusColor(vertex.value, point.semaphore, point.thresholds, colors)}
                    >
                        <title>{`${point.label}: Real ${format(vertex.value)}${programmed}`}</title>
                    </circle>
                );
            })}
        </g>
    );
};
