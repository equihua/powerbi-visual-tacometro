import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import powerbi from "powerbi-visuals-api";
import * as capabilities from "../capabilities.json";
import { VisualFormattingSettingsModel } from "../src/settings";
import { TrendSparkline, TrendSparklineProps, TrendChartType } from "../src/components/TrendSparkline";
import { TrendPoint, YScaleMode, computeTrendYDomain, computeEffectivePointSize } from "../src/components/trend";
import { applyTrendBoxOverrides, Box } from "../src/components/layout";
import { GaugeData, GaugeSettings } from "../src/components/types";
import { TREND_MAX_ANGLE_DEG } from "../src/components/trendFit";

const render = vi.fn();
vi.mock("react-dom/client", () => ({
    createRoot: () => ({ render }),
}));

import { Visual } from "../src/visual";

import DataView = powerbi.DataView;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

/**
 * Parte B (0.4.0.0) — tarjeta de formato «Gráfico de tendencia»: tipo de gráfico, posición/tamaño,
 * ángulo, escala Y (automática/desde cero/manual), mostrar/ocultar Programado, colores por semáforo o
 * fijo, y grosor de línea/tamaño de punto.
 */

// ---------------------------------------------------------------------------------------------------
// 1. settings.ts — defaults de la tarjeta (retrocompatibles con 0.3.5.0 salvo el margen de la escala
//    Y "auto", documentado en computeTrendYDomain).
// ---------------------------------------------------------------------------------------------------
describe("TrendCardSettings — defaults de la tarjeta «Gráfico de tendencia»", () => {
    const trendCard = new VisualFormattingSettingsModel().trendCard;

    it("tipo de gráfico por omisión: línea con puntos (comportamiento 0.3.5.0)", () => {
        expect(trendCard.chartType.value).toEqual({ displayName: "Línea con puntos", value: "lineDots" });
    });

    it("posición/tamaño sin valor por omisión (se usa el cálculo automático)", () => {
        expect(trendCard.posXPct.value).toBeUndefined();
        expect(trendCard.posYPct.value).toBeUndefined();
        expect(trendCard.widthPct.value).toBeUndefined();
        expect(trendCard.heightPct.value).toBeUndefined();
    });

    it("ángulo 0° por omisión (horizontal)", () => {
        expect(trendCard.angle.value).toBe(0);
    });

    /**
     * 0.4.1.1 — el panel valida/comunica el rango ±TREND_MAX_ANGLE_DEG (8°) determinado empíricamente
     * (ver JSDoc de TREND_MAX_ANGLE_DEG en trendFit.ts): la etiqueta exacta lo incluye directamente
     * (sin depender de que el usuario abra la descripción extendida), las opciones (NumUpDownFormat)
     * declaran ese mismo mínimo/máximo para que la UI del panel lo haga cumplir, y la descripción sigue
     * no vacía (documenta el PORQUÉ del límite).
     */
    it("0.4.1.1 — ángulo: etiqueta exacta con el rango ±A, opciones min/max = ±TREND_MAX_ANGLE_DEG (no vacías) y descripción no vacía", () => {
        expect(trendCard.angle.displayName).toBe(`Ángulo (grados, −${TREND_MAX_ANGLE_DEG} a ${TREND_MAX_ANGLE_DEG})`);
        expect(trendCard.angle.displayName).toBe("Ángulo (grados, −8 a 8)"); // literal exacto exigido (si TREND_MAX_ANGLE_DEG cambia, AMBAS aserciones deben actualizarse juntas).
        expect(trendCard.angle.options).toBeDefined();
        expect(trendCard.angle.options?.minValue?.value).toBe(-TREND_MAX_ANGLE_DEG);
        expect(trendCard.angle.options?.maxValue?.value).toBe(TREND_MAX_ANGLE_DEG);
        expect(trendCard.angle.description).toBeTruthy();
        expect((trendCard.angle.description as string).length).toBeGreaterThan(0);
    });

    it("escala Y automática al rango por omisión, sin límites manuales", () => {
        expect(trendCard.yScaleMode.value).toEqual({ displayName: "Automática al rango", value: "auto" });
        expect(trendCard.yMin.value).toBeUndefined();
        expect(trendCard.yMax.value).toBeUndefined();
    });

    it("Programado visible y colores por semáforo activados por omisión", () => {
        expect(trendCard.showProgrammed.value).toBe(true);
        expect(trendCard.useSemaphoreColors.value).toBe(true);
    });

    it("grosor de línea con el valor de 0.3.5.0 (1.5); tamaño de punto sin valor por omisión (0.4.1.0: ahora es «auto», proporcional al grosor de línea — ver computeEffectivePointSize)", () => {
        expect(trendCard.lineWidth.value).toBe(1.5);
        expect(trendCard.pointSize.value).toBeUndefined();
    });

    it("declara las 14 propiedades esperadas, en la tarjeta «trend» (0.4.1.0: posXPct/posYPct/widthPct/heightPct, no posX/posY/width/height)", () => {
        expect(trendCard.name).toBe("trend");
        expect(trendCard.slices.map((slice) => (slice as { name: string }).name)).toEqual([
            "chartType", "posXPct", "posYPct", "widthPct", "heightPct", "angle", "yScaleMode", "yMin", "yMax",
            "showProgrammed", "useSemaphoreColors", "fixedColor", "lineWidth", "pointSize",
        ]);
    });

    it("0.4.1.0 — posXPct/posYPct/widthPct/heightPct declaran límites 0..100 y el sufijo % en el panel (NumUpDownFormat.options)", () => {
        for (const slice of [trendCard.posXPct, trendCard.posYPct, trendCard.widthPct, trendCard.heightPct]) {
            expect(slice.options?.unitSymbol).toBe("%");
            expect(slice.options?.minValue?.value).toBe(0);
            expect(slice.options?.maxValue?.value).toBe(100);
        }
    });

    it("revisión B2 — ninguna propiedad visible del panel se llama posX/posY/width/height (los nombres legados de 0.4.0.0, px): evita que la lectura de un dataView guardado con 0.4.0.0 se reinterprete silenciosamente como %", () => {
        const names = trendCard.slices.map((slice) => (slice as { name: string }).name);
        expect(names).not.toContain("posX");
        expect(names).not.toContain("posY");
        expect(names).not.toContain("width");
        expect(names).not.toContain("height");
    });
});

