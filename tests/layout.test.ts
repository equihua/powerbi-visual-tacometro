import { describe, expect, it } from "vitest";
import {
    computeGaugeFrame, computeGaugeLayout, computeInnerTrendBox, FOOTER_GAP, FOOTER_HEIGHT, MARKER_OVERHANG, TREND_MIN_HEIGHT,
    TREND_CURRENT_POINT_RADIUS, TREND_EDGE_CLEARANCE, TREND_PADDING,
} from "../src/components/layout";
import { bandRadii, semaphoreIndicatorRing } from "../src/components/arcUtils";

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
        const box = computeInnerTrendBox(radius, 20, -90, 90);
        expect(box).not.toBeNull();
        // 0.3.3.1: ancho por el contenido (puntos), no por las esquinas de la caja; ver describe 0.3.3.1.
        expect(box!.x).toBeCloseTo(-box!.width / 2, 6);
        expect(box!.y).toBeCloseTo(inner * 0.1, 6);
        expect(box!.height).toBeCloseTo(inner * 0.5, 6);
    });

    it("si el radio interior es muy chico (caja < TREND_MIN_HEIGHT) no hay sparkline", () => {
        // inner = radius*0.95 - 10 = 2*TREND_MIN_HEIGHT - 1 → alto de la caja < TREND_MIN_HEIGHT
        const radius = (TREND_MIN_HEIGHT * 2 - 1 + 10) / 0.95;
        expect(computeInnerTrendBox(radius, 20, -120, 60)).toBeNull();
    });
});

/**
 * Oráculo independiente (muestreo denso): los centros de los puntos de la sparkline pueden estar en cualquier
 * lugar del rectángulo [−X, X] × [y0 + relleno, y1 − relleno]; cada punto ocupa su radio máximo más la holgura.
 * Seguro ⇔ ese contenido queda dentro del círculo interior de la banda y fuera del anillo del indicador del
 * semáforo en el barrido del arco. Basta el perímetro del rectángulo (el anillo no cabe dentro de él).
 */
function contentIsSafe(radius: number, thickness: number, lo: number, hi: number, X: number): boolean {
    const inner = bandRadii(radius, thickness).innerRadius;
    const ring = semaphoreIndicatorRing(inner, thickness);
    const top = inner * 0.1 + TREND_PADDING;
    const bottom = inner * 0.6 - TREND_PADDING;
    const reach = TREND_CURRENT_POINT_RADIUS + TREND_EDGE_CLEARANCE;
    const inSweep = (deg: number) => [-360, 0, 360].some((k) => deg + k >= Math.min(lo, hi) && deg + k <= Math.max(lo, hi));
    const centers: Array<[number, number]> = [];
    for (let i = 0; i <= 200; i++) {
        const y = top + ((bottom - top) * i) / 200;
        centers.push([-X, y], [X, y]);
        const x = -X + (2 * X * i) / 200;
        centers.push([x, top], [x, bottom]);
    }
    for (const [cx, cy] of centers) {
        for (let k = 0; k < 180; k++) {
            const a = (k * Math.PI) / 90;
            const x = cx + reach * Math.cos(a);
            const y = cy + reach * Math.sin(a);
            const rho = Math.hypot(x, y);
            if (rho > inner + 1e-9) return false;
            const deg = (Math.atan2(x, -y) * 180) / Math.PI;
            if (rho >= ring.innerRadius - 1e-9 && rho <= ring.outerRadius && inSweep(deg)) return false;
        }
    }
    return true;
}

/** Mayor X seguro según el oráculo (búsqueda binaria). */
function oracleHalfSpan(radius: number, thickness: number, lo: number, hi: number): number {
    let a = 0;
    let b = bandRadii(radius, thickness).innerRadius;
    for (let i = 0; i < 24; i++) {
        const m = (a + b) / 2;
        if (contentIsSafe(radius, thickness, lo, hi, m)) a = m; else b = m;
    }
    return a;
}

