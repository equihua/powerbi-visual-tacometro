import { BAND_RADIUS_FACTOR as BAND_FACTOR, bandRadii } from "./arcUtils";

/** Alto fijo del pie (valor + etiqueta en dos renglones). */
export const FOOTER_HEIGHT = 40;
/** 0.3.2.0: aire entre el borde inferior del medidor (banda, marcadores o sparkline) y el pie. */
export const FOOTER_GAP = 4;
/** Lo más que un marcador sobresale de la banda hacia fuera (triángulo de GaugeMarker: 1 + 10 px). */
export const MARKER_OVERHANG = 11;
/** Alto mínimo útil de la sparkline interior; por debajo no se dibuja. */
export const TREND_MIN_HEIGHT = 16;
/** Caja de la sparkline relativa al radio interior de la banda (ancho acotado al círculo interior). */
const TREND_WIDTH_FACTOR = 1.5;
const TREND_TOP_FACTOR = 0.1;
const TREND_HEIGHT_FACTOR = 0.5;

export interface Band {
    y: number;
    height: number;
}

export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface GaugeLayout {
    /** Alto disponible para el medidor (se dibuja igual que 0.2.0.0 en esa caja, a todo el ancho). */
    gaugeHeight: number;
    footer: Band | null;
}

/**
 * 0.3.1.0: sólo el pie reserva alto, anclado al borde inferior; la sparkline va dentro del
 * medidor (`computeInnerTrendBox`). Sin pie el medidor conserva todo el alto (0.2.0.0). Si el
 * pie dejaría al medidor con menos de la mitad del alto, no se reserva.
 */
export function computeGaugeLayout(
    _width: number,
    height: number,
    parts: { footer: boolean }
): GaugeLayout {
    if (!parts.footer || height < FOOTER_HEIGHT * 2) {
        return { gaugeHeight: height, footer: null };
    }
    const gaugeHeight = height - FOOTER_HEIGHT;
    return { gaugeHeight, footer: { y: gaugeHeight, height: FOOTER_HEIGHT } };
}

/**
 * Caja de la sparkline dentro del semicírculo, bajo el número central, en coordenadas relativas
 * al centro del medidor. Sus esquinas quedan dentro del círculo interior de la banda, así que no
 * invade el arco con ningún ángulo inicial/final. null si quedaría más baja que TREND_MIN_HEIGHT.
 */
export function computeInnerTrendBox(radius: number, thickness: number): Box | null {
    const inner = bandRadii(radius, thickness).innerRadius;
    const height = inner * TREND_HEIGHT_FACTOR;
    if (height < TREND_MIN_HEIGHT) {
        return null;
    }
    const width = inner * TREND_WIDTH_FACTOR;
    return { x: -width / 2, y: inner * TREND_TOP_FACTOR, width, height };
}

export interface GaugeFrame {
    /** Radio que recibe el dibujo del medidor (mismo significado que en 0.2.0.0). */
    radius: number;
    cx: number;
    cy: number;
}

/** ¿El rango [lo, hi] (grados) contiene `target` + 360·k para algún k? */
function containsAngle(lo: number, hi: number, target: number): boolean {
    return Math.ceil((lo - target) / 360) * 360 + target <= hi;
}

/**
 * Encuadre del medidor (radio y centro) en su caja de `width` x `gaugeHeight`.
 *
 * Sin pie: el de 0.2.0.0 (radio por el lado menor, centrado), así el markup sin serie mensual no cambia.
 * 0.3.2.0 con pie: la caja cuadrada dejaba un hueco grande entre el medidor y el pie, porque un arco
 * parcial (p. ej. -120°..60°) no usa la mitad inferior del círculo. Ahora se mide el contenido real
 * bajo el centro (banda + MARKER_OVERHANG en los ángulos dibujados y la sparkline interior) y se elige
 * el radio más grande que cabe (acotado por el ancho), con el contenido terminando a FOOTER_GAP del pie
 * y el arco sin salirse por arriba. El dibujo es el mismo; sólo cambian radio y centro.
 * `centerTextHeight` (alto del número central, que va justo sobre el centro) sólo limita con arcos
 * que no pasan por las 12 en punto (p. ej. invertidos), donde la banda no llega más arriba que él.
 */
export function computeGaugeFrame(
    width: number,
    gaugeHeight: number,
    thickness: number,
    startAngle: number,
    endAngle: number,
    footer: boolean,
    centerTextHeight: number = 0
): GaugeFrame {
    const widthRadius = width / 2 / BAND_FACTOR - thickness / 2;
    if (!footer) {
        return { radius: Math.min(width, gaugeHeight) / 2 / BAND_FACTOR - thickness / 2, cx: width / 2, cy: gaugeHeight / 2 };
    }
    const lo = Math.min(startAngle, endAngle);
    const hi = Math.max(startAngle, endAngle);
    const cosAt = (deg: number) => Math.cos((deg * Math.PI) / 180);
    // Fracción del radio exterior que el arco ocupa sobre y bajo el centro (y = -r·cos a).
    const top = containsAngle(lo, hi, 0) ? 1 : Math.max(0, cosAt(lo), cosAt(hi));
    const bottom = containsAngle(lo, hi, 180) ? 1 : Math.max(0, -cosAt(lo), -cosAt(hi));
    const trendBottom = TREND_TOP_FACTOR + TREND_HEIGHT_FACTOR;
    const available = gaugeHeight - FOOTER_GAP;
    const widthOuter = bandRadii(widthRadius, thickness).outerRadius;
    // Radio exterior máximo: cada término superior (banda o número) más cada inferior (banda + marcadores
    // o sparkline) cabe en `available`. Un divisor 0 da Infinity (ese término no limita).
    // El número central sólo limita si cabe; nunca deja la banda con radio interior negativo.
    const textRoom = available - centerTextHeight;
    const textLimit =
        textRoom > 0
            ? Math.max(thickness, Math.min(textRoom / bottom - MARKER_OVERHANG, textRoom / trendBottom + thickness))
            : Infinity;
    const outer = Math.min(
        widthOuter,
        (available - bottom * MARKER_OVERHANG) / (top + bottom),
        (available + trendBottom * thickness) / (top + trendBottom),
        available / top,
        textLimit
    );
    const contentBottom = Math.max(0, bottom * (outer + MARKER_OVERHANG), trendBottom * (outer - thickness));
    return {
        radius: outer === widthOuter ? widthRadius : (outer - thickness / 2) / BAND_FACTOR,
        cx: width / 2,
        cy: available - contentBottom,
    };
}
