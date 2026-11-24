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
import { FOOTER_GAP } from "./components/layout";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/**
 * Gauge Formatting Card
 */
class GaugeCardSettings extends FormattingSettingsCard {

    // Valores del panel; un measure bindeado en el rol homónimo tiene prioridad.
    min = new formattingSettings.NumUpDown({
        name: "min",
        displayName: "Mínimo",
        value: 0
    });

    max = new formattingSettings.NumUpDown({
        name: "max",
        displayName: "Máximo",
        value: 100
    });

    target = new formattingSettings.NumUpDown({
        name: "target",
        displayName: "Objetivo",
        value: undefined
    });

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

    /**
     * 0.4.0.0 — aire real reservado arriba del vértice del arco, bajo la banda de título nativa de
     * Power BI (ver computeGaugeFrame en layout.ts). Por omisión FOOTER_GAP (4), el mismo valor fijo
     * que ya separa el contenido del pie por abajo: con este default el medidor queda simétrico
     * (margen superior == margen inferior) sin que el usuario tenga que calcularlo. 0 reproduce el
     * comportamiento de 0.3.5.0 (arco pegado al borde superior de su viewport).
     */
    topMargin = new formattingSettings.NumUpDown({
        name: "topMargin",
        displayName: "Margen Superior",
        value: FOOTER_GAP
    });

    /**
     * 0.4.0.0 — % del radio máximo seguro (ya calculado por computeGaugeFrame) que ocupa el arco; 100
     * no cambia nada (comportamiento 0.3.5.0), menos de 100 lo encoge desde ese máximo sin poder
     * introducir una colisión nueva (sólo añade holgura). Ver comentario de `arcScale` en layout.ts.
     */
    arcScale = new formattingSettings.NumUpDown({
        name: "arcScale",
        displayName: "Escala del Arco (%)",
        value: 100
    });

    /**
     * 0.4.0.0 — desplazamiento vertical (px) aplicado al centro del medidor después de todo lo demás.
     * A diferencia de `topMargin`/`arcScale`, un valor agresivo SÍ puede introducir solapes (con el
     * pie o la banda de título): queda a criterio de quien formatea el reporte. 0 reproduce 0.3.5.0.
     */
    offsetY = new formattingSettings.NumUpDown({
        name: "offsetY",
        displayName: "Desplazamiento Vertical (px)",
        value: 0
    });

