import * as React from "react";
import IViewport = powerbi.IViewport;
import { GaugeBackground } from "./GaugeBackground";
import { GaugeRanges } from "./GaugeRanges";
import { PerformanceArc } from "./PerformanceArc";
import { ValueMarker } from "./ValueMarker";
import { GaugeMarker } from "./GaugeMarker";
import { CenterText, formatGaugeValue } from "./CenterText";
import { buildMarkers } from "./markers";
import { BAND_RADIUS_FACTOR, bandRadii, degreesToRadians, semaphoreIndicatorRing } from "./arcUtils";
import { comparisonColor, createAngleScale, createPerformanceColorScale, rangeBandColors } from "./scales";
import { resolveSemaphoreColor } from "./semaphore";
import { GaugeData, GaugeSettings } from "./types";
import { buildAriaLabel } from "../tooltips";
import { computeGaugeFrame, computeGaugeLayout, computeInnerTrendBox } from "./layout";
import { TrendSparkline } from "./TrendSparkline";
import { GaugeFooter } from "./GaugeFooter";

/** Colores del pie (texto oscuro / gris secundario, como los títulos de Power BI). */
const FOOTER_VALUE_COLOR = "#252423";
const FOOTER_LABEL_COLOR = "#605E5C";

/** Redondeo a centésimas para coordenadas estables en el markup. */
const round2 = (value: number) => Math.round(value * 100) / 100;

interface Props {
  viewport: IViewport;
  settings: GaugeSettings | null;
  gaugeData: GaugeData | null;
  /** A3 Rendering Events: se invoca tras confirmar cada render en el DOM. */
  onRendered?: () => void;
}

export default class Gauge extends React.Component<Props> {

  componentDidMount() {
    this.props.onRendered?.();
  }

  componentDidUpdate() {
    this.props.onRendered?.();
  }

