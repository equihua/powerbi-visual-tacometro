import { describe, expect, it } from "vitest";
import {
    arcRepresentativePoint,
    fitTrendScale,
    pointDistanceToAnnularSector,
    pointInConvexPolygon,
    segmentDistanceToAnnularSector,
    TREND_MIN_SCALE,
} from "../src/components/trendFit";

/**
 * Homotecia automática anticolisión: reduce la escala de la caja de tendencia (nunca su posición ni su
 * ángulo) hasta que sus 4 esquinas, ya rotadas/escaladas, libren el viewport, el pie y la corona del
 * arco del medidor. Si ni el piso documentado (TREND_MIN_SCALE) libra todo, se reporta explícito
 * (`fits: false`) en vez de recortar el contenido. Escenarios verificados con un oráculo independiente
 * (bisección en Python) — ver bitácora.
 */
describe("pointDistanceToAnnularSector — distancia punto→sector anular (0 = 12 en punto, horario, Y abajo)", () => {
    it("dentro del sector y del rango de radios: distancia 0 (colisión)", () => {
        // ángulo 0° = (0, -ρ); dentro de [50,60] y de [-10,10]°.
        expect(pointDistanceToAnnularSector({ x: 0, y: -55 }, 50, 60, -10, 10)).toBe(0);
    });

    it("dentro del barrido angular pero más cerca del centro que r0: r0 − ρ", () => {
        expect(pointDistanceToAnnularSector({ x: 0, y: -40 }, 50, 60, -10, 10)).toBeCloseTo(10, 9);
    });

    it("dentro del barrido angular pero más lejos que r1: ρ − r1", () => {
        expect(pointDistanceToAnnularSector({ x: 0, y: -70 }, 50, 60, -10, 10)).toBeCloseTo(10, 9);
    });

    it("fuera del barrido angular (90°, perpendicular): la distancia es al borde radial más próximo", () => {
        // (55, 0): ángulo 90°, fuera de [-10,10]; el punto más próximo del sector está en su borde a
        // +10° (el más cercano de los dos bordes angulares) — valor de referencia de un oráculo
        // independiente (distancia punto→segmento calculada aparte, ver bitácora).
        const d = pointDistanceToAnnularSector({ x: 55, y: 0 }, 50, 60, -10, 10);
        expect(d).toBeGreaterThan(0);
        expect(d).toBeCloseTo(67.60129453517797, 6);
    });

    it("barrido de 360° (sin, k>=360): siempre dentro del barrido angular", () => {
        expect(pointDistanceToAnnularSector({ x: 100, y: 100 }, 10, 20, -400, 400)).toBeGreaterThan(0);
        expect(pointDistanceToAnnularSector({ x: 0, y: -15 }, 10, 20, -400, 400)).toBe(0);
    });

    it("sector de radio degenerado (r0 === r1, segmento de longitud 0) fuera del barrido: no divide entre 0", () => {
        // r0=r1=50: el borde angular es un punto, no un segmento; sin la guarda de longitud 0 esto
        // dividiría entre 0 al proyectar sobre el segmento.
        const d = pointDistanceToAnnularSector({ x: 100, y: 0 }, 50, 50, -10, 10);
        expect(Number.isFinite(d)).toBe(true);
        expect(d).toBeGreaterThan(0);
    });
});

describe("fitTrendScale — no reduce si la escala pedida ya libra todo", () => {
    it("sin ningún obstáculo, la escala pedida se devuelve tal cual", () => {
        const result = fitTrendScale(100, 50, { x: 0, y: 0 }, 0, 1, { viewportWidth: 1000, viewportHeight: 1000 });
        expect(result).toEqual({ scale: 1, fits: true });
    });
});

describe("fitTrendScale — colisión con el viewport (fijable reduciendo escala)", () => {
    it("caja 100x50 en (80,10), viewport 150x200: la escala máxima segura es ~0.70", () => {
        const result = fitTrendScale(100, 50, { x: 80, y: 10 }, 0, 1, { viewportWidth: 150, viewportHeight: 200 });
        expect(result.fits).toBe(true);
        expect(result.scale).toBeCloseTo(0.7, 2);
    });
});