    name: string = "gauge";
    displayName: string = "Configuración del Medidor";
    slices: Array<FormattingSettingsSlice> = [
        this.min,
        this.max,
        this.target,
        this.startAngle,
        this.endAngle,
        this.thickness,
        this.topMargin,
        this.arcScale,
        this.offsetY
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

    // B2: indicadores descendentes (p. ej. SAIDI, pérdidas): invierte la asignación de colores.
    lowerIsBetter = new formattingSettings.ToggleSwitch({
        name: "lowerIsBetter",
        displayName: "Menor es mejor",
        value: false
    });

    name: string = "ranges";
    displayName: string = "Rangos de Color";
    slices: Array<FormattingSettingsSlice> = [
        this.showRanges, 
        this.lowerIsBetter,
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
        value: { value: "#333333" }
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
 * 0.4.0.0 — tarjeta «Gráfico de tendencia»: tipo de gráfico, posición/tamaño, ángulo, escala Y,
 * mostrar/ocultar Programado, colores por semáforo o fijo, y grosor de línea/tamaño de punto para la
 * sparkline mensual (TrendSparkline.tsx). Todas las propiedades son opcionales y retrocompatibles: sin
 * tocar esta tarjeta el resultado es el comportamiento de 0.3.5.0 (chartType "lineDots", escala Y "auto",
 * Programado visible, colores por semáforo) salvo el nuevo margen del 10% de la escala "auto" — ver el
 * comentario de `computeTrendYDomain` en components/trend.ts para el criterio exacto, incluido el caso
 * de rango 0.
 */
class TrendCardSettings extends FormattingSettingsCard {
    chartType = new formattingSettings.ItemDropdown({
        name: "chartType",
        displayName: "Tipo de gráfico",
        items: [
            { displayName: "Línea con puntos", value: "lineDots" },
            { displayName: "Sólo línea", value: "line" },
            { displayName: "Barras", value: "bars" },
            { displayName: "Área", value: "area" },
        ],
        value: { displayName: "Línea con puntos", value: "lineDots" }
    });

    // Posición y tamaño: sin valor (por omisión) se usa la caja calculada automáticamente
    // (computeInnerTrendBox + applyTrendBoxOverrides, layout.ts); cada eje se sobreescribe por separado.
    posX = new formattingSettings.NumUpDown({
        name: "posX",
        displayName: "Posición X",
        value: undefined
    });

    posY = new formattingSettings.NumUpDown({
        name: "posY",
        displayName: "Posición Y",
        value: undefined
    });

    width = new formattingSettings.NumUpDown({
        name: "width",
        displayName: "Ancho",
        value: undefined
    });

    height = new formattingSettings.NumUpDown({
        name: "height",
        displayName: "Alto",
        value: undefined
    });

    angle = new formattingSettings.NumUpDown({
        name: "angle",
        displayName: "Ángulo (grados)",
        value: 0
    });

    yScaleMode = new formattingSettings.ItemDropdown({
        name: "yScaleMode",
        displayName: "Escala Y",
        items: [
            { displayName: "Automática al rango", value: "auto" },
            { displayName: "Desde cero", value: "zero" },
            { displayName: "Mín-máx manual", value: "manual" },
        ],
        value: { displayName: "Automática al rango", value: "auto" }
    });

    // Sólo tienen efecto con yScaleMode = "manual" (ver computeTrendYDomain en trend.ts).
    yMin = new formattingSettings.NumUpDown({
        name: "yMin",
        displayName: "Y Mínimo",
        value: undefined
    });

    yMax = new formattingSettings.NumUpDown({
        name: "yMax",
        displayName: "Y Máximo",
        value: undefined
    });

    showProgrammed = new formattingSettings.ToggleSwitch({
        name: "showProgrammed",
        displayName: "Mostrar Programado",
        value: true
    });

    useSemaphoreColors = new formattingSettings.ToggleSwitch({
        name: "useSemaphoreColors",
        displayName: "Colores por semáforo",
        value: true
    });

    // Sólo tiene efecto con useSemaphoreColors = false.
    fixedColor = new formattingSettings.ColorPicker({
        name: "fixedColor",
        displayName: "Color fijo",
        value: { value: "#4472C4" }
    });

    lineWidth = new formattingSettings.NumUpDown({
        name: "lineWidth",
        displayName: "Grosor de línea",
        value: 1.5
    });

    pointSize = new formattingSettings.NumUpDown({
        name: "pointSize",
        displayName: "Tamaño de punto",
        value: 2.5
    });

    name: string = "trend";
    displayName: string = "Gráfico de tendencia";
    slices: Array<FormattingSettingsSlice> = [
        this.chartType,
        this.posX,
        this.posY,
        this.width,
        this.height,
        this.angle,
        this.yScaleMode,
        this.yMin,
        this.yMax,
        this.showProgrammed,
        this.useSemaphoreColors,
        this.fixedColor,
        this.lineWidth,
        this.pointSize,
    ];
}

/** B3: colores de los marcadores adicionales (el objetivo original conserva su color fijo). */
class MarkersCardSettings extends FormattingSettingsCard {
    targetMarginColor = new formattingSettings.ColorPicker({
        name: "targetMarginColor",
        displayName: "Color Meta con margen",
        value: { value: "#605E5C" }
    });

    programmedColor = new formattingSettings.ColorPicker({
        name: "programmedColor",
        displayName: "Color Programado",
        value: { value: "#0078D4" }
    });

    previousMonthColor = new formattingSettings.ColorPicker({
        name: "previousMonthColor",
        displayName: "Color Real mes anterior",
        value: { value: "#8764B8" }
    });

    name: string = "markers";
    displayName: string = "Marcadores adicionales";
    slices: Array<FormattingSettingsSlice> = [
        this.targetMarginColor,
        this.programmedColor,
        this.previousMonthColor
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
    markersCard = new MarkersCardSettings();
    trendCard = new TrendCardSettings();

    cards = [this.gaugeCard, this.rangesCard, this.valueLabelCard, this.valueMarkerCard, this.markersCard, this.trendCard];
}

