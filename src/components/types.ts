import type { TrendPoint } from "./trend";

export interface DataFormat {
  decimalPlaces: number | null;
  isPercentage: boolean;
}

export interface GaugeData {
  /** Valor recortado a [min, max] para dibujar. */
  value: number;
  /** Valor real del measure sin recortar (tooltip/accesibilidad); si falta se usa `value`. */
  actualValue?: number;
  min: number;
  max: number;
  /** Siempre definido: measure bindeado o, por defecto, min + (max - min) / 3. */
  lowThreshold: number;
  /** Siempre definido: measure bindeado o, por defecto, min + 2 * (max - min) / 3. */
  midThreshold: number;
  /** Measure bindeado > valor del panel; undefined si no hay ninguno. */
  target?: number;
  /** Meta con margen (B3); undefined si no hay measure. */
  targetWithMargin?: number;
  /** Programado (B3); undefined si no hay measure. */
  programmed?: number;
  /** Real del mes anterior (B3); undefined si no hay measure. */
  previousMonth?: number;
  hasValidData: boolean;
  dataFormat: DataFormat;
  /** Semáforo de la fuente (Verde/Amarillo/Rojo, clase text-* o #hex); null si no hay. */
  semaphore: string | null;
  /** 0.3.0.0: historial mensual (rol «Periodo (mes)»); undefined sin periodo enlazado. */
  trend?: TrendPoint[];
  /** Índice en `trend` del mes que muestra el medidor. */
  trendCurrentIndex?: number;
}

export interface GaugeSettings {
  thickness: number;
  startAngle: number;
  endAngle: number;
  /** 0.4.0.0: aire reservado arriba del vértice del arco (ver computeGaugeFrame en layout.ts). */
  topMargin: number;
  /** 0.4.0.0: % del radio máximo seguro que ocupa el arco (100 = sin cambio, ver computeGaugeFrame). */
  arcScale: number;
  /** 0.4.0.0: desplazamiento vertical (px) del centro del medidor tras el resto del encuadre. */
  offsetY: number;
  showRanges: boolean;
  lowColor: string;
  mediumColor: string;
  highColor: string;
  showValueMarker: boolean;
  markerSize: number;
  markerColor: string;
  markerStyle: any;
  showValueLabel: boolean;
  fontSize: number;
  fontFamily: string;
  labelColor: string;
  /** B2: "menor es mejor" invierte la asignación de colores de desempeño. */
  lowerIsBetter: boolean;
  /** B3: colores de los marcadores adicionales. */
  targetMarginColor: string;
  programmedColor: string;
  previousMonthColor: string;
  /** A3: presente sólo en modo alto contraste (colores del host). */
  highContrast?: HighContrastColors;

  // 0.4.0.0 — tarjeta «Gráfico de tendencia» (TrendSparkline.tsx); todas opcionales y retrocompatibles
  // (sin tocar la tarjeta, Gauge.tsx aplica los mismos valores por omisión que TrendSparkline: ver sus
  // defaults de props). Ver settings.ts (TrendCardSettings) y layout.ts (applyTrendBoxOverrides).
  /** Tipo de gráfico de Real; sin valor usa el default de TrendSparkline ("lineDots"). */
  trendChartType?: string;
  /** Posición/tamaño: sin valor se usa el cálculo automático de ESE eje (computeInnerTrendBox). */
  trendPosX?: number;
  trendPosY?: number;
  trendWidth?: number;
  trendHeight?: number;
  /** Rotación (grados) de la serie; sin valor, 0 (horizontal). */
  trendAngle?: number;
  /** Modo de escala Y; sin valor usa el default de TrendSparkline ("auto"). */
  trendYScaleMode?: string;
  /** Límites manuales; sólo con trendYScaleMode === "manual". */
  trendYMin?: number;
  trendYMax?: number;
  /** Mostrar/ocultar la línea de Programado; sin valor, true. */
  trendShowProgrammed?: boolean;
  /** Colores por semáforo (true) o color fijo (false); sin valor, true. */
  trendUseSemaphoreColors?: boolean;
  trendFixedColor?: string;
  trendLineWidth?: number;
  trendPointSize?: number;
}

export interface HighContrastColors {
  foreground: string;
  background: string;
}

