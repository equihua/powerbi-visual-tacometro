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
import { isFiniteNumber, resolveRange, resolveThresholds } from "./components/scales";
import { formatGaugeValue } from "./components/CenterText";
import { applyHighContrast } from "./highContrast";
import { buildTooltipItems, TooltipItem } from "./tooltips";

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
    this.tooltipExtras = this.extractTooltipExtras(dataView);

    this.reactRoot.render(
      React.createElement(Gauge, {
        viewport: viewport,
        settings: settings,
        gaugeData: gaugeData,
        onRendered,
      })
    );
  }

  /** A3 Allow Interactions: en hosts sin interacción (p. ej. mosaicos) no hay tooltip ni menú. */
  private interactionsAllowed(): boolean {
    return this.host.hostCapabilities?.allowInteractions !== false;
  }

  private registerInteractions() {
    const element = this.target;
    element.addEventListener("mousemove", (event: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      this.showTooltip([event.clientX - rect.left, event.clientY - rect.top]);
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

  private showTooltip(coordinates: number[]) {
    const tooltipService = this.host.tooltipService;
    if (!this.currentData || !this.interactionsAllowed() || !tooltipService.enabled()) {
      return;
    }
    tooltipService.show({
      dataItems: buildTooltipItems(this.currentData, this.tooltipExtras),
      identities: [],
      coordinates,
      isTouchEvent: false,
    });
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
  private extractTooltipExtras(dataView: DataView): TooltipItem[] {
    const columns = dataView.categorical?.values ?? [];
    return columns
      .filter((column) => column.source.roles?.["tooltips"] && column.values[0] != null)
      .map((column) => {
        const raw = column.values[0];
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
    };
  }

  private extractValue(categorical: any, roleName: string): number | null {
    if (categorical.values) {
      const valueItem = categorical.values.filter(
        (v: any) => v.source.roles[roleName]
      )[0];
      if (valueItem && valueItem.values[0] != null) {
        const val = typeof valueItem.values[0] === "number"
          ? valueItem.values[0]
          : parseFloat(valueItem.values[0].toString());
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
  private extractText(categorical: any, roleName: string): string | null {
    const columns = [...(categorical.values ?? []), ...(categorical.categories ?? [])];
    const column = columns.filter((c: any) => c.source.roles[roleName])[0];
    const raw = column ? column.values[0] : null;
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

    if (dataView.categorical) {
      const categorical = dataView.categorical;

      const measureVal = this.extractValue(categorical, "measure");
      if (measureVal !== null) {
        value = measureVal;
        hasValidData = true;
      }

      const minVal = this.extractValue(categorical, "min");
      if (minVal !== null) min = minVal;

      const maxVal = this.extractValue(categorical, "max");
      if (maxVal !== null) max = maxVal;

      const targetVal = this.extractValue(categorical, "target");
      if (targetVal !== null) target = targetVal;

      lowThreshold = this.extractValue(categorical, "lowThreshold");
      midThreshold = this.extractValue(categorical, "midThreshold");
      semaphore = this.extractText(categorical, "semaphore");
      targetWithMargin = this.extractValue(categorical, "targetWithMargin") ?? undefined;
      programmed = this.extractValue(categorical, "programmed") ?? undefined;
      previousMonth = this.extractValue(categorical, "previousMonth") ?? undefined;
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
    };
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.formattingSettingsService.buildFormattingModel(
      this.formattingSettings
    );
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