describe("fitTrendScale — colisión con el pie (fijable reduciendo escala, sin mover el pivote)", () => {
    it("caja 100x50 en (0,0) rotada -90°, pie en y=100: la escala máxima segura es ~0.50", () => {
        const result = fitTrendScale(100, 50, { x: 0, y: 0 }, -90, 1, {
            viewportWidth: 1000,
            viewportHeight: 1000,
            footerTop: 100,
        });
        expect(result.fits).toBe(true);
        expect(result.scale).toBeCloseTo(0.5, 2);
    });

    it("misma caja, pie en y=70 (ni el piso TREND_MIN_SCALE libra el pie): reporta fits=false, sin forzar recorte", () => {
        const result = fitTrendScale(100, 50, { x: 0, y: 0 }, -90, 1, {
            viewportWidth: 1000,
            viewportHeight: 1000,
            footerTop: 70,
        });
        expect(result).toEqual({ scale: TREND_MIN_SCALE, fits: false });
    });
});

describe("fitTrendScale — colisión con la corona del arco (fijable reduciendo escala)", () => {
    it("caja 8x54.3 justo bajo el centro del arco (desplazado +200 en y para quedar dentro del viewport), sector [-10°,10°] a radio [50,60]: escala máxima ~0.911", () => {
        const result = fitTrendScale(8, 54.3, { x: 0, y: 200 - 54.3 }, 0, 1, {
            viewportWidth: 1000,
            viewportHeight: 1000,
            arc: { center: { x: 0, y: 200 }, innerRadius: 50, outerRadius: 60, startAngle: -10, endAngle: 10 },
        });
        expect(result.fits).toBe(true);
        expect(result.scale).toBeCloseTo(0.911, 2);
    });
});

describe("fitTrendScale — nunca cambia el pivote ni el ángulo, sólo la escala", () => {
    it("la esquina inferior izquierda (pivote) queda en el mismo punto absoluto, reduzca o no la escala", () => {
        const boxOrigin = { x: 0, y: 0 };
        const result = fitTrendScale(100, 50, boxOrigin, -90, 1, {
            viewportWidth: 1000,
            viewportHeight: 1000,
            footerTop: 100,
        });
        expect(result.scale).toBeLessThan(1); // sí tuvo que reducir
        // Pivote local (0, height) en boxOrigin (0,0): absoluto = (0, 50), invariante.
    });
});

/**
 * Reviewer B1 — bug de colisión encontrado en revisión independiente: `cornersClear` sólo evaluaba las
 * 4 ESQUINAS de la caja ya rotada/escalada contra el sector anular (corona del arco), un chequeo válido
 * para el viewport y el pie (semiplanos convexos: si las 4 esquinas de un rectángulo convexo quedan del
 * lado correcto de una recta, TODO el rectángulo también) pero NO para la corona, que es un sector anular
 * — una región NO convexa. Un borde entero puede atravesar la corona mientras sus dos esquinas quedan
 * limpias en ambos lados (una más cerca del centro que el radio interior, la otra más lejos del radio
 * exterior), exactamente el caso documentado en la revisión: caja 40×10 en (340,295), ángulo 0, escala
 * pedida 1, arco centrado en (300,300) con corona [50,60] y barrido [-90°,90°]. Esquinas relativas al
 * centro: (40,-5), (80,-5), (80,5), (40,5) — las 4 a radio < 50 o > 60 (ninguna esquina cae en [50,60]),
 * pero el borde SUPERIOR (de (40,-5) a (80,-5), ángulo ~83°-86°, dentro del barrido) tiene radio
 * variando de forma continua de ~40.3 a ~80.2, así que CRUZA tanto el radio interior (50) como el
 * exterior (60) a mitad de camino — colisión real con la corona que `cornersClear` no detectaba.
 * Oráculo independiente (muestreo fino de 20000 puntos por borde + bisección, fuera de este repo, ver
 * bitácora): a escala 1 el borde superior SÍ atraviesa la corona (no libra); la escala máxima seguro es
 * ~0.5 (en ese punto el borde top queda tangente al único punto del sector que también es el extremo del
 * barrido angular, (50,0) relativo — ángulo exactamente 90°, radio exactamente 50 —, así que la escala
 * seguro queda estrictamente por debajo de 0.5, nunca llega a tocarlo).
 */
