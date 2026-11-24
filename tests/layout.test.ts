import { describe, expect, it } from "vitest";
import {
    computeGaugeFrame, computeGaugeLayout, computeInnerTrendBox, FOOTER_GAP, FOOTER_HEIGHT, MARKER_OVERHANG, TREND_MIN_HEIGHT,
    TREND_CURRENT_POINT_RADIUS, TREND_EDGE_CLEARANCE, TREND_PADDING,
} from "../src/components/layout";
import { bandRadii, semaphoreIndicatorRing } from "../src/components/arcUtils";

/** Ancho de tarjeta "sin límite práctico" para pruebas que sólo quieren ejercitar el límite geométrico (banda/anillo). */
const HUGE_WIDTH = 1_000_000;

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
    it("caja centrada en x (barrido simétrico respecto al vertical, sin tope de tarjeta), debajo del centro y proporcional al radio interior (medidor 300x260, grosor 20)", () => {
        const radius = 260 / 2 / 0.95 - 10;
        const inner = bandRadii(radius, 20).innerRadius;
        const box = computeInnerTrendBox(radius, 20, -90, 90, HUGE_WIDTH);
        expect(box).not.toBeNull();
        // -90°..90° es simétrico respecto al eje vertical: ambos lados dan el mismo medio ancho, así
        // que la caja sigue centrada en x aunque el cálculo ya no sea un único ancho simétrico.
        expect(box!.x).toBeCloseTo(-box!.width / 2, 6);
        expect(box!.y).toBeCloseTo(inner * 0.1, 6);
        // 0.3.4.1: TREND_HEIGHT_FACTOR bajó de 0.5 a 0.3 (ver comentario en layout.ts) para liberar
        // más ancho seguro en tarjetas "paisaje" (1 medidor grande) sin tocar banda/anillo/arco.
        expect(box!.height).toBeCloseTo(inner * 0.3, 6);
    });

    it("si el radio interior es muy chico (caja < TREND_MIN_HEIGHT) no hay sparkline, sin importar el ancho de tarjeta", () => {
        // 0.3.4.1: alto de caja = inner·0.3 (antes inner·0.5); inner = TREND_MIN_HEIGHT/0.3 - 1 →
        // alto = TREND_MIN_HEIGHT - 0.3, apenas por debajo de TREND_MIN_HEIGHT.
        const radius = (TREND_MIN_HEIGHT / 0.3 - 1 + 10) / 0.95;
        expect(computeInnerTrendBox(radius, 20, -120, 60, HUGE_WIDTH)).toBeNull();
        expect(computeInnerTrendBox(radius, 20, -120, 60, 300)).toBeNull();
    });
});

/**
 * Oráculo independiente (muestreo denso) por LADO: dado el medio ancho de cada lado (xLeft >= 0 a la
 * izquierda, xRight >= 0 a la derecha, pueden ser distintos desde 0.3.5.0), ¿el contenido (centros +
 * TREND_CURRENT_POINT_RADIUS + TREND_EDGE_CLEARANCE) evita la banda (+ sobresaliente de marcadores) y,
 * si showRanges, el anillo del indicador del semáforo, dentro del barrido real [lo, hi]? A diferencia
 * de 0.3.4.1 y anteriores, la banda YA NO se trata como "cualquier ángulo": sólo es obstáculo donde
 * GaugeBackground/GaugeRanges/PerformanceArc realmente la dibujan (el mismo barrido).
 */
