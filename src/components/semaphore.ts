import { PerformanceColors } from "./scales";

/** Gris para "Sin semaforizar" (mismo tono que la regla del modelo TableroMaestro). */
export const NEUTRAL_SEMAPHORE_COLOR = "#ADB5BD";

type SemaphoreLevel = "high" | "medium" | "low" | "neutral";

/** Tokens normalizados (minúsculas, sin acentos) → nivel semántico. */
const TOKENS: Record<string, SemaphoreLevel> = {
    "verde": "high",
    "green": "high",
    "text-success": "high",
    "amarillo": "medium",
    "yellow": "medium",
    "text-warning": "medium",
    "text-yellow-custom": "medium",
    "rojo": "low",
    "red": "low",
    "text-danger": "low",
    "sin semaforizar": "neutral",
    "gris": "neutral",
    "gray": "neutral",
    "grey": "neutral",
    "text-muted": "neutral",
    "text-secondary": "neutral",
};

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalize(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function levelOf(text: string): SemaphoreLevel | undefined {
    const whole = TOKENS[text];
    if (whole) {
        return whole;
    }
    // Lista de clases CSS ("fw-bold text-danger"): gana la primera clase reconocida.
    for (const token of text.split(" ")) {
        if (TOKENS[token]) {
            return TOKENS[token];
        }
    }
    return undefined;
}

/**
 * Color del semáforo que trae la fuente (regla TableroMaestro: no recalcular).
 * Devuelve null cuando no hay dato o no se reconoce: el llamador usa entonces
 * el color calculado por umbrales.
 */
export function resolveSemaphoreColor(raw: unknown, colors: PerformanceColors): string | null {
    if (typeof raw !== "string") {
        return null;
    }
    const trimmed = raw.trim();
    if (HEX_COLOR.test(trimmed)) {
        return trimmed;
    }
    switch (levelOf(normalize(trimmed))) {
        case "high":
            return colors.highColor;
        case "medium":
            return colors.mediumColor;
        case "low":
            return colors.lowColor;
        case "neutral":
            return NEUTRAL_SEMAPHORE_COLOR;
        default:
            return null;
    }
}