// ---------------------------------------------------------------------------------------------------
// 2. capabilities.json — el objeto "trend" declara exactamente las mismas propiedades que settings.ts.
// ---------------------------------------------------------------------------------------------------
describe("capabilities.json — objeto «trend»", () => {
    const trendObject = (capabilities as any).objects.trend;

    it("existe con displayName «Gráfico de tendencia» y las 14 propiedades activas + las 4 legadas (0.4.0.0, px, deprecadas) al final", () => {
        expect(trendObject.displayName).toBe("Gráfico de tendencia");
        expect(Object.keys(trendObject.properties)).toEqual([
            "chartType", "posXPct", "posYPct", "widthPct", "heightPct", "angle", "yScaleMode", "yMin", "yMax",
            "showProgrammed", "useSemaphoreColors", "fixedColor", "lineWidth", "pointSize",
            "posX", "posY", "width", "height",
        ]);
    });

    it("chartType y yScaleMode son enumeraciones con los 4 tipos de gráfico y los 3 modos de escala", () => {
        expect(trendObject.properties.chartType.type.enumeration.map((i: any) => i.value)).toEqual([
            "lineDots", "line", "bars", "area",
        ]);
        expect(trendObject.properties.yScaleMode.type.enumeration.map((i: any) => i.value)).toEqual([
            "auto", "zero", "manual",
        ]);
    });

    it("fixedColor es un color picker y showProgrammed/useSemaphoreColors son booleanos", () => {
        expect(trendObject.properties.fixedColor.type).toEqual({ fill: { solid: { color: true } } });
        expect(trendObject.properties.showProgrammed.type).toEqual({ bool: true });
        expect(trendObject.properties.useSemaphoreColors.type).toEqual({ bool: true });
    });

    it("0.4.1.0 — posXPct/posYPct/widthPct/heightPct declaran explícitamente que son % (0-100) del viewport, con el pivote inferior-izquierdo documentado en posXPct/posYPct", () => {
        for (const name of ["posXPct", "posYPct", "widthPct", "heightPct"]) {
            const property = trendObject.properties[name];
            expect(property.displayName, name).toMatch(/%/);
            expect(property.description, name).toMatch(/%/);
            expect(property.description, name).toMatch(/viewport/i);
        }
        expect(trendObject.properties.posXPct.description).toMatch(/pivote|inferior.izquierd/i);
        expect(trendObject.properties.posYPct.description).toMatch(/pivote|inferior.izquierd/i);
    });

    it("0.4.1.0 — yMin/yMax documentan el dominio automático efectivo (Real/Programado ±10%) que se muestra cuando no se fijan", () => {
        expect(trendObject.properties.yMin.description).toMatch(/autom/i);
        expect(trendObject.properties.yMax.description).toMatch(/autom/i);
    });

    /**
     * 0.4.1.1 — `angle` declara el mismo rango ±8° que settings.ts (NumUpDown + ANGLE_BOUNDS), no la
     * estimación inicial de ~15° (ver JSDoc de TREND_MAX_ANGLE_DEG en trendFit.ts: 8° es el valor
     * EMPÍRICO real, documentado en vez de forzar la cifra estimada a ojo).
     */
    it("0.4.1.1 — angle: displayName exacto con el rango ±8 y descripción que documenta 8° (nunca 15°)", () => {
        expect(trendObject.properties.angle.displayName).toBe("Ángulo (grados, −8 a 8)");
        expect(trendObject.properties.angle.description).toMatch(/8°/);
        expect(trendObject.properties.angle.description).not.toMatch(/15°/);
    });

    // -----------------------------------------------------------------------------------------------
    // Revisión B2 — compatibilidad con reportes guardados en 0.4.0.0 (posX/posY/width/height eran PX
    // relativos al centro del medidor): deben seguir declaradas (mismo nombre exacto, numéricas, para
    // que Power BI las conserve al volver a guardar el reporte) pero marcadas obsoletas/heredadas, y
    // SIN ningún slice vivo en settings.ts que las lea — ver más abajo, sección 3.
    // -----------------------------------------------------------------------------------------------
    it("revisión B2 — posX/posY/width/height (0.4.0.0, px) siguen declaradas tal cual, marcadas obsoletas/heredadas, numéricas (para que Power BI conserve el valor guardado sin reinterpretarlo ni borrarlo)", () => {
        for (const name of ["posX", "posY", "width", "height"]) {
            const property = trendObject.properties[name];
            expect(property, name).toBeDefined();
            expect(property.type, name).toEqual({ numeric: true });
            expect(property.displayName, name).toMatch(/heredad|obsolet/i);
            expect(property.description, name).toMatch(/obsolet/i);
            expect(property.description, name).toMatch(/0\.4\.0\.0/);
        }
    });

    it("revisión B2 — las 4 propiedades legadas (posX/posY/width/height) son DISTINTAS de las 4 nuevas (posXPct/posYPct/widthPct/heightPct): nunca comparten nombre de propiedad", () => {
        const legacy = ["posX", "posY", "width", "height"];
        const current = ["posXPct", "posYPct", "widthPct", "heightPct"];
        for (const name of legacy) {
            expect(current).not.toContain(name);
        }
    });
});