describe("fitTrendScale — colisión de BORDE con la corona del arco (Reviewer B1): las 4 esquinas solas no bastan", () => {
    it("caja 40x10 en (340,295), ángulo 0, corona [50,60]@[-90°,90°] centrada en (300,300): el borde superior cruza la corona aunque las 4 esquinas estén limpias; la escala se reduce a ~0.5, nunca se reporta `fits:true` a escala 1", () => {
        const result = fitTrendScale(40, 10, { x: 340, y: 295 }, 0, 1, {
            viewportWidth: 1000,
            viewportHeight: 1000,
            arc: { center: { x: 300, y: 300 }, innerRadius: 50, outerRadius: 60, startAngle: -90, endAngle: 90 },
        });
        expect(result.fits).toBe(true); // TREND_MIN_SCALE (0.3) sí libra la corona (oráculo independiente)
        expect(result.scale).toBeLessThan(1); // la escala pedida (1) SÍ colisiona por el borde; debe reducirse
        expect(result.scale).toBeCloseTo(0.5, 2);
    });
});

/**
 * `segmentDistanceToAnnularSector` — distancia exacta de un SEGMENTO (no sólo sus extremos) al sector
 * anular; motor del fix de Reviewer B1. Cada caso aquí ejercita, con un valor esperado verificado con un
 * oráculo independiente (réplica del algoritmo en Python + bisección/muestreo fino, fuera de este repo,
 * ver bitácora), una rama distinta de la función: segmento degenerado (p=q, un punto), barrido completo
 * (360°+, sin bordes angulares), segmento paralelo a uno de los bordes angulares (denominador 0 al
 * resolver el cruce), cruce del borde angular fuera del propio segmento (t fuera de [0,1]), y los 2 lados
 * de la corona (más cerca del centro que r0, o más lejos que r1) tanto dentro como fuera del barrido.
 */
describe("segmentDistanceToAnnularSector — distancia exacta segmento→sector anular (motor del fix de Reviewer B1)", () => {
    it("segmento degenerado (p = q, un solo punto) fuera del barrido: coincide con pointDistanceToAnnularSector", () => {
        const p = { x: 100, y: 0 };
        const d = segmentDistanceToAnnularSector(p, p, 50, 60, -10, 10);
        expect(d).toBeCloseTo(pointDistanceToAnnularSector(p, 50, 60, -10, 10), 9);
        expect(d).toBeCloseTo(103.74737694674837, 6);
    });

    it("barrido completo (360°+): el segmento cruza la corona (colisión, distancia 0) aunque ningún extremo esté dentro de [r0,r1]", () => {
        // (0,-5): ρ=5 (< r0=10); (0,-30): ρ=30 (> r1=20) — el segmento cruza ambos radios en el camino.
        const d = segmentDistanceToAnnularSector({ x: 0, y: -5 }, { x: 0, y: -30 }, 10, 20, -400, 400);
        expect(d).toBe(0);
    });

    it("barrido completo (360°+), segmento entero más cerca del centro que r0: distancia = r0 − ρmax", () => {
        const d = segmentDistanceToAnnularSector({ x: 1, y: 1 }, { x: 2, y: 2 }, 10, 20, -400, 400);
        expect(d).toBeCloseTo(10 - Math.hypot(2, 2), 9);
    });

    it("barrido completo (360°+), segmento entero más lejos del centro que r1: distancia = ρmin − r1", () => {
        const d = segmentDistanceToAnnularSector({ x: 50, y: 50 }, { x: 60, y: 60 }, 10, 20, -400, 400);
        expect(d).toBeCloseTo(Math.hypot(50, 50) - 20, 9);
    });

    it("segmento vertical paralelo al borde angular en 0° (denominador 0 al resolver ese cruce) y cruce del borde en 90° fuera del propio segmento (t > 1): cae al chequeo de los 2 bordes radiales", () => {
        const d = segmentDistanceToAnnularSector({ x: 5, y: 100 }, { x: 5, y: 10 }, 50, 60, 0, 90);
        expect(d).toBeCloseTo(46.09772228646444, 6);
    });

    it("dentro del barrido, segmento entero más cerca del centro que r0: distancia = r0 − ρmax (no colisión)", () => {
        const d = segmentDistanceToAnnularSector({ x: 0, y: -30 }, { x: 10, y: -32 }, 50, 60, -90, 90);
        expect(d).toBeCloseTo(16.473890771519578, 6);
    });

    it("dentro del barrido, segmento entero más lejos del centro que r1: distancia = ρmin − r1 (no colisión)", () => {
        const d = segmentDistanceToAnnularSector({ x: 0, y: -70 }, { x: 10, y: -75 }, 50, 60, -90, 90);
        expect(d).toBeCloseTo(10, 9);
    });
});

