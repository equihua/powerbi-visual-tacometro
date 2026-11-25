"use strict";
import * as React from "react";
import { createRoot } from "react-dom/client";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import DataView = powerbi.DataView;
import IViewport = powerbi.IViewport;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;

import { VisualFormattingSettingsModel } from "./settings";
import Gauge from "./components/Gauge";
import { GaugeSettings, GaugeData, DataFormat } from "./components/types";
import {
  computeEffectivePointSize, computeTrendYDomain, findCurrentPosition, lastIndexWithReal, orderPeriodRows, periodSortKey, TrendPoint,
} from "./components/trend";
import { isFiniteNumber, resolveRange, resolveThresholds } from "./components/scales";
import { formatGaugeValue } from "./components/CenterText";
import { applyHighContrast } from "./highContrast";
import { buildTrendPointTooltipItems, TooltipItem } from "./tooltips";
import { computeGaugeGeometry } from "./components/layout";
import { boxToPercent, PercentBox } from "./components/trendBoxPercent";

/** Redondeo a centésimas para los valores efectivos que se muestran en el panel de formato. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * B4 — `posXPct`/`posYPct`/`widthPct`/`heightPct` (tarjeta «Gráfico de tendencia») declaran 0-100 en
 * capabilities.json/settings.ts (`NumUpDownFormat.options`), pero ese límite sólo lo hace cumplir la UI
 * del panel de formato: un valor fuera de [0,100] o no finito (NaN/Infinity) puede llegar igual al
 * dataView si se escribió fuera del panel (bookmark, API, reporte editado a mano/corrupto —
 * `setPropertiesValues` en FormattingSettingsComponents.js copia el valor crudo sin validar). Fuera de
 * ese rango (o no finito) se trata igual que "sin valor": undefined, cae al cálculo automático de ESE
 * eje — nunca se deja pasar un % inválido a `resolveTrendBoxFromPercentOverrides`/`percentToBox`.
 */
function finitePercent(value: number | undefined): number | undefined {
  return isFiniteNumber(value) && value >= 0 && value <= 100 ? value : undefined;
}

/**
 * B4 — `angle` (tarjeta «Gráfico de tendencia») no tiene límites 0-100 (es una rotación en grados, sin
 * tope), pero sí debe ser siempre un número finito: un NaN/Infinity llegado por la misma vía que
 * `finitePercent` documenta (fuera del panel) rompería `trendTransformCoefficients`
 * (Math.cos/Math.sin de un ángulo no finito es NaN, propagándose a toda la matriz del SVG). Fuera de
 * ese caso cae a 0° (horizontal, sin rotación — la matriz identidad, ver trendTransformAttribute).
 */
function finiteAngle(value: number | undefined): number {
  return isFiniteNumber(value) ? value : 0;
}

/**
 * 0.4.1.0 — insumos (calculados en el último `render()`) para mostrar, en `getFormattingModel()`, el
 * valor EFECTIVO (nunca en blanco) de las propiedades "auto" de la tarjeta «Gráfico de tendencia»
 * (posX/posY/width/height en %, yMin/yMax, pointSize) cuando el panel no las ha tocado. Ver
 * `applyEffectiveDisplayDefaults`.
 */
interface TrendDisplayDefaults {
  /** Valores Real + Programado de toda la serie mensual (o [] sin serie); para el dominio Y automático. */
  trendValues: number[];
  /** Caja automática (computeInnerTrendBox) del ÚLTIMO render, en % del viewport; null sin caja que mostrar. */
  autoBoxPercent: PercentBox | null;
}

/** uid (objectName-propertyName, ver FormattingSettingsService) de las 7 propiedades "auto" de la tarjeta «Gráfico de tendencia». */
const TREND_AUTO_SLICE_UIDS = [
  "trend-posXPct", "trend-posYPct", "trend-widthPct", "trend-heightPct", "trend-yMin", "trend-yMax", "trend-pointSize",
] as const;
type TrendAutoSliceUid = typeof TREND_AUTO_SLICE_UIDS[number];

