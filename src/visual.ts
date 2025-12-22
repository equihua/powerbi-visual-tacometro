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
import { GaugeSettings } from "./components/types";

export class Visual implements IVisual {
    private target: HTMLElement;
    private reactRoot: any;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;

    constructor(options: VisualConstructorOptions) {
        console.log('Visual constructor', options);
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.reactRoot = createRoot(this.target);
    }

    public update(options: VisualUpdateOptions) {
        if (!options.dataViews || !options.dataViews[0]) {
            this.clear();
            return;
        }

        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel, 
            options.dataViews[0]
        );

        const dataView: DataView = options.dataViews[0];
        const viewport: IViewport = options.viewport;

        const settings: GaugeSettings = {
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
            displayUnits: Number(this.formattingSettings.valueLabelCard.displayUnits.value)
        };

        this.reactRoot.render(
            React.createElement(Gauge, { 
                dataView: dataView,
                viewport: viewport,
                settings: settings
            })
        );
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    clear() {
        this.reactRoot.render(
            React.createElement(Gauge, { 
                dataView: null,
                viewport: { width: 0, height: 0 },
                settings: null
            })
        );
    }
}
