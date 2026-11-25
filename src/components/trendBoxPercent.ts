import type { Box } from "./layout";
import type { Point } from "./trendTransform";

/**
 * 0.4.1.0 — posición/tamaño de la caja de la tarjeta «Gráfico de tendencia» en % (0..100) del
 * viewport COMPLETO (ancho x alto de la tarjeta, no del medidor ni de `gaugeHeight`), reemplazando el
 * significado anterior de `posX`/`posY`/`width`/`height` (px relativos al centro del medidor, 0.4.0.0).
 *
 * `posX`/`posY` ubican el PIVOTE INFERIOR-IZQUIERDO de la caja — el mismo punto que `trendTransform.ts`
 * mantiene fijo al rotar/escalar (invariante local (0, height), ver ese archivo) — medido como % desde
 * el borde IZQUIERDO (X) y SUPERIOR (Y) del viewport (igual que cualquier coordenada de pantalla: 0% es
 * ese borde, 100% el opuesto). `width`/`height` son % del ancho/alto del viewport respectivamente.
 *
 * Elegir el pivote inferior-izquierdo (y no la esquina superior-izquierda, que es el origen que usa
 * `Box`/`applyTrendBoxOverrides`) no es arbitrario: es el único punto de la caja que un ángulo o una
 * escala distintos de los valores por omisión NUNCA mueven (ver pivote fijo en trendTransform.ts/
 * trendFit.ts) — fijar ESE punto en vez del origen evita que rotar o reducir la caja la desplace de la
 * posición que el usuario configuró.
 */
export interface PercentBox {
    posX: number;
    posY: number;
    width: number;
    height: number;
}

/** % de `value` sobre `total`; 0 (no NaN/Infinity) si `total` no es positivo (viewport degenerado). */
function toPercent(value: number, total: number): number {
    return total > 0 ? (value / total) * 100 : 0;
}

/** Inversa de `toPercent`: valor absoluto (mismas unidades que `total`) a partir de un %. */
function fromPercent(percent: number, total: number): number {
    return total > 0 ? (percent / 100) * total : 0;
}

/**
 * Convierte una caja (`Box`, origen arriba-izquierda, RELATIVA al centro del medidor — la que devuelve
 * `computeInnerTrendBox`/`computeGaugeGeometry`) a `PercentBox` (pivote inferior-izquierda, % ABSOLUTO
 * del viewport). `center` es el centro del medidor (cx, cy de `computeGaugeFrame`) en coordenadas del
 * viewport.
 */
export function boxToPercent(box: Box, center: Point, viewport: { width: number; height: number }): PercentBox {
    const pivotX = center.x + box.x;
    const pivotY = center.y + box.y + box.height;
    return {
        posX: toPercent(pivotX, viewport.width),
        posY: toPercent(pivotY, viewport.height),
        width: toPercent(box.width, viewport.width),
        height: toPercent(box.height, viewport.height),
    };
}

/** Inversa de `boxToPercent`: de `PercentBox` (pivote, % absoluto del viewport) a `Box` (origen arriba-izquierda, relativo al centro). */
export function percentToBox(percent: PercentBox, center: Point, viewport: { width: number; height: number }): Box {
    const width = fromPercent(percent.width, viewport.width);
    const height = fromPercent(percent.height, viewport.height);
    const pivotX = fromPercent(percent.posX, viewport.width);
    const pivotY = fromPercent(percent.posY, viewport.height);
    return {
        x: pivotX - center.x,
        y: pivotY - height - center.y,
        width,
        height,
    };
}

/**
 * Resuelve la caja efectiva de la tarjeta «Gráfico de tendencia» a partir de la caja automática
 * (`auto`, px relativos al centro — `computeInnerTrendBox`/`computeGaugeGeometry`, null si no cabe) y
 * las sobreescrituras del panel en % (0..100 del viewport; cada eje independiente, `undefined` = ese
 * eje sigue el cálculo automático — ver `PercentBox`).
 *
 * Sin NINGUNA sobreescritura devuelve `auto` TAL CUAL (misma referencia, sin pasar por %): así el
 * resultado es IDÉNTICO bit a bit al de 0.4.0.0 para cualquier reporte que no haya tocado esta tarjeta
 * (la inmensa mayoría) — ni siquiera el error de flotante de ida-y-vuelta por `boxToPercent`/
 * `percentToBox` puede introducirse cuando no hace falta. Con alguna sobreescritura, los ejes SIN
 * tocar se derivan de `auto` convertido a % (mismo criterio que `applyTrendBoxOverrides`, 0.4.0.0,
 * pero en % en vez de px) y el resultado final se reconstruye desde el % combinado.
 *
 * Igual que `applyTrendBoxOverrides`: si no hay caja automática (no cabe, `auto` null) no se crea una
 * desde las sobreescrituras — ajustan la caja automática, no crean una desde cero.
 */
export function resolveTrendBoxFromPercentOverrides(
    auto: Box | null,
    overrides: Partial<PercentBox>,
    center: Point,
    viewport: { width: number; height: number }
): Box | null {
    if (!auto) {
        return null;
    }
    const hasOverride =
        overrides.posX !== undefined || overrides.posY !== undefined || overrides.width !== undefined || overrides.height !== undefined;
    if (!hasOverride) {
        return auto;
    }
    const autoPercent = boxToPercent(auto, center, viewport);
    const effectivePercent: PercentBox = {
        posX: overrides.posX ?? autoPercent.posX,
        posY: overrides.posY ?? autoPercent.posY,
        width: overrides.width ?? autoPercent.width,
        height: overrides.height ?? autoPercent.height,
    };
    return percentToBox(effectivePercent, center, viewport);
}