// ---------------------------------------------------------------------------------------------------
// 3. visual.ts → Gauge.tsx — cada propiedad del panel llega como se espera al GaugeSettings que
//    consume el componente (lectura capabilities.json/settings.ts → GaugeSettings).
// ---------------------------------------------------------------------------------------------------
function setupVisual() {
    const host = {
        createSelectionManager: () => ({ showContextMenu: vi.fn() }),
        eventService: { renderingStarted: vi.fn(), renderingFinished: vi.fn(), renderingFailed: vi.fn() },
        tooltipService: { enabled: () => true, show: vi.fn(), hide: vi.fn() },
        hostCapabilities: { allowInteractions: true },
        colorPalette: { isHighContrast: false },
    };
    const visual = new Visual({ element: new EventTarget() as unknown as HTMLElement, host } as unknown as VisualConstructorOptions);
    return visual;
}

function dataViewWithTrendObject(objects: Record<string, unknown>): DataView {
    return {
        metadata: { columns: [], objects: { trend: objects } },
        categorical: { values: [{ source: { displayName: "m", roles: { measure: true } }, values: [42] }] },
    } as unknown as DataView;
}

function settingsOf(visual: Visual, view: DataView): GaugeSettings {
    render.mockClear();
    visual.update({ dataViews: [view], viewport: { width: 300, height: 300 } } as unknown as VisualUpdateOptions);
    return (render.mock.calls[0][0] as { props: { settings: GaugeSettings } }).props.settings;
}

