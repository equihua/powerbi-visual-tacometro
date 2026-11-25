import { describe, expect, it } from "vitest";
import { boxToPercent, percentToBox, resolveTrendBoxFromPercentOverrides } from "../src/components/trendBoxPercent";
import { Box } from "../src/components/layout";
import { applyTrendTransform } from "../src/components/trendTransform";

/**
 * 0.4.1.0 — posX/posY/width/height de la tarjeta «Gráfico de tendencia» pasan de px relativos al
 * centro del medidor a % (0..100) del viewport completo, con (posX, posY) ubicando el PIVOTE
 * inferior-izquierdo de la caja (el mismo punto que trendTransform.ts fija al rotar/escalar), medido
 * desde el borde IZQUIERDO (X) y SUPERIOR (Y) del viewport — igual que cualquier coordenada de pantalla.
 */
describe("boxToPercent / percentToBox — caja de tendencia en % del viewport, pivote inferior-izquierdo", () => {
    const center = { x: 150, y: 150 };
    const viewport = { width: 300, height: 300 };

    it("convierte una caja (relativa al centro) a % del viewport usando el pivote inferior-izquierdo", () => {
        const box: Box = { x: -50, y: 20, width: 100, height: 30 };
        // pivote absoluto: (center.x + box.x, center.y + box.y + box.height) = (100, 200)
        const percent = boxToPercent(box, center, viewport);
        expect(percent.posX).toBeCloseTo((100 / 300) * 100, 9);
        expect(percent.posY).toBeCloseTo((200 / 300) * 100, 9);
        expect(percent.width).toBeCloseTo((100 / 300) * 100, 9);
        expect(percent.height).toBeCloseTo((30 / 300) * 100, 9);
    });

    it("posX=0/posY=0 ubica el pivote exactamente en la esquina superior-izquierda absoluta del viewport (X desde la izquierda, Y desde arriba)", () => {
        const percent = { posX: 0, posY: 0, width: 10, height: 10 };
        const box = percentToBox(percent, center, viewport);
        // pivote (inferior-izquierdo de la caja) = (center.x + box.x, center.y + box.y + box.height) = (0, 0)
        expect(center.x + box.x).toBeCloseTo(0, 9);
        expect(center.y + box.y + box.height).toBeCloseTo(0, 9);
    });

    it("posX=100/posY=100 ubica el pivote en la esquina inferior-derecha absoluta del viewport", () => {
        const percent = { posX: 100, posY: 100, width: 10, height: 10 };
        const box = percentToBox(percent, center, viewport);
        expect(center.x + box.x).toBeCloseTo(viewport.width, 9);
        expect(center.y + box.y + box.height).toBeCloseTo(viewport.height, 9);
    });

    it("percentToBox(boxToPercent(box)) es la identidad (ida y vuelta sin pérdida, salvo error de flotante)", () => {
        const box: Box = { x: -50, y: 20, width: 100, height: 30 };
        const roundTripped = percentToBox(boxToPercent(box, center, viewport), center, viewport);
        expect(roundTripped.x).toBeCloseTo(box.x, 9);
        expect(roundTripped.y).toBeCloseTo(box.y, 9);
        expect(roundTripped.width).toBeCloseTo(box.width, 9);
        expect(roundTripped.height).toBeCloseTo(box.height, 9);
    });

    it("el pivote (posX, posY) coincide exactamente con el punto que trendTransform.ts fija al rotar/escalar (invariante local (0, height))", () => {
        const box: Box = { x: -50, y: 20, width: 100, height: 30 };
        const percent = boxToPercent(box, center, viewport);
        const pivotAbs = {
            x: (percent.posX / 100) * viewport.width,
            y: (percent.posY / 100) * viewport.height,
        };
        // Traslación real que Gauge.tsx aplica al <g class="gauge-trend-slot">.
        const slotOrigin = { x: center.x + box.x, y: center.y + box.y };
        // El pivote local de trendTransform es (0, height); bajo CUALQUIER ángulo/escala permanece fijo en sí mismo.
        const localPivot = { x: 0, y: box.height };
        const transformedPivot = applyTrendTransform(localPivot, box.height, 37, 0.6);
        // Invariante, sin importar ángulo/escala (sin redondear: ruido de flotante del orden de 1e-15 en x).
        expect(transformedPivot.x).toBeCloseTo(localPivot.x, 9);
        expect(transformedPivot.y).toBeCloseTo(localPivot.y, 9);
        expect(slotOrigin.x + transformedPivot.x).toBeCloseTo(pivotAbs.x, 9);
        expect(slotOrigin.y + transformedPivot.y).toBeCloseTo(pivotAbs.y, 9);
    });

    it("viewport de ancho o alto 0 no produce NaN/Infinity (caja degenerada, 0%)", () => {
        const box: Box = { x: 10, y: 10, width: 20, height: 20 };
        const percent = boxToPercent(box, center, { width: 0, height: 0 });
        expect(Number.isFinite(percent.posX)).toBe(true);
        expect(Number.isFinite(percent.posY)).toBe(true);
        expect(Number.isFinite(percent.width)).toBe(true);
        expect(Number.isFinite(percent.height)).toBe(true);
    });
});

describe("resolveTrendBoxFromPercentOverrides — overrides % por eje, auto si no se toca, null si no cabe", () => {
    const center = { x: 150, y: 150 };
    const viewport = { width: 300, height: 300 };
    const auto: Box = { x: -50, y: 20, width: 100, height: 30 };

    it("sin ninguna sobreescritura, devuelve la MISMA referencia que `auto` (idéntico bit a bit, sin pasar por %)", () => {
        expect(resolveTrendBoxFromPercentOverrides(auto, {}, center, viewport)).toBe(auto);
    });

    it("si no hay caja automática (no cabe), no se crea una desde las sobreescrituras", () => {
        expect(resolveTrendBoxFromPercentOverrides(null, { posX: 10, posY: 90, width: 20, height: 10 }, center, viewport)).toBeNull();
    });

    it("sobreescribir sólo `width` (%) conserva posX/posY/height automáticos (derivados de `auto`) y aplica el nuevo ancho", () => {
        const autoPercent = boxToPercent(auto, center, viewport);
        const result = resolveTrendBoxFromPercentOverrides(auto, { width: 50 }, center, viewport)!;
        const resultPercent = boxToPercent(result, center, viewport);
        expect(resultPercent.width).toBeCloseTo(50, 6);
        expect(resultPercent.posX).toBeCloseTo(autoPercent.posX, 6);
        expect(resultPercent.posY).toBeCloseTo(autoPercent.posY, 6);
        expect(resultPercent.height).toBeCloseTo(autoPercent.height, 6);
    });

    it("sobreescribir los 4 ejes da exactamente la caja que describe ese % (independiente de `auto`)", () => {
        const overrides = { posX: 40, posY: 80, width: 25, height: 15 };
        const result = resolveTrendBoxFromPercentOverrides(auto, overrides, center, viewport)!;
        expect(boxToPercent(result, center, viewport)).toEqual({
            posX: expect.closeTo(40, 6),
            posY: expect.closeTo(80, 6),
            width: expect.closeTo(25, 6),
            height: expect.closeTo(15, 6),
        });
    });
});
