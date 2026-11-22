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
}

export interface HighContrastColors {
  foreground: string;
  background: string;
}

