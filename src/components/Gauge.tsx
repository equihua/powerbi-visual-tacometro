import * as React from "react";
import IViewport = powerbi.IViewport;
import { GaugeBackground } from "./GaugeBackground";
import { GaugeRanges } from "./GaugeRanges";
import { PerformanceArc } from "./PerformanceArc";
import { ValueMarker } from "./ValueMarker";
import { CenterText } from "./CenterText";
import { GaugeData, GaugeSettings } from "./types";

interface Props {
  viewport: IViewport;
  settings: GaugeSettings | null;
  gaugeData: GaugeData | null;
}

export default class Gauge extends React.Component<Props> {

  private createScale(
    min: number,
    max: number,
    startAngle: number,
    endAngle: number
  ) {
    return (value: number): number => {
      const normalizedValue = Math.max(min, Math.min(max, value));
      const ratio = (normalizedValue - min) / (max - min);
      return startAngle + ratio * (endAngle - startAngle);
    };
  }

  private getPerformanceColor(
    value: number,
    lowThreshold: number,
    midThreshold: number
  ): string {
    const { settings } = this.props;

    if (value <= lowThreshold) {
      return settings.lowColor;
    } else if (value <= midThreshold) {
      return settings.mediumColor;
    } else {
      return settings.highColor;
    }
  }

  render() {
    const { viewport, settings, gaugeData } = this.props;

    if (!gaugeData || !gaugeData.hasValidData || !settings) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666666",
            fontSize: "16px",
          }}
        >
          No hay datos disponibles
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
    const startAngleRad = settings.startAngle * (Math.PI / 180);
    const endAngleRad = settings.endAngle * (Math.PI / 180);

    const scale = this.createScale(
      gaugeData.min,
      gaugeData.max,
      startAngleRad,
      endAngleRad
    );
    const performanceColor = this.getPerformanceColor(
      gaugeData.value,
      gaugeData.lowThreshold,
      gaugeData.midThreshold
    );

    return (
      <svg width={width} height={height}>
        <g transform={`translate(${width / 2}, ${height / 2})`}>
          <GaugeBackground
            radius={radius}
            startAngle={startAngleRad}
            endAngle={endAngleRad}
            thickness={settings.thickness}
          />

          {settings.showRanges && (
            <GaugeRanges
              radius={radius}
              startAngle={startAngleRad}
              endAngle={endAngleRad}
              thickness={settings.thickness}
              lowThreshold={gaugeData.lowThreshold}
              midThreshold={gaugeData.midThreshold}
              lowColor={settings.lowColor}
              mediumColor={settings.mediumColor}
              highColor={settings.highColor}
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
