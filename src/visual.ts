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

import { VisualFormattingSettingsModel } from "./settings";
import Gauge from "./components/Gauge";
import { GaugeSettings, GaugeData, DataFormat } from "./components/types";

export class Visual implements IVisual {
  private target: HTMLElement;
  private reactRoot: any;
  private formattingSettings: VisualFormattingSettingsModel;
  private formattingSettingsService: FormattingSettingsService;

  constructor(options: VisualConstructorOptions) {
    this.formattingSettingsService = new FormattingSettingsService();
    this.target = options.element;
    this.reactRoot = createRoot(this.target);
  }

  public update(options: VisualUpdateOptions) {
    if (!options.dataViews || !options.dataViews[0]) {
      this.clear();
      return;
    }

    this.formattingSettings =
      this.formattingSettingsService.populateFormattingSettingsModel(
        VisualFormattingSettingsModel,
        options.dataViews[0]
      );

    const dataView: DataView = options.dataViews[0];
    const viewport: IViewport = options.viewport;
    const settings: GaugeSettings = this.extractSettings();
    const gaugeData: GaugeData = this.extractGaugeData(dataView, settings);

    this.reactRoot.render(
      React.createElement(Gauge, {
        viewport: viewport,
        settings: settings,
        gaugeData: gaugeData,
      })
    );
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
      maxValue: this.formattingSettings.gaugeCard.max.value,
      minValue: this.formattingSettings.gaugeCard.min.value
    };
  }

  private extractValue(categorical: any, roleName: string): number | null {
    if (categorical.values) {
      const valueItem = categorical.values.filter(
        (v: any) => v.source.roles[roleName]
      )[0];
      if (valueItem && valueItem.values[0] != null) {
        return typeof valueItem.values[0] === "number"
          ? valueItem.values[0]
          : parseFloat(valueItem.values[0].toString());
      }
    }

    if (categorical.categories) {
      const categoryItem = categorical.categories.filter(
        (c: any) => c.source.roles[roleName]
      )[0];
      if (categoryItem && categoryItem.values[0] != null) {
        const val = categoryItem.values[0];
        return typeof val === "number" ? val : parseFloat(val.toString());
      }
    }

    return null;
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
        const format = measureItem.source.format;
        dataFormat.isPercentage = format.includes("%");
        const decimalMatch = format.match(/\.([0#]+)/);
        if (decimalMatch) {
          dataFormat.decimalPlaces = decimalMatch[1].length;
        } else if (format) {
          dataFormat.decimalPlaces = 0;
        }
      }
    }

    return dataFormat;
  }

  private extractGaugeData(dataView: DataView, settings: GaugeSettings): GaugeData {
    let value = 0;
    let min = settings.startAngle;
    let max = settings.endAngle;
    let lowThreshold = undefined;
    let midThreshold = undefined;
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

      const lowThresholdVal = this.extractValue(categorical, "lowThreshold");
      if (lowThresholdVal !== null) lowThreshold = lowThresholdVal;

      const midThresholdVal = this.extractValue(categorical, "midThreshold");
      if (midThresholdVal !== null) midThreshold = midThresholdVal;
    } else if (dataView.single && dataView.single.value != null) {
      value =
        typeof dataView.single.value === "number"
          ? dataView.single.value
          : parseFloat(dataView.single.value.toString());
      hasValidData = true;
    }

    if (min >= max) {
      max = min + 100;
    }

    if (value < min) value = min;
    if (value > max) value = max;

    let dataFormat = this.extractDataFormat(dataView);

    if (dataFormat.decimalPlaces === null && max - min <= 1 && max - min > 0) {
      dataFormat.decimalPlaces = 2;
    }

    return {
      value,
      min,
      max,
      lowThreshold,
      midThreshold,
      hasValidData,
      dataFormat,
    };
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.formattingSettingsService.buildFormattingModel(
      this.formattingSettings
    );
  }

  clear() {
    this.reactRoot.render(
      React.createElement(Gauge, {
        viewport: { width: 0, height: 0 },
        settings: null,
        gaugeData: null,
      })
    );
  }
}
