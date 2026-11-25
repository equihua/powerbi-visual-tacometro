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
import { computeGaugeFrame, computeGaugeLayout, MARKER_OVERHANG } from "./layout";
import { TrendChartType, TrendSparkline } from "./TrendSparkline";
import { buildTrendDrawnShapes, computeInnerTrendBoxForChartType, YScaleMode } from "./trend";
import { fitTrendAngleAndScaleForShapes, TREND_SAFETY_CLEARANCE, TrendArcObstacle } from "./trendFit";
import { resolveTrendBoxFromPercentOverrides } from "./trendBoxPercent";
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
      settings.showValueLabel ? settings.fontSize : 0,
      settings.topMargin,
      settings.arcScale,
      settings.offsetY
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
    // 0.3.5.0: computeInnerTrendBox necesita el ancho real de la tarjeta (`width`, el mismo que recibe
    // computeGaugeFrame) para acotar el lado de la caja que el barrido del arco no alcanza.
    // 0.4.1.1 — fix QA rotación 30°/Barras (DICTAMEN-QA.md): para chartType "bars" delega en
    // `computeInnerTrendBoxForChartType` (trend.ts), que exige la holgura real de MEDIA BARRA (no sólo el
    // radio de un punto) frente al arco — sin ella, la propia esquina de la caja (pivote fijo de la
    // rotación, trendTransform.ts) puede quedar dentro de la corona y ninguna reducción de escala la
    // salva (ver JSDoc de esa función). Para cualquier otro chartType el resultado es IDÉNTICO al de
    // `computeInnerTrendBox` (regresión exacta).
    const autoTrendBox =
        trend && layout.footer
            ? computeInnerTrendBoxForChartType(
                  radius,
                  settings.thickness,
                  settings.startAngle,
                  settings.endAngle,
                  width,
                  settings.showRanges,
                  settings.trendChartType as TrendChartType | undefined,
                  trend.length
              )
            : null;
    // 0.4.1.0: la tarjeta «Gráfico de tendencia» puede sobreescribir posición/tamaño eje por eje, en %
    // (0..100) del viewport completo (pivote inferior-izquierdo, ver trendBoxPercent.ts) — ya NO son px
    // relativos al centro del medidor (0.4.0.0). Sin tocarla (los 4 undefined) el resultado sigue siendo
    // idéntico a `autoTrendBox` (misma referencia, ver resolveTrendBoxFromPercentOverrides).
    const trendBox = resolveTrendBoxFromPercentOverrides(
        autoTrendBox,
        {
            posX: settings.trendPosX,
            posY: settings.trendPosY,
            width: settings.trendWidth,
            height: settings.trendHeight,
        },
        { x: centerX, y: centerY },
        { width, height: viewportHeight }
    );

    // 0.4.1.1 — fix QA rotación 30°/Barras (DICTAMEN-QA.md): la homotecia automática anticolisión ya NO
    // prueba el rectángulo NOMINAL de la caja (insuficiente para "bars", cuyas barras extremas pueden
    // sobresalir en X — causa raíz del defecto QA) sino la geometría REAL que de verdad se dibuja
    // (`buildTrendDrawnShapes`, trend.ts: barras/área/línea+Programado ya engrosados por su medio grosor
    // de trazo, y puntos como círculos con su radio real) frente a los MISMOS 2 arcos que Gauge.tsx dibuja
    // de verdad: la banda (+ sobresaliente de marcadores) y, cuando «Mostrar Rangos» está activo con un
    // semáforo resuelto, también el anillo delgado del indicador (un sector anular distinto, de radio
    // menor — ver JSDoc de trendFit.ts). La posición/tamaño de la caja (trendBox, sin tocar) y el ángulo
    // (settings.trendAngle, sin tocar) siguen exactamente igual que antes; sólo se calcula la escala
    // máxima segura (<= 1). Con ángulo 0 la caja ya es segura por construcción (computeInnerTrendBox) y el
    // resultado es 1 (sin cambio, regresión visual exacta). Si ni TREND_MIN_SCALE libra los obstáculos,
    // fitTrendScaleForShapes lo reporta explícito (`fits: false`) y usa ese piso igualmente — no hay
    // recorte (clip-path) en ningún caso.
    // 0.4.1.1 — fix QA rotación 30°/Barras (DICTAMEN-QA.md), fix FINAL (autorizado por el usuario): la
    // homotecia de escala (fitTrendScaleForShapes) por sí sola no basta a ±30°/45°/90° — el piso
    // documentado TREND_MIN_SCALE (30%) agota la reducción posible sin lograr separar la geometría REAL
    // del arco (ver JSDoc de TREND_MAX_ANGLE_DEG, trendFit.ts). En vez de tolerar esa colisión o forzar
    // un recorte visual (clip-path), `fitTrendAngleAndScaleForShapes` también AJUSTA el ángulo:
    //  1. Lo recorta a ±TREND_MAX_ANGLE_DEG (mismo límite validado/mostrado por el panel, settings.ts, y
    //     saneado en tiempo de ejecución para cualquier valor fuera de rango que llegue sin pasar por el
    //     panel — bookmark/API, igual criterio que `finiteAngle` en visual.ts).
    //  2. Si ese ángulo (ya recortado) tampoco libra los obstáculos ni con TREND_MIN_SCALE — posible con
    //     posición/tamaño PERSONALIZADOS del panel (trendPosX/trendPosY/trendWidth/trendHeight), una caja
    //     que el límite global no contempla — busca de forma determinista, hacia 0°, el mayor ángulo
    //     (mismo signo) para el que sí exista una escala válida, sin mover X/Y ni el pivote. Si ni
    //     siquiera 0° cabe, se documenta explícito (`fits:false`) y se usa ese ángulo/escala igualmente.
    // `TREND_SAFETY_CLEARANCE` (0.5px) exige un margen mínimo de más frente al pie/arco — cubre el
    // redondeo de precisión del `matrix(...)` emitido sin enmascarar colisiones reales (ver su JSDoc).
    const trendBoxOrigin = trendBox ? { x: round2(centerX + trendBox.x), y: round2(centerY + trendBox.y) } : null;
    const trendShapes =
        trend && trendBox
            ? buildTrendDrawnShapes({
                  points: trend,
                  width: trendBox.width,
                  height: trendBox.height,
                  chartType: settings.trendChartType as TrendChartType | undefined,
                  currentIndex: gaugeData.trendCurrentIndex ?? -1,
                  yScaleMode: settings.trendYScaleMode as YScaleMode | undefined,
                  yMin: settings.trendYMin,
                  yMax: settings.trendYMax,
                  showProgrammed: settings.trendShowProgrammed,
                  lineWidth: settings.trendLineWidth,
                  pointSize: settings.trendPointSize,
              })
            : null;
    // La banda (siempre dibujada, GaugeBackground) y, si aplica, el anillo del semáforo (dibujado sólo
    // bajo la MISMA condición que lo renderiza más abajo: showRanges && semaphoreColor !== null) — nunca
    // un obstáculo "fantasma" que en realidad no se dibuja en este render.
    const trendArcObstacles: TrendArcObstacle[] = [
        {
            center: { x: centerX, y: centerY },
            innerRadius: bandRadii(radius, settings.thickness).innerRadius,
            outerRadius: bandRadii(radius, settings.thickness).outerRadius + MARKER_OVERHANG,
            startAngle: settings.startAngle,
            endAngle: settings.endAngle,
        },
        ...(settings.showRanges && semaphoreColor !== null
            ? [
                  {
                      center: { x: centerX, y: centerY },
                      innerRadius: indicatorRing.innerRadius,
                      outerRadius: indicatorRing.outerRadius,
                      startAngle: settings.startAngle,
                      endAngle: settings.endAngle,
                  },
              ]
            : []),
    ];
    const trendAngleFit =
        trend && trendBox && trendBoxOrigin && trendShapes
            ? fitTrendAngleAndScaleForShapes(trendBox.height, trendBoxOrigin, settings.trendAngle ?? 0, 1, trendShapes, {
                  viewportWidth: width,
                  viewportHeight,
                  footerTop: layout.footer ? layout.footer.y : undefined,
                  arc: trendArcObstacles,
                  clearance: TREND_SAFETY_CLEARANCE,
              })
            : null;
    const trendEffectiveAngle = trendAngleFit?.angle ?? 0;
    const trendScale = trendAngleFit?.scale ?? 1;

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
              chartType={settings.trendChartType as TrendChartType | undefined}
              angle={trendEffectiveAngle}
              scale={trendScale}
              yScaleMode={settings.trendYScaleMode as YScaleMode | undefined}
              yMin={settings.trendYMin}
              yMax={settings.trendYMax}
              showProgrammed={settings.trendShowProgrammed}
              useSemaphoreColors={settings.trendUseSemaphoreColors}
              fixedColor={settings.trendFixedColor}
              lineWidth={settings.trendLineWidth}
              pointSize={settings.trendPointSize}
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
