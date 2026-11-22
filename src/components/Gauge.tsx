import * as React from "react";
import IViewport = powerbi.IViewport;
import { GaugeBackground } from "./GaugeBackground";
import { GaugeRanges } from "./GaugeRanges";
import { PerformanceArc } from "./PerformanceArc";
import { ValueMarker } from "./ValueMarker";
import { GaugeMarker } from "./GaugeMarker";
import { CenterText, formatGaugeValue } from "./CenterText";
import { buildMarkers } from "./markers";
import { BAND_RADIUS_FACTOR, bandRadii, degreesToRadians } from "./arcUtils";
import { createAngleScale, createPerformanceColorScale, rangeBandColors } from "./scales";
import { resolveSemaphoreColor } from "./semaphore";
import { GaugeData, GaugeSettings } from "./types";
import { buildAriaLabel } from "../tooltips";

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
    const height = viewport.height;

    if (width <= 0 || height <= 0) {
      return null;
    }

    const size = Math.min(width, height);
    const radius = size / 2 / 0.95 - settings.thickness / 2;
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
    const indicatorThickness = Math.max(3, settings.thickness * 0.3);
    const indicatorCenter = Math.max(
      indicatorThickness / 2,
      bandRadii(radius, settings.thickness).innerRadius - 2 - indicatorThickness / 2
    );
    const indicatorRadius = indicatorCenter / BAND_RADIUS_FACTOR;

    return (
      // A3 Keyboard Navigation: el SVG recibe el foco (supportsKeyboardFocus) y se anuncia como imagen.
      <svg
        className="gauge-svg"
        width={width}
        height={height}
        tabIndex={0}
        role="img"
        aria-label={buildAriaLabel(gaugeData)}
      >
        <g transform={`translate(${width / 2}, ${height / 2})`}>
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
              color={settings.labelColor}
              dataFormat={gaugeData.dataFormat}
            />
          )}
        </g>
      </svg>
    );
  }
}