/**
 * 0.4.1.0 — rellena, SOLO en el `FormattingModel` ya construido por `buildFormattingModel` (nunca en
 * `this.formattingSettings`: así no se escribe ningún override real en el documento, ni se altera
 * `extractSettings()` del siguiente render — `getRevertToDefaultDescriptor` tampoco depende de este
 * valor, ver FormattingSettingsService.js), el valor EFECTIVO de las 7 propiedades "auto" de la
 * tarjeta «Gráfico de tendencia» cuando el panel las deja sin tocar (slice NumUpDown sin
 * `control.properties.value`):
 *  - posXPct/posYPct/widthPct/heightPct: la caja automática del ÚLTIMO render convertida a %
 *    (`defaults.autoBoxPercent`, boxToPercent/computeDisplayDefaults). Sin caja que mostrar (null: sin
 *    serie, sin pie o no cabe) las 4 quedan en blanco — no hay nada razonable que ofrecer.
 *  - yMin/yMax: dominio AUTOMÁTICO (computeTrendYDomain en modo "auto" sobre Real+Programado completos,
 *    el mismo criterio documentado en el `description` de esas 2 propiedades en settings.ts),
 *    INDEPENDIENTE de la «Escala Y» (yScaleMode) seleccionada en el panel.
 *  - pointSize: proporcional al grosor de línea configurado (computeEffectivePointSize), igual fallback
 *    que ya usa `extractSettings()` para el valor REAL del medidor.
 */
function applyEffectiveDisplayDefaults(
  model: powerbi.visuals.FormattingModel,
  defaults: TrendDisplayDefaults | null,
  lineWidth: number | undefined
): void {
  const box = defaults?.autoBoxPercent ?? null;
  const [yMin, yMax] = computeTrendYDomain(defaults?.trendValues ?? [], "auto");
  const effective: Record<TrendAutoSliceUid, number | undefined> = {
    "trend-posXPct": box ? round2(box.posX) : undefined,
    "trend-posYPct": box ? round2(box.posY) : undefined,
    "trend-widthPct": box ? round2(box.width) : undefined,
    "trend-heightPct": box ? round2(box.height) : undefined,
    "trend-yMin": round2(yMin),
    "trend-yMax": round2(yMax),
    "trend-pointSize": isFiniteNumber(lineWidth) ? computeEffectivePointSize(lineWidth) : undefined,
  };
  const trendCard = model.cards.find(
    (card): card is powerbi.visuals.FormattingCard => "uid" in card && card.uid === "trend-card"
  );
  trendCard?.groups?.forEach((group) => {
    // Defensivo: TrendCardSettings es un SimpleCard con slices, buildFormattingModel SIEMPRE le da
    // `groups: [{ slices: [...] }]` (ver FormattingSettingsService.js); un FormattingGroupPlaceholder
    // (sin `slices`) es estructuralmente inalcanzable para esta tarjeta.
    /* v8 ignore next 3 */
    if (!("slices" in group)) {
      return;
    }
    group.slices?.forEach((slice) => {
      if (!("control" in slice) || slice.control.type !== "NumUpDown") {
        return;
      }
      const uid = slice.uid as TrendAutoSliceUid;
      const value = effective[uid];
      if (value !== undefined && slice.control.properties.value === undefined) {
        slice.control.properties.value = value;
      }
    });
  });
}

export class Visual implements IVisual {
  private target: HTMLElement;
  private reactRoot: any;
  private formattingSettings: VisualFormattingSettingsModel;
  private formattingSettingsService: FormattingSettingsService;
  private host: IVisualHost;
  private selectionManager: ISelectionManager;
  /** Último GaugeData con datos válidos (para tooltips); null si no hay. */
  private currentData: GaugeData | null = null;
  private tooltipExtras: TooltipItem[] = [];
  /** Fila del DataView que muestra el medidor (0 sin periodo; -1 si el periodo actual no existe). */
  private currentRow = 0;
  /** 0.4.1.0: insumos del último render() para mostrar defaults efectivos en getFormattingModel(). */
  private displayDefaults: TrendDisplayDefaults | null = null;

