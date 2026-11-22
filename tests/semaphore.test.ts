import { describe, expect, it } from "vitest";
import { NEUTRAL_SEMAPHORE_COLOR, resolveSemaphoreColor } from "../src/components/semaphore";

const COLORS = { lowColor: "#C00000", mediumColor: "#FFC000", highColor: "#007F38" };

describe("resolveSemaphoreColor (B1: color semántico de la fuente)", () => {
    it("mapea Verde / Amarillo / Rojo a los colores alto / medio / bajo del panel", () => {
        expect(resolveSemaphoreColor("Verde", COLORS)).toBe("#007F38");
        expect(resolveSemaphoreColor("Amarillo", COLORS)).toBe("#FFC000");
        expect(resolveSemaphoreColor("Rojo", COLORS)).toBe("#C00000");
    });

    it("ignora mayúsculas, acentos y espacios", () => {
        expect(resolveSemaphoreColor("  VERDE ", COLORS)).toBe("#007F38");
        expect(resolveSemaphoreColor("amarillo", COLORS)).toBe("#FFC000");
        expect(resolveSemaphoreColor("rojo\n", COLORS)).toBe("#C00000");
    });

    it("acepta clases CSS text-* (Bootstrap) también dentro de varias clases", () => {
        expect(resolveSemaphoreColor("text-success", COLORS)).toBe("#007F38");
        expect(resolveSemaphoreColor("text-warning", COLORS)).toBe("#FFC000");
        expect(resolveSemaphoreColor("text-yellow-custom", COLORS)).toBe("#FFC000");
        expect(resolveSemaphoreColor("text-danger", COLORS)).toBe("#C00000");
        expect(resolveSemaphoreColor("fw-bold text-danger", COLORS)).toBe("#C00000");
    });

    it("acepta sinónimos en inglés", () => {
        expect(resolveSemaphoreColor("green", COLORS)).toBe("#007F38");
        expect(resolveSemaphoreColor("Yellow", COLORS)).toBe("#FFC000");
        expect(resolveSemaphoreColor("RED", COLORS)).toBe("#C00000");
    });

    it("'Sin semaforizar', gris y text-muted → gris neutro (no se recalcula)", () => {
        expect(resolveSemaphoreColor("Sin semaforizar", COLORS)).toBe(NEUTRAL_SEMAPHORE_COLOR);
        expect(resolveSemaphoreColor("Gris", COLORS)).toBe(NEUTRAL_SEMAPHORE_COLOR);
        expect(resolveSemaphoreColor("text-muted", COLORS)).toBe(NEUTRAL_SEMAPHORE_COLOR);
        expect(resolveSemaphoreColor("text-secondary", COLORS)).toBe(NEUTRAL_SEMAPHORE_COLOR);
    });

    it("un color hexadecimal de la fuente se usa tal cual", () => {
        expect(resolveSemaphoreColor("#007f38", COLORS)).toBe("#007f38");
        expect(resolveSemaphoreColor(" #ABC ", COLORS)).toBe("#ABC");
    });

    it("sin dato o valor no reconocido → null (se usa el color calculado por umbrales)", () => {
        expect(resolveSemaphoreColor(null, COLORS)).toBeNull();
        expect(resolveSemaphoreColor(undefined, COLORS)).toBeNull();
        expect(resolveSemaphoreColor("", COLORS)).toBeNull();
        expect(resolveSemaphoreColor("Azul marino", COLORS)).toBeNull();
        expect(resolveSemaphoreColor("#12", COLORS)).toBeNull();
        expect(resolveSemaphoreColor(3, COLORS)).toBeNull();
    });
});