describe("Visual — lectura de la tarjeta «Gráfico de tendencia» hacia GaugeSettings", () => {
    it("sin tocar el panel, GaugeSettings trae los defaults retrocompatibles (undefined donde el cálculo es automático)", () => {
        const settings = settingsOf(setupVisual(), dataViewWithTrendObject({}));
        expect(settings.trendChartType).toBe("lineDots");
        expect(settings.trendPosX).toBeUndefined();
        expect(settings.trendPosY).toBeUndefined();
        expect(settings.trendWidth).toBeUndefined();
        expect(settings.trendHeight).toBeUndefined();
        expect(settings.trendAngle).toBe(0);
        expect(settings.trendYScaleMode).toBe("auto");
        expect(settings.trendYMin).toBeUndefined();
        expect(settings.trendYMax).toBeUndefined();
        expect(settings.trendShowProgrammed).toBe(true);
        expect(settings.trendUseSemaphoreColors).toBe(true);
        expect(settings.trendLineWidth).toBe(1.5);
        expect(settings.trendPointSize).toBe(2.5);
    });

    it("con el panel configurado, cada propiedad llega con su valor (tipo de gráfico, posición/tamaño en %, ángulo, escala manual, Programado, color fijo, grosor/tamaño)", () => {
        const settings = settingsOf(setupVisual(), dataViewWithTrendObject({
            chartType: "bars",
            posXPct: 5, posYPct: 95, widthPct: 40, heightPct: 12,
            angle: 15,
            yScaleMode: "manual", yMin: 10, yMax: 90,
            showProgrammed: false,
            useSemaphoreColors: false,
            fixedColor: { solid: { color: "#112233" } },
            lineWidth: 3,
            pointSize: 6,
        }));
        expect(settings.trendChartType).toBe("bars");
        expect(settings.trendPosX).toBe(5);
        expect(settings.trendPosY).toBe(95);
        expect(settings.trendWidth).toBe(40);
        expect(settings.trendHeight).toBe(12);
        expect(settings.trendAngle).toBe(15);
        expect(settings.trendYScaleMode).toBe("manual");
        expect(settings.trendYMin).toBe(10);
        expect(settings.trendYMax).toBe(90);
        expect(settings.trendShowProgrammed).toBe(false);
        expect(settings.trendUseSemaphoreColors).toBe(false);
        expect(settings.trendFixedColor).toBe("#112233");
        expect(settings.trendLineWidth).toBe(3);
        expect(settings.trendPointSize).toBe(6);
    });

    it("0.4.1.0 — pointSize sin tocar el panel es proporcional al lineWidth configurado (computeEffectivePointSize), no el valor fijo de 0.3.5.0", () => {
        const settings = settingsOf(setupVisual(), dataViewWithTrendObject({ lineWidth: 3 }));
        expect(settings.trendLineWidth).toBe(3);
        expect(settings.trendPointSize).toBe(computeEffectivePointSize(3));
        expect(settings.trendPointSize).toBeCloseTo(5, 6); // 3 * (2.5/1.5)
    });

    // -------------------------------------------------------------------------------------------
    // Revisión B2 — un reporte guardado con 0.4.0.0 trae `trend.posX/posY/width/height` en PX
    // (relativos al centro del medidor). Tras renombrar las propiedades vivas a `posXPct`/etc., estos
    // 4 valores NUNCA deben leerse ni reinterpretarse como %: deben ignorarse por completo (undefined,
    // cae al cálculo automático), exactamente igual que si el panel nunca hubiera tocado la tarjeta.
    // -------------------------------------------------------------------------------------------
    it("revisión B2 — overrides LEGADOS (posX/posY/width/height, px de 0.4.0.0) en el dataView se IGNORAN por completo: GaugeSettings usa el cálculo automático, nunca los reinterpreta como %", () => {
        const settings = settingsOf(setupVisual(), dataViewWithTrendObject({
            // Simula un objeto `trend` tal cual lo guardó un reporte en 0.4.0.0 (antes del rename).
            posX: 60, posY: 80, width: 30, height: 15,
        }));
        expect(settings.trendPosX).toBeUndefined();
        expect(settings.trendPosY).toBeUndefined();
        expect(settings.trendWidth).toBeUndefined();
        expect(settings.trendHeight).toBeUndefined();
    });

    it("revisión B2 — con overrides legados Y nuevos a la vez en el mismo dataView, sólo se aplican los nuevos (posXPct/etc.); los legados (posX/etc.) siguen sin efecto", () => {
        const settings = settingsOf(setupVisual(), dataViewWithTrendObject({
            posX: 60, posY: 80, width: 30, height: 15, // legado, px 0.4.0.0 — debe ignorarse
            posXPct: 11, posYPct: 22, widthPct: 33, heightPct: 44, // vivo, % 0.4.1.0 — debe aplicarse
        }));
        expect(settings.trendPosX).toBe(11);
        expect(settings.trendPosY).toBe(22);
        expect(settings.trendWidth).toBe(33);
        expect(settings.trendHeight).toBe(44);
    });

    // -------------------------------------------------------------------------------------------
    // B4 — validación defensiva: un valor fuera de [0,100] o no finito en *Pct, o no finito en
    // `angle`, puede llegar sin pasar por la UI del panel (bookmark/API/reporte corrupto — ver
    // `finitePercent`/`finiteAngle` en visual.ts). Debe degradar a "automático"/0°, nunca propagar
    // NaN/Infinity ni un % fuera de rango a la geometría (resolveTrendBoxFromPercentOverrides,
    // trendTransformCoefficients).
    // -------------------------------------------------------------------------------------------
    it("B4 — posXPct/posYPct/widthPct/heightPct fuera de [0,100] se ignoran (caen al cálculo automático)", () => {
        const settings = settingsOf(setupVisual(), dataViewWithTrendObject({
            posXPct: -5, posYPct: 150, widthPct: 101, heightPct: -0.01,
        }));
        expect(settings.trendPosX).toBeUndefined();
        expect(settings.trendPosY).toBeUndefined();
        expect(settings.trendWidth).toBeUndefined();
        expect(settings.trendHeight).toBeUndefined();
    });

    it("B4 — posXPct/posYPct/widthPct/heightPct no finitos (NaN/Infinity) se ignoran (caen al cálculo automático)", () => {
        const settings = settingsOf(setupVisual(), dataViewWithTrendObject({
            posXPct: NaN, posYPct: Infinity, widthPct: -Infinity, heightPct: NaN,
        }));
        expect(settings.trendPosX).toBeUndefined();
        expect(settings.trendPosY).toBeUndefined();
        expect(settings.trendWidth).toBeUndefined();
        expect(settings.trendHeight).toBeUndefined();
    });

    it("B4 — los límites 0 y 100 SÍ son válidos para posXPct/posYPct/widthPct/heightPct (rango cerrado)", () => {
        const settings = settingsOf(setupVisual(), dataViewWithTrendObject({
            posXPct: 0, posYPct: 100, widthPct: 0, heightPct: 100,
        }));
        expect(settings.trendPosX).toBe(0);
        expect(settings.trendPosY).toBe(100);
        expect(settings.trendWidth).toBe(0);
        expect(settings.trendHeight).toBe(100);
    });

    it("B4 — angle no finito (NaN/Infinity) cae a 0° (horizontal, sin rotación); angle normal pasa intacto", () => {
        expect(settingsOf(setupVisual(), dataViewWithTrendObject({ angle: NaN })).trendAngle).toBe(0);
        expect(settingsOf(setupVisual(), dataViewWithTrendObject({ angle: Infinity })).trendAngle).toBe(0);
        expect(settingsOf(setupVisual(), dataViewWithTrendObject({ angle: -Infinity })).trendAngle).toBe(0);
        expect(settingsOf(setupVisual(), dataViewWithTrendObject({ angle: 37 })).trendAngle).toBe(37);
    });
});