  constructor(options: VisualConstructorOptions) {
    this.formattingSettingsService = new FormattingSettingsService();
    this.target = options.element;
    this.host = options.host;
    this.selectionManager = this.host.createSelectionManager();
    this.reactRoot = createRoot(this.target);
    this.registerInteractions();
  }

  public update(options: VisualUpdateOptions) {
    // A3 Rendering Events: started → finished (al confirmar <Gauge>) | failed.
    const events = this.host.eventService;
    events.renderingStarted(options);
    try {
      this.render(options, () => events.renderingFinished(options));
    } catch (error) {
      events.renderingFailed(options, error instanceof Error ? error.message : String(error));
    }
  }

  private render(options: VisualUpdateOptions, onRendered: () => void) {
    if (!options.dataViews || !options.dataViews[0]) {
      this.currentData = null;
      this.clear(onRendered);
      return;
    }

    this.formattingSettings =
      this.formattingSettingsService.populateFormattingSettingsModel(
        VisualFormattingSettingsModel,
        options.dataViews[0]
      );

    const dataView: DataView = options.dataViews[0];
    const viewport: IViewport = options.viewport;
    const settings: GaugeSettings = applyHighContrast(this.extractSettings(), this.host.colorPalette);
    const gaugeData: GaugeData = this.extractGaugeData(dataView);
    this.currentData = gaugeData.hasValidData ? gaugeData : null;
    this.tooltipExtras = this.extractTooltipExtras(dataView, this.currentRow);
    this.displayDefaults = this.computeDisplayDefaults(settings, gaugeData, viewport);

    this.reactRoot.render(
      React.createElement(Gauge, {
        viewport: viewport,
        settings: settings,
        gaugeData: gaugeData,
        onRendered,
      })
    );
  }

  /**
   * 0.4.1.0 — reproduce, con `computeGaugeGeometry` (misma fuente que Gauge.tsx, ver layout.ts), la
   * caja automática de la sparkline del render actual, convertida a % del viewport (trendBoxPercent.ts),
   * y la serie Real+Programado completa; insumos de `applyEffectiveDisplayDefaults` (getFormattingModel).
   */
  private computeDisplayDefaults(settings: GaugeSettings, gaugeData: GaugeData, viewport: IViewport): TrendDisplayDefaults {
    const hasFooter = gaugeData.trend !== undefined && gaugeData.trend.length >= 2;
    const geometry = computeGaugeGeometry({
      width: viewport.width,
      viewportHeight: viewport.height,
      thickness: settings.thickness,
      startAngle: settings.startAngle,
      endAngle: settings.endAngle,
      topMargin: settings.topMargin,
      arcScale: settings.arcScale,
      offsetY: settings.offsetY,
      centerTextHeight: settings.showValueLabel ? settings.fontSize : 0,
      showRanges: settings.showRanges,
      hasFooter,
    });
    const autoBoxPercent = geometry.autoTrendBox
      ? boxToPercent(geometry.autoTrendBox, { x: geometry.frame.cx, y: geometry.frame.cy }, { width: viewport.width, height: viewport.height })
      : null;
    const trendValues = (gaugeData.trend ?? []).flatMap((point) => [point.real, point.programmed]).filter(isFiniteNumber);
    return { trendValues, autoBoxPercent };
  }

  /** A3 Allow Interactions: en hosts sin interacción (p. ej. mosaicos) no hay tooltip ni menú. */
  private interactionsAllowed(): boolean {
    return this.host.hostCapabilities?.allowInteractions !== false;
  }