  render() {
    const { viewport, settings, gaugeData } = this.props;

    if (!gaugeData || !gaugeData.hasValidData || !settings) {
      // A3 Landing Page (supportsLandingPage + supportsEmptyDataView): instrucciones sin datos.
      return (
        <div
          className="landing-page"
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: "#666666",
            fontSize: "14px",
          }}
        >
          <strong style={{ fontSize: "16px" }}>Tacómetro</strong>
          <span>Agregue una medida al campo «Valor» para mostrar el medidor.</span>
          <span>Opcional: Mínimo, Máximo, Objetivo, Meta con margen, Programado, Real mes anterior y Semáforo.</span>
        </div>
      );
    }

    const width = viewport.width;
    const viewportHeight = viewport.height;

    if (width <= 0 || viewportHeight <= 0) {
      return null;
    }

    // 0.3.0.0: sparkline mensual y pie sólo con serie mensual (>= 2 meses). Sin ella el
    // medidor conserva todo el alto, igual que 0.2.0.0 (aunque haya Programado).
    // 0.3.1.0: sólo el pie reserva alto (anclado abajo); la sparkline va dentro del semicírculo.
    // 0.3.2.0: el medidor se encuadra pegado al pie (computeGaugeFrame) en lugar de centrarse en su caja.
    const trend = gaugeData.trend && gaugeData.trend.length >= 2 ? gaugeData.trend : null;
    const layout = computeGaugeLayout(width, viewportHeight, { footer: trend !== null });
    const height = layout.gaugeHeight;

    // 0.3.2.0: con pie el medidor se agranda/baja hasta quedar a FOOTER_GAP del pie (mismo dibujo).
    // Sin pie el encuadre es el de 0.2.0.0 (radio por el lado menor, centrado).
    const frame = computeGaugeFrame(
      width,
      height,
      settings.thickness,
      settings.startAngle,
      settings.endAngle,
      layout.footer !== null,
      settings.showValueLabel ? settings.fontSize : 0
    );
    const radius = frame.radius;
    const centerX = round2(frame.cx);
    const centerY = round2(frame.cy);
    const startAngleRad = degreesToRadians(settings.startAngle);
    const endAngleRad = degreesToRadians(settings.endAngle);

    const scale = createAngleScale(
      gaugeData.min,
      gaugeData.max,
      startAngleRad,
      endAngleRad
    );
    const highContrast = settings.highContrast;
    // A3: en alto contraste sólo foreground. B1: el semáforo de la fuente tiene prioridad
    // sobre el color calculado por umbrales.
    const semaphoreColor = resolveSemaphoreColor(gaugeData.semaphore, settings);
    const performanceColor =
      highContrast?.foreground ??
      semaphoreColor ??
      createPerformanceColorScale(
        gaugeData.lowThreshold,
        gaugeData.midThreshold,
        settings,
        settings.lowerIsBetter
      )(gaugeData.value);
    const [lowBandColor, midBandColor, highBandColor] = rangeBandColors(settings, settings.lowerIsBetter);
    // B1 con rangos visibles: las bandas siguen mostrando los umbrales y, si la fuente trae
    // semáforo, un arco de progreso delgado por dentro de la banda muestra ese color
    // (performanceColor, así que el alto contraste conserva la precedencia).
    // 0.3.3.1: geometría del anillo compartida con computeInnerTrendBox (la sparkline no lo toca).
    const indicatorRing = semaphoreIndicatorRing(bandRadii(radius, settings.thickness).innerRadius, settings.thickness);
    const indicatorThickness = indicatorRing.thickness;
    const indicatorRadius = (indicatorRing.innerRadius + indicatorRing.outerRadius) / 2 / BAND_RADIUS_FACTOR;
    const format = (value: number) => formatGaugeValue(value, gaugeData.dataFormat);
    // 0.3.4.0: sin «Mostrar Rangos» no se dibuja el anillo delgado del semáforo (abajo sólo el
    // performance-arc de grosor completo), así que la sparkline no necesita evitarlo (más ancho).
    const trendBox =
        trend && layout.footer ? computeInnerTrendBox(radius, settings.thickness, settings.startAngle, settings.endAngle, settings.showRanges) : null;

    return (
      // A3 Keyboard Navigation: el SVG recibe el foco (supportsKeyboardFocus) y se anuncia como imagen.
      <svg
        className="gauge-svg"
        width={width}
        height={viewportHeight}
        tabIndex={0}
        role="img"
        aria-label={buildAriaLabel(gaugeData)}
      >
        <g transform={`translate(${centerX}, ${centerY})`}>
          <GaugeBackground
            radius={radius}
            startAngle={startAngleRad}
            endAngle={endAngleRad}
            thickness={settings.thickness}
            fill={highContrast?.background}
            stroke={highContrast?.foreground}
          />

          {settings.showRanges && (
            <GaugeRanges
              radius={radius}
              startAngle={startAngleRad}
              endAngle={endAngleRad}
              thickness={settings.thickness}
              lowThreshold={gaugeData.lowThreshold}
              midThreshold={gaugeData.midThreshold}
              lowColor={lowBandColor}
              mediumColor={midBandColor}
              highColor={highBandColor}
              scale={scale}
              stroke={highContrast?.foreground}
            />
          )}

          {settings.showRanges && semaphoreColor !== null && (
            <PerformanceArc
              className="semaphore-indicator"
              radius={indicatorRadius}
              value={gaugeData.value}
              startAngle={startAngleRad}
              thickness={indicatorThickness}
              color={performanceColor}
              scale={scale}
            />
          )}

          {!settings.showRanges && (
            <PerformanceArc
              radius={radius}
              value={gaugeData.value}
              startAngle={startAngleRad}
              thickness={settings.thickness}
              color={performanceColor}
              scale={scale}
            />
          )}

          {buildMarkers(gaugeData, settings).map((marker) => (
            <GaugeMarker
              key={marker.kind}
              marker={highContrast ? { ...marker, color: highContrast.foreground } : marker}
              radius={radius}
              thickness={settings.thickness}
              scale={scale}
              formattedValue={formatGaugeValue(marker.value, gaugeData.dataFormat)}
            />
          ))}

          {settings.showValueMarker && (
            <ValueMarker
              radius={radius}
              value={gaugeData.value}
              thickness={settings.thickness}
              markerSize={settings.markerSize}
              markerColor={settings.markerColor}
              markerStyle={settings.markerStyle}
              scale={scale}
            />
          )}

          {settings.showValueLabel && (
            <CenterText
              value={gaugeData.value}
              fontSize={settings.fontSize}
              fontFamily={settings.fontFamily}
              // 0.3.3.1: exactamente el color que consume el arco (indicador del semáforo o arco de desempeño):
              // alto contraste > semáforo de la fuente > umbrales. Sin clasificación geométrica aparte.
              color={performanceColor}
              dataFormat={gaugeData.dataFormat}
            />
          )}
        </g>

        {trend && trendBox && (
          <g
            className="gauge-trend-slot"
            transform={`translate(${round2(centerX + trendBox.x)}, ${round2(centerY + trendBox.y)})`}
          >
            <TrendSparkline
              points={trend}
              width={trendBox.width}
              height={trendBox.height}
              currentIndex={gaugeData.trendCurrentIndex ?? -1}
              colors={settings}
              programmedColor={settings.programmedColor}
              format={format}
            />
          </g>
        )}

        {layout.footer && (
          <g className="gauge-footer-slot" transform={`translate(0, ${layout.footer.y})`}>
            <GaugeFooter
              width={width}
              height={layout.footer.height}
              real={gaugeData.value}
              actualReal={gaugeData.actualValue ?? gaugeData.value}
              programmed={gaugeData.programmed}
              previousMonth={gaugeData.previousMonth}
              difColor={performanceColor}
              previousMonthDifColor={(delta) =>
                highContrast?.foreground ??
                comparisonColor(delta, settings, settings.lowerIsBetter, FOOTER_VALUE_COLOR)
              }
              showDescriptor={trendBox !== null}
              format={format}
              fontFamily={settings.fontFamily}
              valueColor={highContrast?.foreground ?? FOOTER_VALUE_COLOR}
              labelColor={highContrast?.foreground ?? FOOTER_LABEL_COLOR}
            />
          </g>
        )}
      </svg>
    );
  }
}
