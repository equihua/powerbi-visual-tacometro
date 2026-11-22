import { describe, expect, it } from "vitest";
import {
    computeGaugeFrame, computeGaugeLayout, computeInnerTrendBox, FOOTER_GAP, FOOTER_HEIGHT, MARKER_OVERHANG, TREND_MIN_HEIGHT,
} from "../src/components/layout";
import { bandRadii } from "../src/components/arcUtils";

describe("computeGaugeLayout — reparto vertical (0.3.1.0: sólo el pie reserva alto)", () => {
    it("sin pie, el medidor ocupa todo el alto (diseño 0.2.0.0 intacto)", () => {
        expect(computeGaugeLayout(300, 300, { footer: false })).toEqual({
            gaugeHeight: 300,
            footer: null,
        });
    });

    it("con pie reserva FOOTER_HEIGHT en la parte inferior", () => {
        expect(computeGaugeLayout(300, 300, { footer: true })).toEqual({
            gaugeHeight: 300 - FOOTER_HEIGHT,
            footer: { y: 300 - FOOTER_HEIGHT, height: FOOTER_HEIGHT },
        });
    });

    it("la sparkline ya no reserva alto: con pie el medidor conserva todo menos el pie (300x300 → 300x260)", () => {
        expect(computeGaugeLayout(300, 300, { footer: true })).toEqual({
            gaugeHeight: 260,
            footer: { y: 260, height: 40 },
        });
    });

    it("el pie queda anclado al borde inferior en cualquier alto", () => {
        for (const height of [80, 180, 300, 600]) {
            const footer = computeGaugeLayout(300, height, { footer: true }).footer;
            expect(footer && footer.y + footer.height).toBe(height);
        }
    });

    it("si no cabe (alto < 2x el pie) no reserva nada para conservar el medidor", () => {
        expect(computeGaugeLayout(300, 79, { footer: true })).toEqual({
            gaugeHeight: 79,
            footer: null,
        });
    });
});

describe("computeInnerTrendBox — sparkline dentro del semicírculo, bajo el número central", () => {
    it("caja centrada en x, debajo del centro y proporcional al radio interior (medidor 300x260, grosor 20)", () => {
        const radius = 260 / 2 / 0.95 - 10;
        const inner = bandRadii(radius, 20).innerRadius;
        const box = computeInnerTrendBox(radius, 20);
        expect(box).not.toBeNull();
        expect(box!.x).toBeCloseTo(-inner * 0.75, 6);
        expect(box!.width).toBeCloseTo(inner * 1.5, 6);
        expect(box!.y).toBeCloseTo(inner * 0.1, 6);
        expect(box!.height).toBeCloseTo(inner * 0.5, 6);
    });

    it("las cuatro esquinas quedan dentro del círculo interior (no invade la banda con ningún ángulo)", () => {
        for (const [radius, thickness] of [[126.84, 20], [60, 10], [300, 40]]) {
            const inner = bandRadii(radius, thickness).innerRadius;
            const box = computeInnerTrendBox(radius, thickness)!;
            for (const x of [box.x, box.x + box.width]) {
                for (const y of [box.y, box.y + box.height]) {
                    expect(Math.hypot(x, y)).toBeLessThan(inner);
                }
            }
            expect(box.y).toBeGreaterThan(0);
        }
    });

    it("si el radio interior es muy chico (caja < TREND_MIN_HEIGHT) no hay sparkline", () => {
        // inner = radius*0.95 - 10 = 2*TREND_MIN_HEIGHT - 1 → alto de la caja < TREND_MIN_HEIGHT
        const radius = (TREND_MIN_HEIGHT * 2 - 1 + 10) / 0.95;
        expect(computeInnerTrendBox(radius, 20)).toBeNull();
    });
});

/** Extremo inferior (y > 0 hacia abajo) del contenido del medidor relativo a su centro, muestreado. */
function contentBottom(radius: number, thickness: number, startDeg: number, endDeg: number): number {
    const { outerRadius } = bandRadii(radius, thickness);
    let bottom = 0;
    for (let i = 0; i <= 720; i++) {
        const a = ((startDeg + ((endDeg - startDeg) * i) / 720) * Math.PI) / 180;
        // Banda + sobresaliente máximo de marcadores (triángulo: tip a outer+1, base a outer+11).
        bottom = Math.max(bottom, -Math.cos(a) * (outerRadius + MARKER_OVERHANG));
    }
    const box = computeInnerTrendBox(radius, thickness);
    return Math.max(bottom, box ? box.y + box.height : 0);
}

/** Extremo superior de la banda (sin sobresaliente, igual que 0.2.0.0) relativo al centro. */
function arcTop(radius: number, thickness: number, startDeg: number, endDeg: number): number {
    const { outerRadius } = bandRadii(radius, thickness);
    let top = 0;
    for (let i = 0; i <= 720; i++) {
        const a = ((startDeg + ((endDeg - startDeg) * i) / 720) * Math.PI) / 180;
        top = Math.max(top, Math.cos(a) * outerRadius);
    }
    return top;
}