/**
 * Reviewer O1 — bug de colisión encontrado en revisión independiente, distinto del de Reviewer B1: la
 * corona del arco (sector anular) puede quedar ENTERA dentro de la caja de tendencia sin que NINGÚN
 * borde de la caja la cruce — el chequeo por borde (`segmentDistanceToAnnularSector`, fix de B1) sólo
 * detecta cruces, no encierro completo. Caso documentado en la revisión: `fitTrendScale(300, 150,
 * {x:150,y:5}, 0, 1, …)` con un arco centrado en (300,150), corona [90,140] y barrido [-90°,90°] — la
 * caja (absoluta: x en [150,450], y en [5,155]) envuelve por completo la corona (que ocupa x en
 * [160,440], y en [10,150] aprox.) sin que ninguno de sus 4 bordes la atraviese, pero el punto (300,35)
 * cae dentro de ambas: colisión real que `cornersClear` reportaba como libre (`fits:true` a escala 1).
 *
 * El fix se apoya en que la corona es una región CONEXA: si ya se confirmó que ningún borde de la caja
 * la cruza (chequeo de B1), la corona entera debe quedar DENTRO o FUERA de la caja — no puede quedar "a
 * medias" sin que algún borde la cruce. Por eso un único punto representativo (`arcRepresentativePoint`,
 * radio medio/ángulo medio del barrido) basta: si ese punto cae dentro de la caja (`pointInConvexPolygon`,
 * válido para cualquier rectángulo convexo, rotado o no), la corona entera está encerrada.
 *
 * Valores esperados verificados con un oráculo independiente (muestreo denso punto-en-sector +
 * punto-en-caja + bisección en Python, fuera de este repo, ver bitácora).
 */
describe("pointInConvexPolygon — punto dentro de un polígono convexo arbitrario (motor del fix de Reviewer O1)", () => {
    it("punto claramente dentro de un rectángulo axis-aligned: true", () => {
        const corners = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        expect(pointInConvexPolygon({ x: 5, y: 5 }, corners)).toBe(true);
    });

    it("punto claramente fuera: false", () => {
        const corners = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        expect(pointInConvexPolygon({ x: 50, y: 50 }, corners)).toBe(false);
    });

    it("rectángulo rotado (el chequeo no depende de que esté alineado a los ejes): detecta dentro/fuera igual", () => {
        // Rombo (cuadrado girado 45°) centrado en el origen, vértices a distancia 10 de los ejes.
        const corners = [{ x: 0, y: -10 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }];
        expect(pointInConvexPolygon({ x: 0, y: 0 }, corners)).toBe(true);
        expect(pointInConvexPolygon({ x: 9, y: 9 }, corners)).toBe(false); // cerca del rombo, pero fuera
    });

    it("punto exactamente sobre un borde: se considera dentro (sin falso negativo por el signo 0 del cruz)", () => {
        const corners = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        expect(pointInConvexPolygon({ x: 5, y: 0 }, corners)).toBe(true);
    });
});