function contentIsSafe(
    radius: number, thickness: number, lo: number, hi: number, xLeft: number, xRight: number, showRanges: boolean = true
): boolean {
    const { innerRadius: inner, outerRadius: outer } = bandRadii(radius, thickness);
    const ring = showRanges ? semaphoreIndicatorRing(inner, thickness) : null;
    const top = inner * 0.1 + TREND_PADDING;
    const bottom = inner * 0.4 - TREND_PADDING;
    const reach = TREND_CURRENT_POINT_RADIUS + TREND_EDGE_CLEARANCE;
    const inSweep = (deg: number) => [-360, 0, 360].some((k) => deg + k >= Math.min(lo, hi) && deg + k <= Math.max(lo, hi));
    // 0.3.5.0: el medio ancho candidato por lado ya no está acotado por el círculo de la banda (puede
    // llegar al ancho de tarjeta, órdenes de magnitud mayor que el medidor). Muestrear con un número FIJO
    // de pasos sobre todo ese rango (como antes de 0.3.5.0) deja el paso demasiado grueso para detectar la
    // ventana de colisión real (típicamente un orden de magnitud menor que el radio del medidor) cuando el
    // candidato es enorme — falso negativo de colisión, no del código bajo prueba sino de este oráculo.
    // Corrección: acotar el muestreo a un horizonte puramente geométrico, independiente de cualquier
    // fórmula de producción: más allá de 3·(outer + MARKER_OVERHANG) — el radio exterior de CUALQUIER
    // obstáculo modelado aquí, banda+sobresaliente o anillo, ambos ⊆ [0, outer+MARKER_OVERHANG] — un punto
    // con esa coordenada x ya tiene ρ ≥ |x| > ese radio exterior sin importar el ángulo, así que no hay
    // nada que muestrear ahí (hecho geométrico puro, no asume nada sobre cómo compute InnerTrendBox decide
    // el ancho). Si [0, horizonte] resulta seguro, [horizonte, xLeft/xRight] lo es incondicionalmente.
    const horizon = 3 * (outer + MARKER_OVERHANG) + 50;
    const sampledLeft = Math.min(xLeft, horizon);
    const sampledRight = Math.min(xRight, horizon);
    const centers: Array<[number, number]> = [];
    for (let i = 0; i <= 400; i++) {
        const y = top + ((bottom - top) * i) / 400;
        centers.push([-sampledLeft, y], [sampledRight, y]);
        const x = -sampledLeft + ((sampledRight - -sampledLeft) * i) / 400;
        centers.push([x, top], [x, bottom]);
    }
    for (const [cx, cy] of centers) {
        for (let k = 0; k < 180; k++) {
            const a = (k * Math.PI) / 90;
            const x = cx + reach * Math.cos(a);
            const y = cy + reach * Math.sin(a);
            const rho = Math.hypot(x, y);
            const deg = (Math.atan2(x, -y) * 180) / Math.PI;
            const within = (r0: number, r1: number) => rho >= r0 - 1e-9 && rho <= r1 + 1e-9 && inSweep(deg);
            if (within(inner, outer + MARKER_OVERHANG)) return false;
            if (ring && within(ring.innerRadius, ring.outerRadius)) return false;
        }
    }
    return true;
}

/**
 * Mayor medio ancho seguro para UN lado (el otro fijo en 0: por construcción cada lado de la caja sólo
 * depende de su propio medio ancho — las esquinas que se revisan son (0, top/bottom) y (±x, top/bottom)
 * — así que fijar el otro lado en 0 no cambia el resultado y aísla la pregunta a ese lado).
 */
function oracleSideMax(
    radius: number, thickness: number, lo: number, hi: number, sign: -1 | 1, cap: number, showRanges: boolean = true
): number {
    let a = 0;
    let b = cap;
    for (let i = 0; i < 28; i++) {
        const m = (a + b) / 2;
        const safe = sign === -1 ? contentIsSafe(radius, thickness, lo, hi, m, 0, showRanges) : contentIsSafe(radius, thickness, lo, hi, 0, m, showRanges);
        if (safe) a = m; else b = m;
    }
    return a;
}