  private registerInteractions() {
    const element = this.target;
    element.addEventListener("mousemove", (event: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      this.showTooltip([event.clientX - rect.left, event.clientY - rect.top], event.target);
    });
    element.addEventListener("mouseleave", () => this.hideTooltip());
    // A3 Keyboard Navigation: foco → tooltip en el centro; Shift+F10 / ContextMenu → menú.
    element.addEventListener("focusin", () => {
      const rect = element.getBoundingClientRect();
      this.showTooltip([rect.width / 2, rect.height / 2]);
    });
    element.addEventListener("focusout", () => this.hideTooltip());
    element.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
        const rect = element.getBoundingClientRect();
        this.showContextMenu(event, rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    });
    // A3 Context Menu: menú contextual del visual completo (no hay puntos de datos seleccionables).
    element.addEventListener("contextmenu", (event: MouseEvent) => {
      this.showContextMenu(event, event.clientX, event.clientY);
    });
  }

  /**
   * 0.3.4.0: se elimina la tooltip nativa oscura del medidor completo (decisión de producto; coexistía
   * con 3 tooltips distintas). Sólo queda la tooltip clara por punto de la sparkline mensual
   * (trendPointTooltip, arreglada en 0.3.2.1). Sin un punto bajo el cursor/foco no se llama al
   * tooltip service: no hay nada que mostrar. El selectionManager y el formato condicional no
   * dependen de esta llamada (identities siempre fue [], no hay selección de puntos de datos).
   */
  private showTooltip(coordinates: number[], target?: EventTarget | null) {
    const tooltipService = this.host.tooltipService;
    if (!this.currentData || !this.interactionsAllowed() || !tooltipService.enabled()) {
      return;
    }
    const dataItems = this.trendPointTooltip(target);
    if (!dataItems) {
      return;
    }
    tooltipService.show({
      dataItems,
      identities: [],
      coordinates,
      isTouchEvent: false,
    });
  }

  /**
   * 0.3.2.1: sobre un punto de la sparkline (atributo data-trend-index de TrendSparkline) el tooltip es el
   * de ESE periodo; antes todo mousemove mostraba el del mes actual del medidor. null fuera de los puntos.
   */
  private trendPointTooltip(target?: EventTarget | null): TooltipItem[] | null {
    // Destinos sin DOM (foco, nodos de texto) no tienen closest(): tooltip del medidor.
    const node = (target as Element | undefined)?.closest?.("[data-trend-index]");
    const point = node ? this.currentData!.trend?.[Number(node.getAttribute("data-trend-index"))] : undefined;
    if (!point) {
      return null;
    }
    return buildTrendPointTooltipItems(point, (value) => formatGaugeValue(value, this.currentData!.dataFormat));
  }

  private hideTooltip() {
    this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
  }

  private showContextMenu(event: Event, x: number, y: number) {
    if (!this.interactionsAllowed()) {
      return;
    }
    event.preventDefault();
    this.selectionManager.showContextMenu({} as ISelectionId, { x, y });
  }

  /** Campos del rol "tooltips": se muestran tal cual (texto) o con el formato del measure (número). */
  private extractTooltipExtras(dataView: DataView, index: number): TooltipItem[] {
    const columns = dataView.categorical?.values ?? [];
    return columns
      .filter((column) => column.source.roles?.["tooltips"] && column.values[index] != null)
      .map((column) => {
        const raw = column.values[index];
        const value =
          typeof raw === "number"
            ? formatGaugeValue(raw, this.parseFormat(column.source.format))
            : String(raw);
        return { displayName: column.source.displayName, value };
      });
  }

  private extractSettings(): GaugeSettings {
    return {
      thickness: this.formattingSettings.gaugeCard.thickness.value,
      startAngle: this.formattingSettings.gaugeCard.startAngle.value,
      endAngle: this.formattingSettings.gaugeCard.endAngle.value,
      topMargin: this.formattingSettings.gaugeCard.topMargin.value,
      arcScale: this.formattingSettings.gaugeCard.arcScale.value,
      offsetY: this.formattingSettings.gaugeCard.offsetY.value,
      showRanges: this.formattingSettings.rangesCard.showRanges.value,
      lowColor: this.formattingSettings.rangesCard.lowColor.value.value,
      mediumColor: this.formattingSettings.rangesCard.mediumColor.value.value,
      highColor: this.formattingSettings.rangesCard.highColor.value.value,
      showValueMarker: this.formattingSettings.valueMarkerCard.show.value,
      markerSize: this.formattingSettings.valueMarkerCard.size.value,
      markerColor: this.formattingSettings.valueMarkerCard.color.value.value,
      markerStyle: this.formattingSettings.valueMarkerCard.style.value.value,
      showValueLabel: this.formattingSettings.valueLabelCard.show.value,
      fontSize: this.formattingSettings.valueLabelCard.fontSize.value,
      fontFamily: this.formattingSettings.valueLabelCard.fontFamily.value,
      labelColor: this.formattingSettings.valueLabelCard.color.value.value,
      lowerIsBetter: this.formattingSettings.rangesCard.lowerIsBetter.value,
      targetMarginColor: this.formattingSettings.markersCard.targetMarginColor.value.value,
      programmedColor: this.formattingSettings.markersCard.programmedColor.value.value,
      previousMonthColor: this.formattingSettings.markersCard.previousMonthColor.value.value,
      trendChartType: this.formattingSettings.trendCard.chartType.value.value as string,
      trendPosX: finitePercent(this.formattingSettings.trendCard.posXPct.value),
      trendPosY: finitePercent(this.formattingSettings.trendCard.posYPct.value),
      trendWidth: finitePercent(this.formattingSettings.trendCard.widthPct.value),
      trendHeight: finitePercent(this.formattingSettings.trendCard.heightPct.value),
      trendAngle: finiteAngle(this.formattingSettings.trendCard.angle.value),
      trendYScaleMode: this.formattingSettings.trendCard.yScaleMode.value.value as string,
      trendYMin: isFiniteNumber(this.formattingSettings.trendCard.yMin.value) ? this.formattingSettings.trendCard.yMin.value : undefined,
      trendYMax: isFiniteNumber(this.formattingSettings.trendCard.yMax.value) ? this.formattingSettings.trendCard.yMax.value : undefined,
      trendShowProgrammed: this.formattingSettings.trendCard.showProgrammed.value,
      trendUseSemaphoreColors: this.formattingSettings.trendCard.useSemaphoreColors.value,
      trendFixedColor: this.formattingSettings.trendCard.fixedColor.value.value,
      trendLineWidth: this.formattingSettings.trendCard.lineWidth.value,
      trendPointSize: isFiniteNumber(this.formattingSettings.trendCard.pointSize.value)
        ? this.formattingSettings.trendCard.pointSize.value
        : computeEffectivePointSize(this.formattingSettings.trendCard.lineWidth.value),
    };
  }

  /** `index`: fila del periodo (0 sin rol «period», que es el único valor agregado). */
  private extractValue(categorical: any, roleName: string, index = 0): number | null {
    if (categorical.values) {
      const valueItem = categorical.values.filter(
        (v: any) => v.source.roles[roleName]
      )[0];
      if (valueItem && valueItem.values[index] != null) {
        const val = typeof valueItem.values[index] === "number"
          ? valueItem.values[index]
          : parseFloat(valueItem.values[index].toString());
        return isFiniteNumber(val) ? val : null;
      }
    }

    if (categorical.categories) {
      const categoryItem = categorical.categories.filter(
        (c: any) => c.source.roles[roleName]
      )[0];
      if (categoryItem && categoryItem.values[0] != null) {
        const raw = categoryItem.values[0];
        const val = typeof raw === "number" ? raw : parseFloat(raw.toString());
        return isFiniteNumber(val) ? val : null;
      }
    }

    return null;
  }

  /** Primer valor de texto del rol (p. ej. semáforo); null si no hay o no es texto. */
  private extractText(categorical: any, roleName: string, index = 0): string | null {
    const columns = [...(categorical.values ?? []), ...(categorical.categories ?? [])];
    const column = columns.filter((c: any) => c.source.roles[roleName])[0];
    const raw = column ? column.values[index] : null;
    return typeof raw === "string" ? raw : null;
  }

  /** Decimales y porcentaje a partir de la cadena de formato de Power BI. */
  private parseFormat(format: string | undefined): DataFormat {
    if (!format) {
      return { decimalPlaces: null, isPercentage: false };
    }
    const decimalMatch = format.match(/\.([0#]+)/);
    return {
      isPercentage: format.includes("%"),
      decimalPlaces: decimalMatch ? decimalMatch[1].length : 0,
    };
  }

  private extractDataFormat(dataView: DataView): DataFormat {
    let dataFormat: DataFormat = {
      decimalPlaces: null,
      isPercentage: false,
    };

    if (dataView.categorical && dataView.categorical.values) {
      const measureItem = dataView.categorical.values.filter(
        (v: any) => v.source.roles["measure"]
      )[0];
      if (measureItem && measureItem.source.format) {
        dataFormat = this.parseFormat(measureItem.source.format);
      }
    }

    return dataFormat;
  }

  private extractGaugeData(dataView: DataView): GaugeData {
    // Prioridad: measure bindeado > valor del panel de formato > default (0 / 100 / sin objetivo).
    const gaugeCard = this.formattingSettings.gaugeCard;
    let value = 0;
    let min = isFiniteNumber(gaugeCard.min.value) ? gaugeCard.min.value : 0;
    let max = isFiniteNumber(gaugeCard.max.value) ? gaugeCard.max.value : 100;
    let target: number | undefined = isFiniteNumber(gaugeCard.target.value)
      ? gaugeCard.target.value
      : undefined;
    let lowThreshold: number | null = null;
    let midThreshold: number | null = null;
    let semaphore: string | null = null;
    let targetWithMargin: number | undefined;
    let programmed: number | undefined;
    let previousMonth: number | undefined;
    let hasValidData = false;
    let trend: TrendPoint[] | undefined;
    let trendCurrentIndex: number | undefined;
    this.currentRow = 0;

    if (dataView.categorical) {
      const categorical = dataView.categorical;
      // 0.3.0.0: con «Periodo (mes)» / «Orden del periodo» cada medida trae una fila por periodo y
      // el medidor lee la fila del periodo actual (ver selectTrend). Sin categorías sólo hay la fila 0
      // (comportamiento 0.2.0.0).
      let i = 0;
      const selection = this.selectTrend(categorical);
      if (selection) {
        trend = selection.trend;
        trendCurrentIndex = selection.currentPosition >= 0 ? selection.currentPosition : undefined;
        i = selection.currentRow;
      }

      const measureVal = this.extractValue(categorical, "measure", i);
      if (measureVal !== null) {
        value = measureVal;
        hasValidData = true;
      }

      const minVal = this.extractValue(categorical, "min", i);
      if (minVal !== null) min = minVal;

      const maxVal = this.extractValue(categorical, "max", i);
      if (maxVal !== null) max = maxVal;

      const targetVal = this.extractValue(categorical, "target", i);
      if (targetVal !== null) target = targetVal;

      this.currentRow = i;
      lowThreshold = this.extractValue(categorical, "lowThreshold", i);
      midThreshold = this.extractValue(categorical, "midThreshold", i);
      semaphore = this.extractText(categorical, "semaphore", i);
      targetWithMargin = this.extractValue(categorical, "targetWithMargin", i) ?? undefined;
      programmed = this.extractValue(categorical, "programmed", i) ?? undefined;
      previousMonth = this.extractValue(categorical, "previousMonth", i) ?? undefined;
    } else if (dataView.single && dataView.single.value != null) {
      value =
        typeof dataView.single.value === "number"
          ? dataView.single.value
          : parseFloat(dataView.single.value.toString());
      hasValidData = isFiniteNumber(value);
      value = isFiniteNumber(value) ? value : 0;
    }

    ({ min, max } = resolveRange(min, max));
    const thresholds = resolveThresholds({ min, max }, lowThreshold, midThreshold);

    const actualValue = value;
    if (value < min) value = min;
    if (value > max) value = max;

    let dataFormat = this.extractDataFormat(dataView);

    if (dataFormat.decimalPlaces === null && max - min <= 1 && max - min > 0) {
      dataFormat.decimalPlaces = 2;
    }

    return {
      value,
      actualValue,
      min,
      max,
      lowThreshold: thresholds.lowThreshold,
      midThreshold: thresholds.midThreshold,
      target,
      targetWithMargin,
      programmed,
      previousMonth,
      hasValidData,
      dataFormat,
      semaphore,
      ...(trend ? { trend, trendCurrentIndex } : {}),
    };
  }

  /**
   * Serie por periodo en orden cronológico determinista y fila del periodo actual.
   * - Orden: con «Orden del periodo» (número/fecha) se ordena por esa clave; sin ella se respeta el orden
   *   del host, que capabilities fija con `sorting.implicit` ascendente por «Periodo (mes)» (y Power BI
   *   aplica la columna «Ordenar por columna» del modelo, p. ej. POA_Mes[Abrev] → POA_Mes[Mes]).
   *   Nunca se infiere el orden de los nombres de mes.
   * - Periodo actual: con «Periodo actual» es el periodo cuya clave (o etiqueta, sin clave) coincide; si
   *   ninguno coincide no hay fila actual (-1). Sin ese rol, el último periodo con Real (o el último).
   */
  private selectTrend(categorical: any): { trend: TrendPoint[]; currentPosition: number; currentRow: number } | null {
    const categories: any[] = categorical.categories ?? [];
    const period = categories.filter((c: any) => c.source.roles?.["period"])[0];
    const order = categories.filter((c: any) => c.source.roles?.["periodOrder"])[0];
    const labels = period ?? order;
    if (!labels || labels.values.length === 0) {
      return null;
    }

    const rowCount: number = labels.values.length;
    const keys = order ? order.values.map((value: unknown) => periodSortKey(value)) : null;
    const rows = keys ? orderPeriodRows(keys) : Array.from({ length: rowCount }, (_, row) => row);
    const trend = rows.map((row) => this.extractTrendPoint(categorical, labels.values[row], row));

    const current = this.firstValue(categorical, "currentPeriod");
    let currentPosition: number;
    if (current !== null) {
      const periods = rows.map((row, position) => ({ key: keys ? keys[row] : null, label: trend[position].label }));
      currentPosition = findCurrentPosition(current, periods, keys !== null);
    } else {
      const lastWithReal = lastIndexWithReal(trend);
      currentPosition = lastWithReal >= 0 ? lastWithReal : trend.length - 1;
    }
    return { trend, currentPosition, currentRow: currentPosition >= 0 ? rows[currentPosition] : -1 };
  }

  /**
   * Punto de un periodo con datos de SU fila: Real, Programado, semáforo («Semáforo por periodo»; si
   * está vacío, el semáforo del medidor en ese periodo) y umbrales resueltos con el rango de esa fila.
   */
  private extractTrendPoint(categorical: any, label: powerbi.PrimitiveValue, row: number): TrendPoint {
    const gaugeCard = this.formattingSettings.gaugeCard;
    const range = resolveRange(
      this.extractValue(categorical, "min", row) ?? (isFiniteNumber(gaugeCard.min.value) ? gaugeCard.min.value : 0),
      this.extractValue(categorical, "max", row) ?? (isFiniteNumber(gaugeCard.max.value) ? gaugeCard.max.value : 100)
    );
    const thresholds = resolveThresholds(
      range,
      this.extractValue(categorical, "lowThreshold", row),
      this.extractValue(categorical, "midThreshold", row)
    );
    return {
      label: label == null ? "" : String(label),
      real: this.extractValue(categorical, "measure", row),
      programmed: this.extractValue(categorical, "programmed", row),
      semaphore: this.extractText(categorical, "trendSemaphore", row) ?? this.extractText(categorical, "semaphore", row),
      thresholds: { lowThreshold: thresholds.lowThreshold, midThreshold: thresholds.midThreshold },
    };
  }

  /** Primer valor no vacío de una columna de valores del rol (p. ej. «Periodo actual», constante por fila). */
  private firstValue(categorical: any, roleName: string): powerbi.PrimitiveValue | null {
    const column = (categorical.values ?? []).filter((v: any) => v.source.roles?.[roleName])[0];
    const value = column ? column.values.find((cell: powerbi.PrimitiveValue) => cell != null && cell !== "") : undefined;
    return value ?? null;
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    const model = this.formattingSettingsService.buildFormattingModel(
      this.formattingSettings
    );
    applyEffectiveDisplayDefaults(model, this.displayDefaults, this.formattingSettings?.trendCard.lineWidth.value);
    return model;
  }

  clear(onRendered?: () => void) {
    this.reactRoot.render(
      React.createElement(Gauge, {
        viewport: { width: 0, height: 0 },
        settings: null,
        gaugeData: null,
        onRendered,
      })
    );
  }
}
