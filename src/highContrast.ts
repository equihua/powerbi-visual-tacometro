import powerbi from "powerbi-visuals-api";
import { GaugeSettings } from "./components/types";

import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;

/**
 * Alto contraste (https://learn.microsoft.com/power-bi/developer/visuals/high-contrast-support):
 * sólo se usan foreground/background del host. Las bandas pasan a contorno
 * (relleno background + trazo foreground) y los marcadores se distinguen por forma.
 */
export function applyHighContrast(settings: GaugeSettings, palette: ISandboxExtendedColorPalette | undefined): GaugeSettings {
    if (!palette || !palette.isHighContrast) {
        return settings;
    }
    const foreground = palette.foreground.value;
    const background = palette.background.value;
    return {
        ...settings,
        lowColor: background,
        mediumColor: background,
        highColor: background,
        markerColor: foreground,
        labelColor: foreground,
        targetMarginColor: foreground,
        programmedColor: foreground,
        previousMonthColor: foreground,
        highContrast: { foreground, background },
    };
}