describe("computeInnerTrendBox 0.3.3.1 — ancho máximo técnicamente seguro (contenido, no esquinas de la caja)", () => {
    const configs: Array<[number, number]> = [[126.84, 20], [147.89, 20], [60, 10], [300, 40], [45, 20]];
    const sweeps: Array<[number, number]> = [[-120, 60], [-90, 90], [-135, 135], [-60, 120], [-150, 30]];

    it("medidor por defecto (300x260, -120°..60°, grosor 20): limita el anillo del semáforo en -120°", () => {
        const radius = (130.5 + 10) / 0.95; // inner 130.5 (tarjeta 300x300 con pie)
        const ring = semaphoreIndicatorRing(130.5, 20);
        expect(ring.innerRadius).toBeCloseTo(122.5, 9);
        const box = computeInnerTrendBox(radius, 20, -120, 60)!;
        const halfSpan = Math.sin((120 * Math.PI) / 180) * 122.5 - TREND_CURRENT_POINT_RADIUS - TREND_EDGE_CLEARANCE;
        expect(box.width).toBeCloseTo(2 * (halfSpan + TREND_PADDING), 6); // 215.18
        // Más ancho que 0.3.3.0 (cuerda en 0.6·inner con holgura 0.995 → 207.76).
        expect(box.width).toBeGreaterThan(130.5 * 1.6 * 0.995);
    });

    it("sin anillo bajo la horizontal (-90°..90°) limita el círculo interior menos el radio del punto y la holgura", () => {
        const radius = (130.5 + 10) / 0.95;
        const box = computeInnerTrendBox(radius, 20, -90, 90)!;
        const halfSpan = Math.sqrt((130.5 - TREND_CURRENT_POINT_RADIUS - TREND_EDGE_CLEARANCE) ** 2 - (0.6 * 130.5 - TREND_PADDING) ** 2);
        expect(box.width).toBeCloseTo(2 * (halfSpan + TREND_PADDING), 6); // 218.39
    });

    for (const [radius, thickness] of configs) {
        for (const [lo, hi] of sweeps) {
            it(`r=${radius} grosor=${thickness} ${lo}°..${hi}°: seguro (oráculo) y máximo (a < 0.1 px del oráculo)`, () => {
                const box = computeInnerTrendBox(radius, thickness, lo, hi);
                expect(box).not.toBeNull();
                const X = box!.width / 2 - TREND_PADDING;
                expect(contentIsSafe(radius, thickness, lo, hi, X)).toBe(true);
                expect(X).toBeGreaterThan(oracleHalfSpan(radius, thickness, lo, hi) - 0.1);
                // Alto y posición vertical intactos: el pie y el encuadre no cambian.
                const inner = bandRadii(radius, thickness).innerRadius;
                expect(box!.y).toBeCloseTo(inner * 0.1, 9);
                expect(box!.height).toBeCloseTo(inner * 0.5, 9);
            });
        }
    }
});

describe("computeInnerTrendBox — 0.3.4.0: sin «Mostrar Rangos» no existe el anillo del semáforo (semaphore-indicator) que evitar", () => {
    // Gauge.tsx sólo dibuja el anillo delgado cuando showRanges está activo (semaphore-indicator);
    // con showRanges=false el performance-arc ocupa todo el grosor de la banda y no hay anillo que
    // el contenido de la sparkline pudiera tocar: el único límite relevante es el círculo interior.
    const radius = (130.5 + 10) / 0.95; // inner 130.5 (tarjeta 300x300 con pie), igual que el caso 0.3.3.1.

    it("quinto parámetro showRanges por omisión es true: mismo ancho que antes (215.18, limitado por el anillo)", () => {
        const withDefault = computeInnerTrendBox(radius, 20, -120, 60)!;
        const withExplicitTrue = computeInnerTrendBox(radius, 20, -120, 60, true)!;
        expect(withDefault.width).toEqual(withExplicitTrue.width);
        expect(withDefault.width).toBeCloseTo(215.18, 1);
    });

    it("showRanges=false: el ancho crece al del círculo interior (sin la restricción del anillo), igual que -90°..90°", () => {
        const ringConstrained = computeInnerTrendBox(radius, 20, -120, 60, true)!;
        const circleOnly = computeInnerTrendBox(radius, 20, -120, 60, false)!;
        expect(circleOnly.width).toBeGreaterThan(ringConstrained.width);

        const halfSpan = Math.sqrt((130.5 - TREND_CURRENT_POINT_RADIUS - TREND_EDGE_CLEARANCE) ** 2 - (0.6 * 130.5 - TREND_PADDING) ** 2);
        expect(circleOnly.width).toBeCloseTo(2 * (halfSpan + TREND_PADDING), 6); // 218.39, mismo límite que -90°..90°

        // Alto y posición vertical siguen intactos: showRanges sólo afecta el ancho.
        expect(circleOnly.y).toBeCloseTo(ringConstrained.y, 9);
        expect(circleOnly.height).toBeCloseTo(ringConstrained.height, 9);
    });

    it("showRanges=false y barrido que no alcanza el círculo (-90°..90°, donde el anillo tampoco limitaba): mismo ancho que antes", () => {
        const withRanges = computeInnerTrendBox(radius, 20, -90, 90, true)!;
        const withoutRanges = computeInnerTrendBox(radius, 20, -90, 90, false)!;
        expect(withoutRanges.width).toBeCloseTo(withRanges.width, 9);
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
    const box = computeInnerTrendBox(radius, thickness, startDeg, endDeg);
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