const legacyRadius = (w: number, h: number, t: number) => Math.min(w, h) / 2 / 0.95 - t / 2;

describe("computeGaugeFrame — 0.3.2.0: medidor pegado al pie (menos hueco vertical)", () => {
    const T = 20;

    it("sin pie el encuadre es el de 0.2.0.0 (radio por el lado menor, centro de la caja)", () => {
        expect(computeGaugeFrame(300, 300, T, -120, 60, false)).toEqual({ radius: legacyRadius(300, 300, T), cx: 150, cy: 150 });
        expect(computeGaugeFrame(480, 300, T, -90, 90, false)).toEqual({ radius: legacyRadius(480, 300, T), cx: 240, cy: 150 });
    });

    it("con pie, en los tamaños válidos el contenido inferior queda a FOOTER_GAP del pie y el hueco se reduce", () => {
        for (const [w, h] of [[300, 300], [480, 300], [220, 200]]) {
            const gh = h - FOOTER_HEIGHT;
            const frame = computeGaugeFrame(w, gh, T, -120, 60, true);
            const bottom = frame.cy + contentBottom(frame.radius, T, -120, 60);
            expect(bottom, `${w}x${h}`).toBeCloseTo(gh - FOOTER_GAP, 1);
            // Hueco con el encuadre 0.3.1.0 (centro gh/2, radio por el lado menor).
            const oldBottom = gh / 2 + contentBottom(legacyRadius(w, gh, T), T, -120, 60);
            expect(gh - bottom, `${w}x${h}`).toBeLessThan((gh - oldBottom) / 2);
        }
    });

    it("con pie y cualquier ángulo: no rebasa el ancho ni el borde superior y nunca invade el pie", () => {
        for (const [w, h] of [[300, 300], [480, 300], [220, 200], [600, 300], [300, 500], [180, 160]]) {
            const gh = h - FOOTER_HEIGHT;
            for (const [s, e] of [[-120, 60], [-90, 90], [-135, 135], [-60, 120], [0, 180], [-180, 180]]) {
                const frame = computeGaugeFrame(w, gh, T, s, e, true);
                const label = `${w}x${h} ${s}..${e}`;
                expect(frame.radius, label).toBeLessThanOrEqual(legacyRadius(w, w, T) + 1e-9);
                expect(frame.cx, label).toBe(w / 2);
                expect(frame.cy - arcTop(frame.radius, T, s, e), label).toBeGreaterThanOrEqual(-1e-9);
                // Banda + marcadores + sparkline terminan a FOOTER_GAP (o más) del pie.
                expect(frame.cy + contentBottom(frame.radius, T, s, e), label).toBeLessThanOrEqual(gh - FOOTER_GAP + 1e-6);
            }
        }
    });

    it("300x300 (-120..60): radio por el ancho y el centro baja para cerrar el hueco", () => {
        const frame = computeGaugeFrame(300, 260, T, -120, 60, true);
        expect(frame.radius).toBeCloseTo(legacyRadius(300, 300, T), 9);
        // Contenido inferior: marcador en -120° → 0.5·(outer + MARKER_OVERHANG) = 0.5·161.5.
        expect(frame.cy).toBeCloseTo(260 - FOOTER_GAP - 0.5 * (150.5 + MARKER_OVERHANG), 9);
    });

    it("arco sin 0° (p. ej. invertido 90°..270°): el número central (alto = fontSize) no se sale por arriba", () => {
        for (const [s, e] of [[90, 270], [100, 200], [-200, -100]]) {
            const frame = computeGaugeFrame(600, 260, T, s, e, true, 20);
            expect(frame.cy, `${s}..${e}`).toBeGreaterThanOrEqual(20 - 1e-9);
            expect(frame.cy + contentBottom(frame.radius, T, s, e), `${s}..${e}`).toBeLessThanOrEqual(260 - FOOTER_GAP + 1e-6);
        }
        // Con arco superior normal el número nunca limita (la banda llega más arriba): mismo encuadre que sin él.
        expect(computeGaugeFrame(300, 260, T, -120, 60, true, 20)).toEqual(computeGaugeFrame(300, 260, T, -120, 60, true));
    });

    it("número central más alto que el espacio disponible: el encuadre sigue siendo finito y positivo", () => {
        for (const [s, e] of [[-90, 90], [90, 270], [-120, 60]]) {
            const frame = computeGaugeFrame(300, 40, T, s, e, true, 60);
            expect(Number.isFinite(frame.radius) && frame.radius > 0, `${s}..${e}`).toBe(true);
            expect(Number.isFinite(frame.cy), `${s}..${e}`).toBe(true);
        }
    });

    it("círculo completo: el radio se ajusta para que los marcadores inferiores no invadan el pie", () => {
        const frame = computeGaugeFrame(300, 260, T, -180, 180, true);
        const outer = bandRadii(frame.radius, T).outerRadius;
        expect(frame.cy).toBeCloseTo(outer, 9);
        expect(frame.cy + outer + MARKER_OVERHANG).toBeCloseTo(260 - FOOTER_GAP, 9);
    });
});
