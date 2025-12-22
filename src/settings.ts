/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/**
 * Gauge Formatting Card
 */
class GaugeCardSettings extends FormattingSettingsCard {

    startAngle = new formattingSettings.NumUpDown({
        name: "startAngle",
        displayName: "Ángulo Inicial (grados)",
        value: -120
    });

    endAngle = new formattingSettings.NumUpDown({
        name: "endAngle",
        displayName: "Ángulo Final (grados)",
        value: 60
    });

    thickness = new formattingSettings.NumUpDown({
        name: "thickness",
        displayName: "Grosor del Medidor",
        value: 20
    });

    name: string = "gauge";
    displayName: string = "Configuración del Medidor";
    slices: Array<FormattingSettingsSlice> = [
        this.startAngle,
        this.endAngle,
        this.thickness
    ];

}

class RangesCardSettings extends FormattingSettingsCard {
    

    lowColor = new formattingSettings.ColorPicker({
        name: "lowColor",
        displayName: "Color Bajo",
        value: { value: "#C00000" }
    });

    mediumColor = new formattingSettings.ColorPicker({
        name: "mediumColor",
        displayName: "Color Medio",
        value: { value: "#FFC000" }
    });

    highColor = new formattingSettings.ColorPicker({
        name: "highColor",
        displayName: "Color Alto",
        value: { value: "#007F38" }
    });

    showRanges = new formattingSettings.ToggleSwitch({
        name: "showRanges",
        displayName: "Mostrar Rangos",
        value: true
    });

    name: string = "ranges";
    displayName: string = "Rangos de Color";
    slices: Array<FormattingSettingsSlice> = [
        this.showRanges, 
        this.lowColor, 
        this.mediumColor, 
        this.highColor
    ];

}

class ValueLabelCardSettings extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Mostrar Valor",
        value: true
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Color",
        value: { value: "#777777" }
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Tamaño de Fuente",
        value: 50
    });

    fontFamily = new formattingSettings.FontPicker({
        name: "fontFamily",
        displayName: "Familia de Fuente",
        value: "wf_standard-font, helvetica, arial, sans-serif"
    });

    name: string = "valueLabel";
    displayName: string = "Etiqueta";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.color,
        this.fontSize,
        this.fontFamily
    ];
}

class ValueMarkerCardSettings extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Mostrar Marcador de Valor",
        value: true
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Color",
        value: { value: "#FFFFFF" }
    });

    size = new formattingSettings.NumUpDown({
        name: "size",
        displayName: "Tamaño",
        value: 5
    });

    style = new formattingSettings.ItemDropdown({
        name: "style",
        displayName: "Estilo",
        items: [
            { displayName: "Círculo", value: "circle" },
            { displayName: "Línea", value: "line" },
            { displayName: "Triángulo", value: "triangle" },
            { displayName: "Diamante", value: "diamond" }
        ],
        value: { displayName: "Triángulo", value: "triangle" }
    });

    name: string = "valueMarker";
    displayName: string = "Marcador de Valor";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.color,
        this.size,
        this.style
    ];
}

/**
* visual settings model class
*
*/

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    gaugeCard = new GaugeCardSettings();
    rangesCard = new RangesCardSettings();
    valueLabelCard = new ValueLabelCardSettings();
    valueMarkerCard = new ValueMarkerCardSettings();

    cards = [this.gaugeCard, this.rangesCard, this.valueLabelCard, this.valueMarkerCard];
}

