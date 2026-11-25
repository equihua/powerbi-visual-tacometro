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
import powerbi from "powerbi-visuals-api";
import { TREND_MAX_ANGLE_DEG } from "./components/trendFit";
import { FOOTER_GAP } from "./components/layout";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/**
 * 0.4.1.0 — límites 0..100 y sufijo "%" para posX/posY/width/height de la tarjeta «Gráfico de
 * tendencia» (ver TrendCardSettings.posX/posY/width/height): «type» usa el literal numérico del
 * validador (0 = Min, 1 = Max, powerbi.visuals.ValidatorType) en vez de importar el const enum como
 * VALOR — los enums numéricos de TypeScript son asignables desde un literal plano sin cast, y así se
 * evita cualquier riesgo de que un bundler basado en esbuild (Vitest/Vite) no inline un const enum
 * importado desde una dependencia externa (powerbi-visuals-api).
 */
const PERCENT_BOUNDS: powerbi.visuals.NumUpDownFormat = {
    unitSymbol: "%",
    minValue: { type: 0, value: 0 },
    maxValue: { type: 1, value: 100 },
};

/**
 * 0.4.1.1 — límites ±TREND_MAX_ANGLE_DEG para `angle` (tarjeta «Gráfico de tendencia»): el usuario
 * autorizó LIMITAR el ángulo cuando la homotecia automática anticolisión (fitTrendScaleForShapes,
 * trendFit.ts) no basta para separar la serie del arco incluso en TREND_MIN_SCALE — ver el JSDoc de
 * `TREND_MAX_ANGLE_DEG` para la evidencia empírica (barrido de las 16 combinaciones de tamaño/chartType/
 * Programado) que determinó este valor concreto (8, no un redondeo de la estimación inicial ~15).
 * Mismo criterio que PERCENT_BOUNDS: esta validación sólo la hace cumplir la UI del panel; un valor fuera
 * de rango que llegue sin pasar por el panel (bookmark/API) se sanea en tiempo de ejecución
 * (`clampTrendAngle`, aplicado dentro de `fitTrendAngleAndScaleForShapes`/Gauge.tsx — nunca se propaga un
 * ángulo fuera de ±A al render final).
 */
