import * as React from 'react';
import {
    areaPolygonPoints,
    buildTrendGeometry,
    computeBarRect,
    computeTrendBarWidth,
    computeTrendYDomain,
    createTrendYScale,
    lastIndexWithReal,
    runsOf,
    statusColor,
    StatusColors,
    TrendChartType,
    TrendPoint,
    TrendVertex,
    YScaleMode,
} from './trend';
import { trendTransformAttribute } from './trendTransform';
import { isFiniteNumber } from './scales';
import { TREND_CURRENT_POINT_RADIUS as CURRENT_POINT_RADIUS, TREND_PADDING as PADDING, TREND_POINT_RADIUS as POINT_RADIUS } from './layout';

/** Color neutro de la línea de Real cuando el chartType es "lineDots" (el estado lo expresan los puntos). */
export const TREND_LINE_COLOR = "#D1D5DB";
/** Color fijo por omisión cuando «Colores por semáforo» está apagado y el panel no trae uno propio. */
export const TREND_DEFAULT_FIXED_COLOR = "#4472C4";
/** Diferencia de radio entre el punto del mes actual y el resto (4 − 2.5 de 0.3.3.1), aplicada sobre `pointSize`. */
const CURRENT_POINT_EXTRA = CURRENT_POINT_RADIUS - POINT_RADIUS;

/** 0.4.1.1 — el tipo vive en trend.ts (módulo puro, sin JSX; lo necesita `buildTrendDrawnShapes` para
 * la homotecia anticolisión); se re-exporta aquí para no romper ningún import existente
 * (`from "./TrendSparkline"`). */
export type { TrendChartType };

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
    /** 0.4.0.0 — tipo de gráfico de Real; por omisión "lineDots" (comportamiento 0.3.5.0). */
    chartType?: TrendChartType;
    /**
     * 0.4.x — rotación (grados) de toda la serie; por omisión 0. Pivote FIJO en la esquina inferior
     * izquierda de la caja (no el centro: ver `trendTransform.ts`); ángulo positivo = apariencia
     * ANTIHORARIA en pantalla (p' = R(ángulo)·S(escala)·p, compensando la inversión de Y del SVG).
     */
    angle?: number;
    /**
     * 0.4.x — homotecia (escala uniforme) sobre el mismo pivote que `angle`; por omisión 1 (sin
     * cambio). Pensada para la reducción automática anticolisión (`fitTrendScale`, trendFit.ts):
     * nunca mueve el pivote ni cambia el ángulo, sólo el tamaño.
     */
    scale?: number;
    /** 0.4.0.0 — modo de escala Y; por omisión "auto" (ver computeTrendYDomain en trend.ts). */
    yScaleMode?: YScaleMode;
    /** 0.4.0.0 — límites manuales; sólo tienen efecto con yScaleMode === "manual". */
    yMin?: number;
    yMax?: number;
    /** 0.4.0.0 — mostrar/ocultar la línea discontinua de Programado; por omisión true (0.3.5.0). */
    showProgrammed?: boolean;
    /**
     * 0.4.0.0 — true (por omisión): cada punto/segmento/barra usa su color de estado (statusColor: alto
     * contraste > semáforo de SU periodo > umbrales de SU periodo — misma lógica que ya usa el número
     * central, ver Gauge.tsx). false: todos usan `fixedColor`.
     */
    useSemaphoreColors?: boolean;
    /** 0.4.0.0 — color cuando useSemaphoreColors es false. */
    fixedColor?: string;
    /** 0.4.0.0 — grosor de la línea de Real/Programado y contorno de barras/área; por omisión 1.5. */
    lineWidth?: number;
    /** 0.4.0.0 — radio de los puntos (el del mes actual se mantiene con el mismo margen de 0.3.3.1 encima); por omisión 2.5. */
    pointSize?: number;
}

/** Trazo cerrado (área) de un run bajo/sobre `baselineY`: sube por los vértices y regresa por la base.
 * 0.4.1.1: construido desde `areaPolygonPoints` (trend.ts) — fuente única con la geometría real de
 * colisión (`buildTrendDrawnShapes`); mismo trazo SVG exacto que antes (verificado en tests/trendSparkline.test.ts). */