describe("computeInnerTrendBox 0.3.5.0 — medio ancho POR LADO, acotado por el ancho de tarjeta", () => {
    it("medidor por defecto (300x260, -120°..60°, grosor 20), tarjeta ancha (sin tope real): limita el anillo del semáforo sólo del lado izquierdo (el barrido no llega al derecho)", () => {
        const radius = (130.5 + 10) / 0.95; // inner 130.5 (tarjeta 300x300 con pie)
        const ring = semaphoreIndicatorRing(130.5, 20);
        expect(ring.innerRadius).toBeCloseTo(122.5, 9);
        const box = computeInnerTrendBox(radius, 20, -120, 60, HUGE_WIDTH)!;
        const reach = TREND_CURRENT_POINT_RADIUS + TREND_EDGE_CLEARANCE;
        const bottom = 130.5 * 0.4 - TREND_PADDING; // 46.2
        // Izquierda: igual que el único ancho simétrico de 0.3.4.1 (229.16/2 - PADDING = 108.58): el
        // barrido SÍ llega a ese lado (ángulo de la esquina ~-113° está en [-120°, 60°]), así que el
        // anillo del semáforo sigue limitando igual que antes.
        const halfSpanLeft = Math.sqrt((ring.innerRadius - reach) ** 2 - bottom ** 2);
        const halfLeft = -box.x - TREND_PADDING;
        expect(halfLeft).toBeCloseTo(halfSpanLeft, 4); // 108.58
        // Derecha: el barrido NUNCA llega a ese lado (para cualquier x > 0, el ángulo de ambas esquinas
        // cae en (90°, 180°), fuera de [-120°, 60°]) — sin obstáculo, topa con el ancho "ilimitado" de
        // la prueba (HUGE_WIDTH / 2 - 2·PADDING).
        const halfRight = box.width - halfLeft - 2 * TREND_PADDING;
        expect(halfRight).toBeCloseTo(HUGE_WIDTH / 2 - 2 * TREND_PADDING, 4);
        expect(halfRight).toBeGreaterThan(halfLeft * 5); // claramente asimétrica
    });

    it("tope por ancho de tarjeta: con una tarjeta real (430 px) el lado libre topa en cardWidth/2 - 2·PADDING, no crece sin límite", () => {
        const radius = (130.5 + 10) / 0.95;
        const cardWidth = 430;
        const box = computeInnerTrendBox(radius, 20, -120, 60, cardWidth)!;
        const halfLeft = -box.x - TREND_PADDING;
        const halfRight = box.width - halfLeft - 2 * TREND_PADDING;
        expect(halfRight).toBeCloseTo(cardWidth / 2 - 2 * TREND_PADDING, 9); // 203
        expect(halfLeft).toBeLessThan(halfRight);
        // Resultado real citado en el diagnóstico (poa_inicio, 430x338 ⇒ radius mayor que éste; aquí sólo
        // se confirma el mecanismo del tope, no la cifra final de campo, que se verifica con CDP).
    });

    it("tarjeta angosta: el tope de ancho puede llegar a 0 (Math.max(0, …)) sin romper la caja", () => {
        const radius = (130.5 + 10) / 0.95;
        const box = computeInnerTrendBox(radius, 20, -120, 60, 2 * TREND_PADDING - 1)!; // cardWidth/2 - 2·PADDING < 0
        expect(box.width).toBeCloseTo(2 * TREND_PADDING, 9); // ambos lados en 0
    });

    it("barrido simétrico respecto al vertical (-90°..90°): ambos lados dan el mismo medio ancho (ninguno privilegiado)", () => {
        const radius = (130.5 + 10) / 0.95;
        const box = computeInnerTrendBox(radius, 20, -90, 90, HUGE_WIDTH)!;
        const halfLeft = -box.x - TREND_PADDING;
        const halfRight = box.width - halfLeft - 2 * TREND_PADDING;
        expect(halfRight).toBeCloseTo(halfLeft, 6);
        // Sin banda en ningún ángulo por debajo del centro con este barrido (ver test de medidor por
        // defecto arriba, mismo razonamiento aplicado a ambos lados): topa con el ancho "ilimitado".
        expect(halfLeft).toBeCloseTo(HUGE_WIDTH / 2 - 2 * TREND_PADDING, 4);
    });

    it("círculo completo (-180°..180°): la banda está en TODOS los ángulos, ambos lados vuelven a topar igual (regresión exacta a 0.3.4.1)", () => {
        const radius = (130.5 + 10) / 0.95;
        const box = computeInnerTrendBox(radius, 20, -180, 180, HUGE_WIDTH)!;
        const halfLeft = -box.x - TREND_PADDING;
        const halfRight = box.width - halfLeft - 2 * TREND_PADDING;
        expect(halfRight).toBeCloseTo(halfLeft, 6);
        // Mismo valor exacto que el único "halfSpan" simétrico de 0.3.4.1 para este caso (229.16/2 - 6).
        expect(box.width).toBeCloseTo(229.16, 1);
    });

    it("sin anillo bajo la horizontal (-90°..90°, showRanges=false o true): el límite es sólo la banda (círculo interior), igual por ambos lados", () => {
        const radius = (130.5 + 10) / 0.95;
        const box = computeInnerTrendBox(radius, 20, -90, 90, 300)!;
        const halfLeft = -box.x - TREND_PADDING;
        const halfRight = box.width - halfLeft - 2 * TREND_PADDING;
        expect(halfLeft).toBeCloseTo(halfRight, 6);
        expect(halfLeft).toBeCloseTo(300 / 2 - 2 * TREND_PADDING, 6); // tope de tarjeta, no el círculo (300 es angosta)
    });

    for (const [radius, thickness] of [[126.84, 20], [147.89, 20], [65, 10], [300, 40], [75, 20]] as Array<[number, number]>) {
        for (const [lo, hi] of [[-120, 60], [-90, 90], [-135, 135], [-60, 120], [-150, 30]] as Array<[number, number]>) {
            it(`r=${radius} grosor=${thickness} ${lo}°..${hi}°: cada lado es seguro (oráculo) y máximo (a < 0.1 px del oráculo)`, () => {
                const box = computeInnerTrendBox(radius, thickness, lo, hi, HUGE_WIDTH);
                expect(box).not.toBeNull();
                const halfLeft = -box!.x - TREND_PADDING;
                const halfRight = box!.width - halfLeft - 2 * TREND_PADDING;
                expect(contentIsSafe(radius, thickness, lo, hi, halfLeft, halfRight)).toBe(true);
                // El tope de "ancho ilimitado" de la propia fórmula es HUGE_WIDTH/2 - 2·PADDING: el
                // oráculo debe buscar en ese mismo tope (no en HUGE_WIDTH tal cual) para comparar justo.
                const cap = HUGE_WIDTH / 2 - 2 * TREND_PADDING;
                expect(halfLeft).toBeGreaterThan(oracleSideMax(radius, thickness, lo, hi, -1, cap) - 0.1);
                expect(halfRight).toBeGreaterThan(oracleSideMax(radius, thickness, lo, hi, 1, cap) - 0.1);
                // Alto y posición vertical intactos: el pie y el encuadre no cambian.
                const inner = bandRadii(radius, thickness).innerRadius;
                expect(box!.y).toBeCloseTo(inner * 0.1, 9);
                expect(box!.height).toBeCloseTo(inner * 0.3, 9);
            });
        }
    }
});