// ---------------------------------------------------------------------------------------------------
// 4. computeTrendYDomain — los 3 modos de escala Y, incluido el caso rango = 0.
// ---------------------------------------------------------------------------------------------------
describe("computeTrendYDomain — modos de escala Y", () => {
    it("auto: domina el mín/máx combinado con 10% de margen arriba y abajo", () => {
        // rango 10..40 → margen 10% de 30 = 3
        expect(computeTrendYDomain([10, 40, 25], "auto")).toEqual([7, 43]);
    });

    it("auto con rango 0 y valor != 0: margen = 10% del valor absoluto", () => {
        // todos los valores 50 → rango 0, margen 10% de 50 = 5
        expect(computeTrendYDomain([50, 50, 50], "auto")).toEqual([45, 55]);
    });

    it("auto con rango 0 y valor == 0 (todo cero): margen fijo absoluto de 1 (evita domain [0,0])", () => {
        expect(computeTrendYDomain([0, 0], "auto")).toEqual([-1, 1]);
    });

    it("auto sin ningún valor finito: igual que el caso [0,0] (domain [-1, 1])", () => {
        expect(computeTrendYDomain([], "auto")).toEqual([-1, 1]);
    });

    it("zero: el origen siempre queda dentro del dominio, sin margen adicional", () => {
        expect(computeTrendYDomain([10, 40], "zero")).toEqual([0, 40]);
        expect(computeTrendYDomain([-10, 40], "zero")).toEqual([-10, 40]);
        expect(computeTrendYDomain([-40, -10], "zero")).toEqual([-40, 0]);
    });

    it("manual: usa yMin/yMax del panel tal cual", () => {
        expect(computeTrendYDomain([10, 40], "manual", 0, 100)).toEqual([0, 100]);
    });

    it("manual incompleto o invertido cae a «auto» sobre los mismos valores", () => {
        expect(computeTrendYDomain([10, 40], "manual", undefined, 100)).toEqual(computeTrendYDomain([10, 40], "auto"));
        expect(computeTrendYDomain([10, 40], "manual", 100, 0)).toEqual(computeTrendYDomain([10, 40], "auto"));
    });

    // Regresión (release 0.4.1.0): con el modo "auto" (por omisión) el margen del 10% a cada lado deja
    // el rango propio de Real ocupando ≥ 60% del alto del dominio (rango / (rango·1.2) ≈ 83.33%), para
    // que la serie siga siendo la protagonista visual de la tarjeta por omisión. Si alguien ampliara el
    // margen por encima de ~33% del rango, esta prueba fallaría antes de publicarlo.
    it("auto (por omisión): el rango propio de Real ocupa al menos el 60% del alto del dominio (10% de margen por lado)", () => {
        const real = [10, 40, 25, 18, 32];
        const [low, high] = computeTrendYDomain(real, "auto");
        const realRange = Math.max(...real) - Math.min(...real);
        const domainRange = high - low;
        const occupiedFraction = realRange / domainRange;
        expect(occupiedFraction).toBeGreaterThanOrEqual(0.6);
        expect(occupiedFraction).toBeCloseTo(1 / 1.2, 6); // 83.33%, exacto con el margen de 10% documentado arriba.
    });
});