function areaPathOf(run: TrendVertex[], baselineY: number): string {
    const [first, ...rest] = areaPolygonPoints(run, baselineY);
    return `M${first.x},${first.y}${rest.map((p) => `L${p.x},${p.y}`).join("")}Z`;
}

/**
 * Sparkline mensual de tendencia (tarjeta «Gráfico de tendencia», 0.4.0.0): 4 tipos de gráfico para Real
 * (línea con puntos / sólo línea / barras / área), rotación, 3 modos de escala Y, mostrar/ocultar
 * Programado y colores por semáforo o fijo, con grosor de línea y tamaño de punto configurables.
 *
 * 0.3.x (comportamiento por omisión con chartType "lineDots"): línea de Real con puntos de color de
 * estado y línea discontinua de Programado. Color de cada punto: alto contraste > semáforo del periodo >
 * umbrales del periodo (igual precedencia que el número central, ver `statusColor`).
 *
 * Requisito 6 (NO ROMPER, ver tests/trendCard.test.ts): sólo la tooltip clara propia por punto
 * ('Periodo: Real · Programado'), nunca la nativa oscura del host — por eso NINGÚN elemento de este
 * componente usa el atributo SVG `title`; visual.ts identifica el punto bajo el cursor con
 * `data-trend-index` (closest()), presente en TODOS los tipos de gráfico (en "line"/"area", que no
 * tienen una forma propia por punto, se añaden círculos invisibles sólo para esto — ver `hitPoints`).
 */