const ANGLE_BOUNDS: powerbi.visuals.NumUpDownFormat = {
    minValue: { type: 0, value: -TREND_MAX_ANGLE_DEG },
    maxValue: { type: 1, value: TREND_MAX_ANGLE_DEG },
};

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
    // (computeInnerTrendBox + resolveTrendBoxFromPercentOverrides, layout.ts/trendBoxPercent.ts); cada
    // eje se sobreescribe por separado.
    //
    // 0.4.1.0 — posXPct/posYPct/widthPct/heightPct son % (0..100) del VIEWPORT completo de la tarjeta
    // (no px relativos al centro del medidor, como `posX`/`posY`/`width`/`height` en 0.4.0.0):
    // `posXPct`/`posYPct` ubican el PIVOTE inferior-izquierdo de la caja (el punto que un ángulo o una
    // escala distintos de los valores por omisión NUNCA mueven, ver trendTransform.ts), medido desde el
    // borde IZQUIERDO (X) y SUPERIOR (Y) del viewport. `widthPct`/`heightPct` son % del ancho/alto del
    // viewport.
    //
    // REVISIÓN B2 — por qué NO se reutilizan los nombres `posX`/`posY`/`width`/`height` de 0.4.0.0: esas
    // 4 propiedades eran px relativos al centro del medidor; reutilizar el mismo nombre de propiedad con
    // un significado distinto (%) haría que Power BI reinterprete SILENCIOSAMENTE, en cualquier reporte
    // guardado con 0.4.0.0, un valor en px como si fuera un % (p. ej. 60 px pasaría a leerse como 60%) —
    // sin ningún aviso ni fallo visible, sólo un medidor mal posicionado. Las 4 propiedades nuevas usan
    // nombre distinto (sufijo Pct) para que la lectura de un dataView objeto antiguo (`trend.posX`, etc.)
    // simplemente no encuentre coincidencia (`setPropertiesValues` busca por `slice.name`, ver
    // FormattingSettingsComponents.js) y el panel se comporte como si nunca se hubiera tocado (auto). Las
    // 4 propiedades legadas siguen declaradas en capabilities.json (numéricas, displayName marcado
    // «heredado»/«obsoleto») SIN slice aquí — no aparecen en el panel ni se leen nunca — únicamente para
    // que Power BI no borre ese valor heredado al volver a guardar el reporte (inventario/migración
    // manual futura; ver bitácora de este cambio).
    posXPct = new formattingSettings.NumUpDown({
        name: "posXPct",
        displayName: "Posición X (%)",
        description: "0-100% del ancho del viewport desde el borde izquierdo; ubica el pivote inferior-izquierdo de la caja (el punto fijo al rotar/escalar). Sin valor, se usa el % calculado automáticamente.",
        value: undefined,
        options: PERCENT_BOUNDS,
    });

    posYPct = new formattingSettings.NumUpDown({
        name: "posYPct",
        displayName: "Posición Y (%)",
        description: "0-100% del alto del viewport desde el borde superior; ubica el pivote inferior-izquierdo de la caja (el punto fijo al rotar/escalar). Sin valor, se usa el % calculado automáticamente.",
        value: undefined,
        options: PERCENT_BOUNDS,
    });

    widthPct = new formattingSettings.NumUpDown({
        name: "widthPct",
        displayName: "Ancho (%)",
        description: "0-100% del ancho del viewport. Sin valor, se usa el % calculado automáticamente.",
        value: undefined,
        options: PERCENT_BOUNDS,
    });

    heightPct = new formattingSettings.NumUpDown({
        name: "heightPct",
        displayName: "Alto (%)",
        description: "0-100% del alto del viewport. Sin valor, se usa el % calculado automáticamente.",
        value: undefined,
        options: PERCENT_BOUNDS,
    });

    // B4 — el valor vivo puede llegar no finito (NaN/Infinity) si el dataView objeto fue escrito fuera
    // del panel (bookmark/API/reporte corrupto): `extractSettings()` (visual.ts) lo sanea con
    // `finiteAngle` (cae a 0°, horizontal, sin rotación) antes de que llegue a GaugeSettings.
    // 0.4.1.1 — `options: ANGLE_BOUNDS` valida ±TREND_MAX_ANGLE_DEG en el panel (ver su JSDoc); el
    // ÁNGULO EFECTIVO que de verdad se dibuja puede ser aún menor en magnitud si la caja (sobre todo con
    // posición/tamaño PERSONALIZADOS) no libra el arco ni con el piso de escala — `getFormattingModel()`
    // (visual.ts) sobreescribe el valor mostrado con `clampTrendAngle` cuando el guardado excede ±A.
    // 0.4.1.1 — etiqueta exacta `Ángulo (grados, −A a A)` (A = TREND_MAX_ANGLE_DEG, 8°): comunica el
    // rango válido directamente en el nombre del control, sin depender de que el usuario abra/lea la
    // descripción extendida (que sigue documentando el PORQUÉ del límite). El signo usa el carácter
    // MINUS SIGN (U+2212, −), no el guion ASCII (-), igual que el resto de literales matemáticos del
    // panel en este repo.
    angle = new formattingSettings.NumUpDown({
        name: "angle",
        displayName: `Ángulo (grados, −${TREND_MAX_ANGLE_DEG} a ${TREND_MAX_ANGLE_DEG})`,
        description: `Rotación de la serie, entre -${TREND_MAX_ANGLE_DEG}° y ${TREND_MAX_ANGLE_DEG}°. Más allá de ese rango la homotecia anticolisión no garantiza separarla del arco sin reducirla por debajo de un tamaño legible; el panel muestra siempre el ángulo EFECTIVO (recortado si el valor guardado excede el límite).`,
        value: 0,
        options: ANGLE_BOUNDS,
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

    // Sólo tienen efecto con yScaleMode = "manual" (ver computeTrendYDomain en trend.ts). 0.4.1.0: sin
    // valor, el panel muestra el dominio automático efectivo (Real/Programado ± 10%, el mismo cálculo
    // que el modo "auto") en vez de dejarlo en blanco — así "manual" arranca desde ese mismo valor en
    // vez de 0.
    yMin = new formattingSettings.NumUpDown({
        name: "yMin",
        displayName: "Y Mínimo",
        description: "Sólo con Escala Y = Mín-máx manual. Sin valor, se muestra el mínimo del dominio automático Real/Programado ± 10%.",
        value: undefined
    });

    yMax = new formattingSettings.NumUpDown({
        name: "yMax",
        displayName: "Y Máximo",
        description: "Sólo con Escala Y = Mín-máx manual. Sin valor, se muestra el máximo del dominio automático Real/Programado ± 10%.",
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

    // 0.4.1.0 — sin valor por omisión (antes 2.5, fijo): el tamaño EFECTIVO es proporcional al grosor
    // de línea (ver computeEffectivePointSize en trend.ts) para que ajustar lineWidth escale también
    // los puntos; con lineWidth 1.5 (su propio default) da exactamente 2.5, idéntico a 0.3.5.0/0.4.0.0.
    pointSize = new formattingSettings.NumUpDown({
        name: "pointSize",
        displayName: "Tamaño de punto",
        description: "Sin valor, es proporcional al grosor de línea (×1.67, igual que el default 0.3.5.0: 1.5 → 2.5).",
        value: undefined
    });

    name: string = "trend";
    displayName: string = "Gráfico de tendencia";
    slices: Array<FormattingSettingsSlice> = [
        this.chartType,
        this.posXPct,
        this.posYPct,
        this.widthPct,
        this.heightPct,
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