// ---------------------------------------------------------------------------------------------------
// 0.4.1.0 — computeEffectivePointSize: tamaño de punto efectivo, proporcional al grosor de línea
// configurado, cuando el panel no fija uno propio (pointSize ahora es "auto" por omisión, settings.ts).
// ---------------------------------------------------------------------------------------------------
describe("computeEffectivePointSize — tamaño de punto proporcional al grosor de línea", () => {
    it("con el grosor de línea por omisión (1.5), da exactamente 2.5 (el default fijo de 0.3.5.0/0.4.0.0, retrocompatible)", () => {
        expect(computeEffectivePointSize(1.5)).toBe(2.5);
    });

    it("escala linealmente con el grosor de línea (misma proporción 2.5/1.5)", () => {
        expect(computeEffectivePointSize(3)).toBeCloseTo(5, 6);
        expect(computeEffectivePointSize(0.75)).toBeCloseTo(1.25, 6);
    });

    it("redondea a centésimas (sin arrastrar ruido de flotante al panel)", () => {
        expect(computeEffectivePointSize(1)).toBeCloseTo(1.67, 2);
        expect(Number.isInteger(computeEffectivePointSize(1) * 100)).toBe(true);
    });
});

// ---------------------------------------------------------------------------------------------------
// 5. applyTrendBoxOverrides — posición/tamaño: retrocompatible y sobreescribible eje por eje.
// ---------------------------------------------------------------------------------------------------
describe("applyTrendBoxOverrides — posición/tamaño de la caja de tendencia", () => {
    const auto: Box = { x: 10, y: 20, width: 100, height: 30 };

    it("sin ninguna sobreescritura, el resultado es idéntico al automático", () => {
        expect(applyTrendBoxOverrides(auto, {})).toEqual(auto);
    });

    it("cada eje se sobreescribe de forma independiente", () => {
        expect(applyTrendBoxOverrides(auto, { x: 0 })).toEqual({ x: 0, y: 20, width: 100, height: 30 });
        expect(applyTrendBoxOverrides(auto, { width: 50, height: 10 })).toEqual({ x: 10, y: 20, width: 50, height: 10 });
    });

    it("si no hay caja automática (no cabe) no se crea una desde las sobreescrituras", () => {
        expect(applyTrendBoxOverrides(null, { x: 0, y: 0, width: 50, height: 10 })).toBeNull();
    });
});

// ---------------------------------------------------------------------------------------------------
// 6. TrendSparkline — los 4 tipos de gráfico, rotación, mostrar/ocultar Programado, colores por
//    semáforo o fijo, grosor/tamaño, y la regla de NO romper la tooltip clara / nunca <title>.
// ---------------------------------------------------------------------------------------------------
const thresholds = { lowThreshold: 40, midThreshold: 70 };
const points: TrendPoint[] = [
    { label: "Ene", real: 30, programmed: 50, semaphore: "Rojo", thresholds },
    { label: "Feb", real: 90, programmed: 60, semaphore: "Verde", thresholds },
    { label: "Mar", real: 60, programmed: 80, semaphore: "Amarillo", thresholds },
];

function render_(overrides: Partial<TrendSparklineProps> = {}): string {
    const props: TrendSparklineProps = {
        points,
        width: 300,
        height: 60,
        currentIndex: 2,
        colors: { lowColor: "#C00000", mediumColor: "#FFC000", highColor: "#007F38", lowerIsBetter: false },
        programmedColor: "#0078D4",
        format: (value: number) => value.toFixed(1),
        ...overrides,
    };
    return renderToStaticMarkup(React.createElement("svg", null, React.createElement(TrendSparkline, props)));
}