describe("arcRepresentativePoint — punto siempre dentro (o en el límite) de la corona (motor del fix de Reviewer O1)", () => {
    it("barrido parcial: radio medio, ángulo medio del barrido — cae en la corona por construcción", () => {
        const p = arcRepresentativePoint({ center: { x: 0, y: 0 }, innerRadius: 50, outerRadius: 60, startAngle: -10, endAngle: 10 });
        expect(pointDistanceToAnnularSector(p, 50, 60, -10, 10)).toBe(0);
        expect(p.x).toBeCloseTo(0, 9); // ángulo medio 0° → (0, −ρ)
        expect(p.y).toBeCloseTo(-55, 9);
    });

    it("barrido completo (360°+): el ángulo elegido no importa, cualquiera cae dentro de la corona", () => {
        const p = arcRepresentativePoint({ center: { x: 0, y: 0 }, innerRadius: 10, outerRadius: 20, startAngle: -400, endAngle: 400 });
        expect(pointDistanceToAnnularSector(p, 10, 20, -400, 400)).toBe(0);
    });

    it("degenerado: r0 === r1 (corona de ancho 0) — no crashea; el punto cae sobre el único radio posible", () => {
        const p = arcRepresentativePoint({ center: { x: 0, y: 0 }, innerRadius: 50, outerRadius: 50, startAngle: -10, endAngle: 10 });
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(50, 9);
    });

    it("degenerado: barrido de 0° (lo === hi) — no crashea; el ángulo medio coincide con el único ángulo posible", () => {
        const p = arcRepresentativePoint({ center: { x: 0, y: 0 }, innerRadius: 50, outerRadius: 60, startAngle: 30, endAngle: 30 });
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
    });
});

describe("fitTrendScale — colisión por ENCIERRO con la corona del arco (Reviewer O1): la corona entera cae dentro de la caja sin que ningún borde la cruce", () => {
    it("caja 300x150 en (150,5), ángulo 0, escala 1: envuelve por completo la corona [90,140]@[-90°,90°] centrada en (300,150) — ni siquiera TREND_MIN_SCALE la libra", () => {
        const result = fitTrendScale(300, 150, { x: 150, y: 5 }, 0, 1, {
            viewportWidth: 1000,
            viewportHeight: 1000,
            arc: { center: { x: 300, y: 150 }, innerRadius: 90, outerRadius: 140, startAngle: -90, endAngle: 90 },
        });
        expect(result).toEqual({ scale: TREND_MIN_SCALE, fits: false });
    });

    it("barrido completo (360°+): un anillo diminuto pegado al pivote queda encerrado por la caja incluso en TREND_MIN_SCALE", () => {
        const result = fitTrendScale(100, 100, { x: 0, y: 0 }, 0, 1, {
            viewportWidth: 1000,
            viewportHeight: 1000,
            arc: { center: { x: 10, y: 95 }, innerRadius: 1, outerRadius: 3, startAngle: -400, endAngle: 400 },
        });
        expect(result).toEqual({ scale: TREND_MIN_SCALE, fits: false });
    });

    it("caja 40x150 en (280,5): la corona sólo queda PARCIALMENTE encerrada (se sale por los lados); la homotecia la libra reduciendo a ~0.618", () => {
        const result = fitTrendScale(40, 150, { x: 280, y: 5 }, 0, 1, {
            viewportWidth: 1000,
            viewportHeight: 1000,
            arc: { center: { x: 300, y: 150 }, innerRadius: 90, outerRadius: 140, startAngle: -90, endAngle: 90 },
        });
        expect(result.fits).toBe(true);
        expect(result.scale).toBeCloseTo(0.618, 2);
    });

    it("sin falso positivo: corona lejana (sin tocar ni encerrar la caja) no fuerza ninguna reducción", () => {
        const result = fitTrendScale(10, 10, { x: 0, y: 0 }, 0, 1, {
            viewportWidth: 2000,
            viewportHeight: 2000,
            arc: { center: { x: 1000, y: 1000 }, innerRadius: 50, outerRadius: 60, startAngle: -10, endAngle: 10 },
        });
        expect(result).toEqual({ scale: 1, fits: true });
    });
});