describe("computeInnerTrendBox — 0.3.4.0: sin «Mostrar Rangos» no existe el anillo del semáforo (semaphore-indicator) que evitar", () => {
    // Gauge.tsx sólo dibuja el anillo delgado cuando showRanges está activo; con showRanges=false el
    // performance-arc ocupa todo el grosor de la banda y no hay anillo que el contenido de la sparkline
    // pudiera tocar: el único límite relevante es la banda (círculo interior, paso 1).
    const radius = (130.5 + 10) / 0.95; // inner 130.5 (tarjeta 300x300 con pie), igual que el caso 0.3.3.1.

    it("sexto parámetro showRanges por omisión es true: mismo ancho que pasarlo explícito", () => {
        const withDefault = computeInnerTrendBox(radius, 20, -120, 60, HUGE_WIDTH)!;
        const withExplicitTrue = computeInnerTrendBox(radius, 20, -120, 60, HUGE_WIDTH, true)!;
        expect(withDefault.width).toEqual(withExplicitTrue.width);
        expect(withDefault.x).toEqual(withExplicitTrue.x);
    });

    it("showRanges=false: el lado izquierdo crece al del círculo interior (sin la restricción del anillo); el derecho no cambia (ya no tenía anillo que evitar)", () => {
        const ringConstrained = computeInnerTrendBox(radius, 20, -120, 60, HUGE_WIDTH, true)!;
        const circleOnly = computeInnerTrendBox(radius, 20, -120, 60, HUGE_WIDTH, false)!;
        const halfLeft = (box: typeof ringConstrained) => -box.x - TREND_PADDING;
        expect(halfLeft(circleOnly)).toBeGreaterThan(halfLeft(ringConstrained));

        const reach = TREND_CURRENT_POINT_RADIUS + TREND_EDGE_CLEARANCE;
        const bottom = 0.4 * 130.5 - TREND_PADDING;
        const expectedLeft = Math.sqrt((130.5 - reach) ** 2 - bottom ** 2);
        expect(halfLeft(circleOnly)).toBeCloseTo(expectedLeft, 6); // 117.22, el límite de 0.3.4.1 sin anillo

        // El derecho ya era "libre" (sin anillo que evitar, el barrido no llega): igual con o sin showRanges.
        const halfRight = (box: typeof ringConstrained) => box.width - halfLeft(box) - 2 * TREND_PADDING;
        expect(halfRight(circleOnly)).toBeCloseTo(halfRight(ringConstrained), 6);

        // Alto y posición vertical siguen intactos: showRanges sólo afecta el ancho.
        expect(circleOnly.y).toBeCloseTo(ringConstrained.y, 9);
        expect(circleOnly.height).toBeCloseTo(ringConstrained.height, 9);
    });

    it("showRanges=false y barrido que no alcanza el círculo (-90°..90°, donde el anillo tampoco limitaba): mismo ancho que antes", () => {
        const withRanges = computeInnerTrendBox(radius, 20, -90, 90, HUGE_WIDTH, true)!;
        const withoutRanges = computeInnerTrendBox(radius, 20, -90, 90, HUGE_WIDTH, false)!;
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
    // Ancho de tarjeta grande: estas pruebas (computeGaugeFrame) sólo necesitan el alto de la caja
    // (box.y + box.height), que no depende del ancho de tarjeta; HUGE_WIDTH evita que el tope de ancho
    // interfiera con lo que se está midiendo aquí.
    const box = computeInnerTrendBox(radius, thickness, startDeg, endDeg, HUGE_WIDTH);
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

/**
 * 0.4.0.0 — Parte A: topMargin/arcScale/offsetY (panel de formato, gaugeCard). Tres pruebas TDD
 * pedidas por el Requerimiento 1 (margen superior == margen inferior con el default FOOTER_GAP),
 * Requerimiento 2 (no-colisión tendencia-arco en los dos tamaños reales de tarjeta) y la
 * retrocompatibilidad bit a bit de computeGaugeFrame cuando se pasan explícitamente los valores de
 * 0.3.5.0 (topMargin=0, arcScale=100, offsetY=0).
 */
describe("computeGaugeFrame — 0.4.0.0: topMargin/arcScale/offsetY (Requerimientos 1 y 3, geometría)", () => {
    const T = 20;

    it("Requerimiento 1 — con topMargin=FOOTER_GAP (default del panel), el margen superior (vértice del arco a y=0) es igual al margen inferior (FOOTER_GAP), en ambos tamaños reales de tarjeta", () => {
        for (const [w, h, label] of [[430, 338, "430x338 (poa_inicio)"], [430, 268, "430x268 (poa_subdireccion/poa_energia_limpia)"]] as Array<[number, number, string]>) {
            const gaugeHeight = h - FOOTER_HEIGHT;
            // fontSize default (50) con showValueLabel activo: mismo centerTextHeight que usa Gauge.tsx por omisión.
            const frame = computeGaugeFrame(w, gaugeHeight, T, -120, 60, true, 50, FOOTER_GAP, 100, 0);
            const topGap = frame.cy - arcTop(frame.radius, T, -120, 60);
            const bottomGap = gaugeHeight - (frame.cy + contentBottom(frame.radius, T, -120, 60));
            expect(topGap, label).toBeCloseTo(FOOTER_GAP, 3);
            expect(bottomGap, label).toBeCloseTo(FOOTER_GAP, 3);
            expect(topGap, label).toBeCloseTo(bottomGap, 3);
        }
    });

    it("Requerimiento 1 — con topMargin=0 (valor por omisión del propio parámetro, NO del panel) el margen superior puede ser menor al inferior: el default FOOTER_GAP del panel es lo que los iguala", () => {
        const gaugeHeight = 338 - FOOTER_HEIGHT;
        const framePanelDefault = computeGaugeFrame(430, gaugeHeight, T, -120, 60, true, 50, FOOTER_GAP, 100, 0);
        const frameNoTopMargin = computeGaugeFrame(430, gaugeHeight, T, -120, 60, true, 50, 0, 100, 0);
        const topGapDefault = framePanelDefault.cy - arcTop(framePanelDefault.radius, T, -120, 60);
        const topGapNoMargin = frameNoTopMargin.cy - arcTop(frameNoTopMargin.radius, T, -120, 60);
        expect(topGapDefault).toBeCloseTo(FOOTER_GAP, 3);
        expect(topGapNoMargin).toBeCloseTo(0, 3);
    });

    it("Requerimiento 2 — con los defaults (topMargin=FOOTER_GAP, arcScale=100, offsetY=0) la sparkline no colisiona con el arco en ninguno de los dos tamaños reales de tarjeta (distancia >= reach > 0)", () => {
        const reach = TREND_CURRENT_POINT_RADIUS + TREND_EDGE_CLEARANCE;
        for (const [w, h, label] of [[430, 338, "430x338 (poa_inicio)"], [430, 268, "430x268 (poa_subdireccion/poa_energia_limpia)"]] as Array<[number, number, string]>) {
            const gaugeHeight = h - FOOTER_HEIGHT;
            const frame = computeGaugeFrame(w, gaugeHeight, T, -120, 60, true, 50, FOOTER_GAP, 100, 0);
            const box = computeInnerTrendBox(frame.radius, T, -120, 60, w, true);
            expect(box, label).not.toBeNull();
            expect(box!.height, label).toBeGreaterThan(TREND_MIN_HEIGHT);
            const halfLeft = -box!.x - TREND_PADDING;
            const halfRight = box!.width - halfLeft - 2 * TREND_PADDING;
            // Oráculo independiente (idéntico al usado arriba en este archivo para computeInnerTrendBox
            // 0.3.5.0): ningún punto del contenido de la sparkline (centros + reach) cae dentro de la
            // banda/marcadores ni del anillo del semáforo dentro del barrido real de la tarjeta.
            expect(contentIsSafe(frame.radius, T, -120, 60, halfLeft, halfRight, true), label).toBe(true);
            // reach > 0 es la holgura mínima garantizada por diseño (ver comentario de TREND_EDGE_CLEARANCE
            // en layout.ts); se deja explícito aquí para que la prueba falle de forma clara si cambiara.
            expect(reach, label).toBeGreaterThan(0);
        }
    });

    it("Requerimiento 3 (retrocompatibilidad) — pasar explícitamente topMargin=0, arcScale=100, offsetY=0 da un resultado IDÉNTICO bit a bit a no pasarlos, para las mismas combinaciones ya cubiertas arriba en este archivo", () => {
        const cases: Array<[number, number, number, number, number, boolean, number?]> = [
            [300, 300, T, -120, 60, false],
            [480, 300, T, -90, 90, false],
            [300, 260, T, -120, 60, true],
            [600, 260, T, 90, 270, true, 20],
            [300, 40, T, -90, 90, true, 60],
            [300, 260, T, -180, 180, true],
        ];
        for (const [w, gh, t, s, e, footer, centerTextHeight] of cases) {
            const withDefaults = centerTextHeight === undefined
                ? computeGaugeFrame(w, gh, t, s, e, footer)
                : computeGaugeFrame(w, gh, t, s, e, footer, centerTextHeight);
            const withExplicitBackCompatValues = centerTextHeight === undefined
                ? computeGaugeFrame(w, gh, t, s, e, footer, 0, 0, 100, 0)
                : computeGaugeFrame(w, gh, t, s, e, footer, centerTextHeight, 0, 100, 0);
            expect(withExplicitBackCompatValues).toEqual(withDefaults);
        }
    });

    it("arcScale < 100 encoge el radio desde el máximo seguro sin mover cx; arcScale=100 no cambia nada respecto al default", () => {
        const gaugeHeight = 260;
        const full = computeGaugeFrame(300, gaugeHeight, T, -120, 60, true, 0, 0, 100, 0);
        const half = computeGaugeFrame(300, gaugeHeight, T, -120, 60, true, 0, 0, 50, 0);
        expect(half.radius).toBeCloseTo(full.radius / 2, 9);
        expect(half.cx).toBe(full.cx);
    });

    it("offsetY desplaza cy exactamente esa cantidad, con o sin pie, sin afectar radius ni cx", () => {
        const withFooter = computeGaugeFrame(300, 260, T, -120, 60, true, 0, FOOTER_GAP, 100, 0);
        const withFooterShifted = computeGaugeFrame(300, 260, T, -120, 60, true, 0, FOOTER_GAP, 100, 15);
        expect(withFooterShifted.cy).toBeCloseTo(withFooter.cy + 15, 9);
        expect(withFooterShifted.radius).toBe(withFooter.radius);
        expect(withFooterShifted.cx).toBe(withFooter.cx);

        const withoutFooter = computeGaugeFrame(300, 260, T, -120, 60, false, 0, 0, 100, 0);
        const withoutFooterShifted = computeGaugeFrame(300, 260, T, -120, 60, false, 0, 0, 100, -10);
        expect(withoutFooterShifted.cy).toBeCloseTo(withoutFooter.cy - 10, 9);
        expect(withoutFooterShifted.radius).toBe(withoutFooter.radius);
    });
});