describe("TrendSparkline — 4 tipos de gráfico", () => {
    const chartTypes: TrendChartType[] = ["lineDots", "line", "bars", "area"];

    it("ningún tipo de gráfico usa el atributo SVG <title> (tooltip nativa oscura prohibida, requisito 6)", () => {
        for (const chartType of chartTypes) {
            expect(render_({ chartType })).not.toContain("<title>");
        }
    });

    it("todos los puntos con Real llevan data-trend-index, en todos los tipos de gráfico (tooltip clara)", () => {
        for (const chartType of chartTypes) {
            const markup = render_({ chartType });
            const indices = [...markup.matchAll(/data-trend-index="(\d+)"/g)].map((m) => m[1]);
            expect(indices, chartType).toEqual(expect.arrayContaining(["0", "1", "2"]));
        }
    });

    it('"lineDots": path de la línea de Real + circle por punto', () => {
        const markup = render_({ chartType: "lineDots" });
        expect(markup).toMatch(/<path[^>]*class="trend-real-line"/);
        expect([...markup.matchAll(/<circle[^>]*class="trend-point/g)]).toHaveLength(3);
    });

    it('"line": sin circle visible (solo los de impacto para el tooltip, transparentes)', () => {
        const markup = render_({ chartType: "line", useSemaphoreColors: false });
        expect(markup).not.toMatch(/class="trend-point/);
        // El path o las líneas de segmento llevan el trazo de Real; con useSemaphoreColors apagado es un único path.
        expect(markup).toMatch(/<path[^>]*class="trend-real-line"/);
        // Círculos de impacto (tooltip), invisibles.
        expect([...markup.matchAll(/<circle[^>]*class="trend-hit-point"[^>]*fill="transparent"/g)]).toHaveLength(3);
    });

    it('"line" con colores por semáforo: segmentos <line> coloreados individualmente', () => {
        const markup = render_({ chartType: "line", useSemaphoreColors: true });
        const segments = [...markup.matchAll(/<line[^>]*class="trend-line-segment"[^>]*stroke="([^"]+)"/g)];
        expect(segments).toHaveLength(2); // 3 puntos consecutivos con Real → 2 segmentos
        // Verde (Feb) y Amarillo (Mar): colores de estado distintos entre segmentos.
        expect(segments[0][1]).not.toBe(segments[1][1]);
    });

    it('"bars": un <rect> por punto con Real, con data-trend-index', () => {
        const markup = render_({ chartType: "bars" });
        const bars = [...markup.matchAll(/<rect[^>]*class="trend-bar"[^>]*data-trend-index="(\d+)"/g)];
        expect(bars.map((m) => m[1])).toEqual(["0", "1", "2"]);
    });

    it('"area": un <path> cerrado (Z) con clase trend-area', () => {
        const markup = render_({ chartType: "area" });
        const match = /<path[^>]*class="trend-area"[^>]*d="([^"]+)"/.exec(markup);
        expect(match).not.toBeNull();
        expect(match![1]).toMatch(/^M.*Z$/);
    });

    it("mostrar/ocultar Programado: con showProgrammed=false no se dibuja su línea, en ningún tipo de gráfico", () => {
        for (const chartType of chartTypes) {
            expect(render_({ chartType, showProgrammed: false })).not.toContain("trend-programmed-line");
            expect(render_({ chartType, showProgrammed: true })).toContain("trend-programmed-line");
        }
    });
});

describe("TrendSparkline — rotación por ángulo, pivote fijo en la esquina inferior izquierda", () => {
    it("angle=0 y scale=1 (los valores por omisión) no agregan transform al grupo de la serie (regresión visual exacta)", () => {
        const markup = render_();
        expect(markup).toMatch(/<g class="trend-sparkline">/);
    });

    it("angle != 0 rota el grupo con una única matriz, pivotando en la esquina inferior izquierda (no en el centro)", () => {
        const markup = render_({ angle: 30, width: 300, height: 60 });
        // matrix(cos30,-sin30,sin30,cos30, -height·sin30, height - height·cos30) con height=60.
        expect(markup).toContain('<g class="trend-sparkline" transform="matrix(0.866,-0.5,0.5,0.866,-30,8.0385)">');
    });

    it("scale < 1 (homotecia) reduce el tamaño sin mover el pivote ni el ángulo: la matriz cambia pero sigue fijando (0,height) en sí mismo", () => {
        const markup = render_({ angle: 0, scale: 0.5, width: 300, height: 60 });
        // angle 0: matrix(scale,0,0,scale,0,height·(1-scale)).
        expect(markup).toContain('<g class="trend-sparkline" transform="matrix(0.5,0,0,0.5,0,30)">');
    });

    it("rotación y tooltip/hit-testing siguen intactos: con ángulo != 0, los 4 tipos de gráfico conservan data-trend-index y ningún <title>", () => {
        const chartTypes: TrendChartType[] = ["lineDots", "line", "bars", "area"];
        for (const chartType of chartTypes) {
            const markup = render_({ chartType, angle: 45 });
            expect(markup, chartType).not.toContain("<title>");
            const indices = [...markup.matchAll(/data-trend-index="(\d+)"/g)].map((m) => m[1]);
            expect(indices, chartType).toEqual(expect.arrayContaining(["0", "1", "2"]));
        }
    });
});

describe("TrendSparkline — colores por semáforo o color fijo", () => {
    it("por omisión (useSemaphoreColors=true), cada punto usa el color de SU semáforo", () => {
        const markup = render_({ chartType: "lineDots" });
        const fills = [...markup.matchAll(/<circle[^>]*class="trend-point[^"]*"[^>]*fill="([^"]+)"/g)].map((m) => m[1]);
        expect(fills).toEqual(["#C00000", "#007F38", "#FFC000"]); // Rojo, Verde, Amarillo
    });

    it("con useSemaphoreColors=false, todos los puntos/barras usan fixedColor", () => {
        const markup = render_({ chartType: "bars", useSemaphoreColors: false, fixedColor: "#123456" });
        const fills = [...markup.matchAll(/<rect[^>]*class="trend-bar"[^>]*fill="([^"]+)"/g)].map((m) => m[1]);
        expect(fills.every((fill) => fill === "#123456")).toBe(true);
    });

    it('"area" con useSemaphoreColors=false: el relleno único usa fixedColor (rama de singleStatusColor sin semáforo)', () => {
        const markup = render_({ chartType: "area", useSemaphoreColors: false, fixedColor: "#654321" });
        const match = /<path[^>]*class="trend-area"[^>]*fill="([^"]+)"/.exec(markup);
        expect(match).not.toBeNull();
        expect(match![1]).toBe("#654321");
    });

    it('"area" sin ningún punto con Real: singleStatusColor cae a la rama index < 0 (lastIndexWithReal = -1) sin lanzar, y no dibuja ningún <path> de área (no hay runs de Real)', () => {
        const noRealPoints: TrendPoint[] = points.map((p) => ({ ...p, real: null }));
        expect(() =>
            render_({
                chartType: "area",
                points: noRealPoints,
                currentIndex: -1,
                fixedColor: "#abcdef",
            })
        ).not.toThrow();
        const markup = render_({ chartType: "area", points: noRealPoints, currentIndex: -1, fixedColor: "#abcdef" });
        expect(markup).not.toContain("trend-area");
    });

    it("alto contraste: el color fijo cede ante el foreground del host (misma precedencia que el resto del medidor)", () => {
        const hc = { foreground: "#FFFF00", background: "#000000" };
        const markup = render_({
            chartType: "bars",
            useSemaphoreColors: false,
            fixedColor: "#123456",
            colors: { lowColor: "#C00000", mediumColor: "#FFC000", highColor: "#007F38", lowerIsBetter: false, highContrast: hc },
        });
        const fills = [...markup.matchAll(/<rect[^>]*class="trend-bar"[^>]*fill="([^"]+)"/g)].map((m) => m[1]);
        expect(fills.every((fill) => fill === "#FFFF00")).toBe(true);
    });
});

describe("TrendSparkline — grosor de línea y tamaño de punto configurables", () => {
    it("lineWidth cambia el stroke-width de la línea de Real", () => {
        const markup = render_({ chartType: "lineDots", lineWidth: 4 });
        expect(markup).toMatch(/<path[^>]*class="trend-real-line"[^>]*stroke-width="4"/);
    });

    it("pointSize cambia el radio de los puntos (el actual conserva el mismo margen por encima)", () => {
        const markup = render_({ chartType: "lineDots", pointSize: 5 });
        const radius = (cls: string) => Number(new RegExp(`<circle[^>]*class="${cls}"[^>]*r="([\\d.]+)"`).exec(markup)?.[1]);
        expect(radius("trend-point")).toBe(5);
        expect(radius("trend-point trend-point-current")).toBe(6.5); // 5 + (4 − 2.5) de 0.3.3.1
    });
});