export const TrendSparkline: React.FC<TrendSparklineProps> = ({
    points,
    width,
    height,
    currentIndex,
    colors,
    programmedColor,
    format,
    chartType = "lineDots",
    angle = 0,
    scale = 1,
    yScaleMode = "auto",
    yMin,
    yMax,
    showProgrammed = true,
    useSemaphoreColors = true,
    fixedColor = TREND_DEFAULT_FIXED_COLOR,
    lineWidth = 1.5,
    pointSize = POINT_RADIUS,
}) => {
    // Requisito 5: el dominio siempre combina Real + Programado, AUNQUE «Mostrar Programado» esté
    // apagado — así ocultar esa línea no reescala Real de forma sorpresiva (decisión documentada en
    // computeTrendYDomain, trend.ts).
    const combinedValues = points.flatMap((point) => [point.real, point.programmed]).filter(isFiniteNumber);
    const domain = computeTrendYDomain(combinedValues, yScaleMode, yMin, yMax);
    const geometry = buildTrendGeometry(points, width, height, PADDING, domain);
    const foreground = colors.highContrast?.foreground;

    // Color de un punto/segmento/barra: semáforo de SU periodo (statusColor) o el fijo del panel.
    const pointColor = (vertex: TrendVertex): string => {
        if (!useSemaphoreColors) {
            return foreground ?? fixedColor;
        }
        const point = points[vertex.index];
        return statusColor(vertex.value, point.semaphore, point.thresholds, colors);
    };

    // Color único para "area" (no hay un punto por segmento que pintar): el del mes actual si lo hay,
    // si no el del último periodo con Real (misma referencia que usa el pie/número central).
    const singleStatusColor = (): string => {
        if (!useSemaphoreColors) {
            return foreground ?? fixedColor;
        }
        const index = currentIndex >= 0 && points[currentIndex]?.real !== null ? currentIndex : lastIndexWithReal(points);
        if (index < 0) {
            return foreground ?? fixedColor;
        }
        const point = points[index];
        return statusColor(point.real as number, point.semaphore, point.thresholds, colors);
    };

    const baselineY = createTrendYScale(domain, height, PADDING)(Math.min(domain[1], Math.max(domain[0], 0)));
    // 0.4.1.1: fuente única con `buildTrendDrawnShapes` (trend.ts) — así el ancho de barra que se DIBUJA
    // y el que se usa para la homotecia anticolisión nunca pueden divergir.
    const barWidth = computeTrendBarWidth(width, points.length, PADDING);

    const realRuns = runsOf(geometry.realPoints);

    const programmedLine = showProgrammed && geometry.programmedPath && (
        <path
            className="trend-programmed-line"
            d={geometry.programmedPath}
            fill="none"
            stroke={foreground ?? programmedColor}
            strokeWidth={1.5}
            strokeDasharray="4 3"
        />
    );

    // 0.4.0.0: círculos invisibles sólo para la tooltip por punto (requisito 6) en los tipos de gráfico
    // que no tienen ya una forma propia por punto ("line" y "area"; "bars" usa el <rect>, "lineDots" sus
    // propios círculos visibles). Área de toque generosa (≥ 6px) independiente de `pointSize`.
    const hitRadius = Math.max(pointSize, 6);
    const hitPoints = (chartType === "line" || chartType === "area") && (
        <g className="trend-hit-points">
            {geometry.realPoints.map((vertex) => (
                <circle
                    key={vertex.index}
                    className="trend-hit-point"
                    data-trend-index={vertex.index}
                    cx={vertex.x}
                    cy={vertex.y}
                    r={hitRadius}
                    fill="transparent"
                />
            ))}
        </g>
    );

    let realContent: React.ReactNode;
    if (chartType === "bars") {
        realContent = geometry.realPoints.map((vertex) => {
            const rect = computeBarRect(vertex.x, vertex.y, baselineY, barWidth);
            return (
                <rect
                    key={vertex.index}
                    className="trend-bar"
                    data-trend-index={vertex.index}
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    fill={pointColor(vertex)}
                />
            );
        });
    } else if (chartType === "area") {
        const fill = singleStatusColor();
        realContent = (
            <>
                {realRuns.map((run, i) => (
                    <path
                        key={i}
                        className="trend-area"
                        d={areaPathOf(run, baselineY)}
                        fill={fill}
                        stroke={fill}
                        strokeWidth={lineWidth}
                    />
                ))}
                {hitPoints}
            </>
        );
    } else if (chartType === "line") {
        realContent = (
            <>
                {useSemaphoreColors
                    ? realRuns.flatMap((run, runIndex) =>
                          run.slice(1).map((vertex, i) => {
                              const previous = run[i];
                              return (
                                  <line
                                      key={`${runIndex}-${vertex.index}`}
                                      className="trend-line-segment"
                                      x1={previous.x}
                                      y1={previous.y}
                                      x2={vertex.x}
                                      y2={vertex.y}
                                      stroke={foreground ?? pointColor(vertex)}
                                      strokeWidth={lineWidth}
                                  />
                              );
                          })
                      )
                    : (
                          <path
                              className="trend-real-line"
                              d={geometry.realPath}
                              fill="none"
                              stroke={foreground ?? fixedColor}
                              strokeWidth={lineWidth}
                          />
                      )}
                {hitPoints}
            </>
        );
    } else {
        // "lineDots" (por omisión, 0.3.5.0): línea neutra + puntos de color de estado.
        realContent = (
            <>
                <path
                    className="trend-real-line"
                    d={geometry.realPath}
                    fill="none"
                    stroke={foreground ?? TREND_LINE_COLOR}
                    strokeWidth={lineWidth}
                />
                {geometry.realPoints.map((vertex) => {
                    const current = vertex.index === currentIndex;
                    return (
                        // 0.3.4.0: sin <title> SVG nativo (tooltip gris de depuración del navegador, duplicaba
                        // a la tooltip clara de visual.ts/tooltips.ts). visual.ts lee data-trend-index al hover
                        // para mostrar únicamente esa tooltip clara con los mismos datos (periodo, Real, Programado).
                        <circle
                            key={vertex.index}
                            className={current ? "trend-point trend-point-current" : "trend-point"}
                            data-trend-index={vertex.index}
                            cx={vertex.x}
                            cy={vertex.y}
                            r={current ? pointSize + CURRENT_POINT_EXTRA : pointSize}
                            fill={pointColor(vertex)}
                        />
                    );
                })}
            </>
        );
    }

    return (
        <g className="trend-sparkline" transform={trendTransformAttribute(height, angle, scale)}>
            {programmedLine}
            {realContent}
        </g>
    );
};
