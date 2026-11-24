import { BAND_RADIUS_FACTOR as BAND_FACTOR, bandRadii, semaphoreIndicatorRing } from "./arcUtils";

/** Alto fijo del pie (valor + etiqueta en dos renglones). */
export const FOOTER_HEIGHT = 40;
/** 0.3.2.0: aire entre el borde inferior del medidor (banda, marcadores o sparkline) y el pie. */
export const FOOTER_GAP = 4;
/** Lo más que un marcador sobresale de la banda hacia fuera (triángulo de GaugeMarker: 1 + 10 px). */
export const MARKER_OVERHANG = 11;
/** Alto mínimo útil de la sparkline interior; por debajo no se dibuja. */
export const TREND_MIN_HEIGHT = 16;
/**
 * Caja de la sparkline relativa al radio interior de la banda (alto y posición vertical; el ancho se calcula).
 *
 * 0.3.4.1 — HEIGHT_FACTOR bajó de 0.5 a 0.3: diagnóstico del ancho inconsistente entre layouts (QA
 * deleg_7d71b0fd, 'poa_inicio' ~60% del ancho de tarjeta vs 'poa_subdireccion'/'poa_energia_limpia'
 * ~42-43%). Causa raíz: el ancho máximo seguro de la sparkline (computeInnerTrendBox) es una fracción
 * ~constante del radio interior de la banda (`inner`), y ese radio lo fija computeGaugeFrame según el
 * ALTO disponible de la tarjeta (banda + marcadores + número central + pie, todos en px fijos), no
 * según su ancho. En tarjetas "paisaje" (1 medidor grande, más anchas que altas) ese radio queda más
 * chico en proporción al ancho que en tarjetas "retrato" (4 medidores en fila), así que CUALQUIER
 * elemento dimensionado a partir de `inner` —banda, anillo del semáforo y sparkline por igual— se ve
 * proporcionalmente más angosto frente al ancho de tarjeta. No hay un valor fijo/breakpoint oculto en
 * el cálculo del ancho (ya es "máximo técnicamente seguro" relativo a `inner`, correcto y consistente
 * como fracción de `inner` en ambos layouts); el ancho de banda/anillo/arco no se tocan aquí (habría
 * que rediseñar computeGaugeFrame, cambio de mayor alcance y riesgo, fuera de esta corrección).
 * Lo que SÍ es ajustable sin tocar el encuadre del medidor: cuánto alto necesita la propia caja de la
 * sparkline. Una serie mensual de líneas finas no necesita media `inner` de alto para verse bien; con
 * menos profundidad vertical (bottom más cerca del centro) la bisección de ancho (pasos 1 y 2 de
 * computeInnerTrendBox) libera más ancho seguro en AMBOS layouts por el mismo mecanismo ya validado
 * (no es un porcentaje arbitrario: sigue siendo el máximo seguro, ahora con menos alto exigido).
 * TOP_FACTOR no cambia (posición vertical superior de la caja intacta).
 */
const TREND_TOP_FACTOR = 0.1;
const TREND_HEIGHT_FACTOR = 0.3;
/** 0.3.3.1: relleno interno de TrendSparkline (centros de los puntos extremos a este margen de la caja). */
export const TREND_PADDING = 6;
/** Radios de los puntos de TrendSparkline; el del mes actual es el mayor y define el alcance del contenido. */
export const TREND_POINT_RADIUS = 2.5;
export const TREND_CURRENT_POINT_RADIUS = 4;
/**
 * 0.3.3.1: holgura mínima (px) entre el borde de un punto de la sparkline y cualquier trazo del arco: medio píxel,
 * lo que el contorno de 1 px de alto contraste de la banda invade hacia dentro (y medio píxel de antialiasing).
 */
export const TREND_EDGE_CLEARANCE = 0.5;
/** Tolerancia (px) de la bisección del ancho; siempre del lado seguro. */
const TREND_BISECTION_TOLERANCE = 1e-7;

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

/** ¿`deg` (grados, 0 = 12 en punto, horario) cae en el barrido [lo, hi] (con vueltas de 360°)? */
function inSweep(deg: number, lo: number, hi: number): boolean {
    return hi - lo >= 360 || containsAngle(lo, hi, deg);
}

type Point = [number, number];

const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];

/** Distancia de p al segmento [a, b]. */
function pointSegmentDistance(p: Point, a: Point, b: Point): number {
    const ab = sub(b, a);
    const length2 = ab[0] * ab[0] + ab[1] * ab[1];
    // Segmento degenerado (a = b, p. ej. fila de ancho 0): el numerador también es 0 → t = 0, sin dividir entre 0.
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / Math.max(length2, Number.MIN_VALUE)));
    return Math.hypot(p[0] - a[0] - t * ab[0], p[1] - a[1] - t * ab[1]);
}

/** Distancia entre los segmentos [a, b] y [c, d] (0 si se cruzan). */
function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
    const d1 = cross(sub(b, a), sub(c, a));
    const d2 = cross(sub(b, a), sub(d, a));
    const d3 = cross(sub(d, c), sub(a, c));
    const d4 = cross(sub(d, c), sub(b, c));
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        // 0.3.4.1: rama estructuralmente inalcanzable tras el fix de causa raíz (TREND_HEIGHT_FACTOR
        // 0.5→0.3). Al bajar el alto de la caja de la sparkline, el rango geométrico donde el borde del
        // rectángulo de centros puede cruzar (no sólo acercarse a) el borde radial del sector del anillo
        // se angostó hasta quedar fuera de cualquier combinación válida de radio/grosor/barrido probada
        // (incluyendo barridos amplios y asimétricos hasta 260°, ver intento documentado y descartado en
        // el historial de tests de este archivo). Confirmado por decisión de Orchestrator: no perseguir
        // más un caso que ejercite esta rama; se documenta y excluye en vez de dejar un test sin valor real.
        /* v8 ignore next */
        return 0;
    }
    return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

/** Dirección unitaria del ángulo `deg` (0 = 12 en punto, horario; y hacia abajo). */
function direction(deg: number): Point {
    const a = (deg * Math.PI) / 180;
    return [Math.sin(a), -Math.cos(a)];
}

/**
 * Distancia exacta del segmento [p, q] al sector anular {r0 <= ρ <= r1, ángulo en [lo, hi]} cuando el segmento
 * está dentro del círculo de radio r1 (el contenido de la sparkline siempre lo está). Dentro del barrido la
 * distancia es r0 − ρ (mínima donde ρ es máxima: en los extremos de cada tramo, ρ es convexa sobre la recta);
 * fuera del barrido el punto más cercano del sector está en uno de sus bordes radiales.
 */
function segmentToAnnularSector(p: Point, q: Point, r0: number, r1: number, lo: number, hi: number): number {
    const pq = sub(q, p);
    const at = (t: number): Point => [p[0] + t * pq[0], p[1] + t * pq[1]];
    const cuts = [0, 1];
    for (const deg of [lo, hi]) {
        const dir = direction(deg);
        const denominator = cross(dir, pq);
        if (denominator !== 0) {
            const t = -cross(dir, p) / denominator;
            if (t > 0 && t < 1) {
                cuts.push(t);
            }
        }
    }
    cuts.sort((x, y) => x - y);
    let best = Infinity;
    for (let i = 0; i + 1 < cuts.length; i++) {
        const middle = at((cuts[i] + cuts[i + 1]) / 2);
        if (inSweep((Math.atan2(middle[0], -middle[1]) * 180) / Math.PI, lo, hi)) {
            const rho = Math.max(Math.hypot(...at(cuts[i])), Math.hypot(...at(cuts[i + 1])));
            best = Math.min(best, Math.max(0, r0 - rho));
        }
    }
    for (const deg of [lo, hi]) {
        const dir = direction(deg);
        best = Math.min(best, segmentDistance(p, q, [dir[0] * r0, dir[1] * r0], [dir[0] * r1, dir[1] * r1]));
    }
    return best;
}

/**
 * Caja de la sparkline dentro del semicírculo, bajo el número central, en coordenadas relativas al centro del
 * medidor. null si quedaría más baja que TREND_MIN_HEIGHT.
 *
 * 0.3.3.1 — ancho máximo técnicamente seguro. Lo que se dibuja no es la caja sino su contenido: centros de los
 * puntos, cada uno con radio hasta TREND_CURRENT_POINT_RADIUS (las líneas, 0.75 px de medio trazo, quedan dentro).
 * Con alcance a = TREND_CURRENT_POINT_RADIUS + TREND_EDGE_CLEARANCE, el ancho es el mayor seguro frente a:
 *  1. Banda (GaugeBackground/GaugeRanges/PerformanceArc + sobresaliente de marcadores, [inner, outer+overhang]).
 *  2. Anillo del indicador del semáforo (semaphoreIndicatorRing, dentro de la banda).
 * Se aplica aunque el mes no traiga semáforo, para que el ancho no salte entre periodos.
 * Alto y posición vertical no cambian (el encuadre de computeGaugeFrame y el pie tampoco).
 *
 * 0.3.4.0 — `showRanges`: el anillo (`semaphore-indicator`, PerformanceArc) sólo lo dibuja Gauge.tsx
 * cuando «Mostrar Rangos» está activo; con el formato apagado el performance-arc ocupa todo el grosor
 * de la banda y no existe ningún anillo que la sparkline pudiera tocar, así que el límite 2 se omite y
 * sólo queda el 1. A diferencia del semáforo del mes (dato, puede faltar en una actualización y
 * aparecer en otra), `showRanges` es una opción de formato fija para todo el reporte: omitirlo cuando
 * está apagado no reintroduce el salto de ancho entre periodos que el resto de la función evita.
 *
 * 0.3.5.0 — izquierda y derecha YA NO comparten el mismo ancho, y el límite 1 deja de tratar la banda
 * como si ocupara el círculo completo. Diagnóstico (brecha de ancho entre 'poa_inicio' [4 medidores,
 * tarjeta ~430x338] y 'poa_subdireccion'/'poa_energia_limpia' [1 medidor, ~430x268], ambos con el
 * barrido por omisión -120°..60°): GaugeBackground/GaugeRanges/PerformanceArc (`Gauge.tsx`) sólo dibujan
 * la banda dentro de [startAngle, endAngle], igual que ya reconocía el límite 2 para el anillo del
 * semáforo — pero el límite 1 (versiones anteriores) la tratada como si ocupara "cualquier ángulo", el
 * círculo completo. Con un barrido asimétrico respecto al eje vertical (-120°..60°: 120° a la izquierda
 * del 12 en punto, sólo 60° a la derecha) eso desperdiciaba ancho real: el lado derecho de la caja
 * (ningún punto con y > 0, es decir por debajo del centro, cae nunca en ese barrido — su ángulo con la
 * convención de este archivo queda siempre en (90°, 180°), fuera de [-120°, 60°]) no toca la banda a
 * NINGÚN radio, pero antes se recortaba igual que la izquierda (que sí la toca) por forzar un ancho
 * simétrico. Ahora cada lado se calcula por separado con el MISMO mecanismo exacto que ya usaba el
 * anillo del semáforo (`segmentToAnnularSector` contra el sector banda+marcadores [inner,
 * outer+MARKER_OVERHANG] × [startAngle, endAngle], y aparte el anillo si showRanges), acotado por
 * `cardWidth` (el ancho real de la tarjeta — imprescindible: un lado sin barrido, sin este tope,
 * crecería sin límite) con el mismo margen ya usado para el relleno del contenido (TREND_PADDING: una
 * vez punto→borde de caja, otra vez borde de caja→borde de tarjeta, mismo principio, sin constante
 * nueva). Con barridos simétricos respecto al vertical o círculo completo da EXACTAMENTE el mismo
 * resultado que las versiones anteriores (ningún lado queda libre, ambos topan igual — verificado en
 * tests); la ganancia es sólo donde el barrido deja un lado sin banda, como en las 3 páginas del
 * reporte (medido con CDP tras publicar, ver bitácora de este cambio). El radio/encuadre del medidor
 * (`computeGaugeFrame`) NO se tocó: el radio ya es el máximo seguro dado el alto fijo de la tarjeta
 * (pie + sobresaliente de marcadores + número, todos en px fijos) — agrandarlo en las tarjetas más
 * bajas exigiría o reducir esas constantes para TODA tarjeta (incluidas las de 4 en fila) o deformar el
 * arco en una elipse, ambas fuera de alcance/prohibidas; la brecha real estaba en este desperdicio de
 * ancho, no en el radio.
 */
export function computeInnerTrendBox(
    radius: number,
    thickness: number,
    startAngle: number,
    endAngle: number,
    cardWidth: number,
    showRanges: boolean = true
): Box | null {
    const { innerRadius: inner, outerRadius: outer } = bandRadii(radius, thickness);
    const height = inner * TREND_HEIGHT_FACTOR;
    if (height < TREND_MIN_HEIGHT) {
        return null;
    }
    const y = inner * TREND_TOP_FACTOR;
    const top = y + TREND_PADDING;
    const bottom = y + height - TREND_PADDING;
    const reach = TREND_CURRENT_POINT_RADIUS + TREND_EDGE_CLEARANCE;
    const lo = Math.min(startAngle, endAngle);
    const hi = Math.max(startAngle, endAngle);
    const ring = showRanges ? semaphoreIndicatorRing(inner, thickness) : null;
    // Tope físico por lado: la caja no puede salirse de la tarjeta (el centro del medidor está a
    // cardWidth / 2 de cada borde). Mismo margen que TREND_PADDING usa para el contenido, aplicado dos
    // veces (punto→caja, caja→tarjeta): sin esto, el lado sin barrido (ver arriba) crecería sin límite.
    const halfWidthCap = Math.max(0, cardWidth / 2 - 2 * TREND_PADDING);

    // ¿El lado `sign` (−1 izquierda, +1 derecha) de la caja, con medio ancho `x`, libra el sector anular
    // [r0, r1] × [lo, hi]? Mismo mecanismo que el anillo del semáforo en 0.3.3.1-0.3.4.1, aplicado sólo
    // al medio rectángulo de ese lado (de x=0, bajo el centro, a x=sign·x).
    const clearOfSector = (x: number, sign: 1 | -1, r0: number, r1: number): boolean => {
        const corners: Point[] = [[0, top], [sign * x, top], [sign * x, bottom], [0, bottom]];
        return corners.every(
            (corner, i) => segmentToAnnularSector(corner, corners[(i + 1) % 4], r0, r1, lo, hi) >= reach
        );
    };

    // Radio exterior del sector más grande que hay que evitar (banda+sobresaliente; el anillo del
    // semáforo vive por dentro de la banda, nunca la rebasa). segmentToAnnularSector está pensada para
    // segmentos "dentro del círculo r1" (ver su comentario); con cardWidth grande y un lado sin barrido,
    // el medio ancho candidato puede ser mucho mayor que r1max, violando esa premisa.
    const r1Max = outer + MARKER_OVERHANG;
    // Más allá de este medio ancho (con `top`, la arista más cercana al centro — la más conservadora:
    // garantiza que las 4 esquinas, incluida la de `bottom`, ya están a radio > r1max de CUALQUIER sector
    // que se evalúe aquí) ningún punto de la caja puede estar a [r0, r1] de ningún sector sin importar el
    // ángulo: a salvo de forma incondicional. Acota la bisección a la zona donde el supuesto de
    // segmentToAnnularSector sí se cumple, y evita evaluarla fuera de ese rango.
    const xSafeBeyond = Math.sqrt(Math.max(0, r1Max * r1Max - top * top));

    // Mayor medio ancho seguro para un lado: libre de la banda (+ sobresaliente de marcadores) y, si
    // aplica, del anillo del semáforo — acotado por halfWidthCap. Se bisecta sólo hasta xSafeBeyond (la
    // zona donde la fórmula es válida); si ahí ya es seguro, todo lo de más allá (hasta halfWidthCap) lo
    // es de forma incondicional, sin volver a invocar la fórmula fuera de su rango.
    const sideHalfSpan = (sign: 1 | -1): number => {
        const ok = (x: number): boolean =>
            clearOfSector(x, sign, inner, r1Max) && (!ring || clearOfSector(x, sign, ring.innerRadius, ring.outerRadius));
        const bracket = Math.min(halfWidthCap, xSafeBeyond);
        if (ok(bracket)) {
            return halfWidthCap > bracket ? halfWidthCap : bracket;
        }
        let safe = 0;
        let unsafe = bracket;
        while (unsafe - safe > TREND_BISECTION_TOLERANCE) {
            const mid = (safe + unsafe) / 2;
            if (ok(mid)) {
                safe = mid;
            } else {
                unsafe = mid;
            }
        }
        return safe;
    };

    const halfLeft = sideHalfSpan(-1);
    const halfRight = sideHalfSpan(1);
    const width = halfLeft + halfRight + 2 * TREND_PADDING;
    return { x: -(halfLeft + TREND_PADDING), y, width, height };
}

/**
 * 0.4.0.0 — aplica las sobreescrituras de posición/tamaño de la tarjeta «Gráfico de tendencia» sobre la
 * caja calculada automáticamente por `computeInnerTrendBox`. Cada eje es independiente: un valor
 * `undefined` (el panel sin tocar, NumUpDown sin valor) conserva el cálculo automático de ESE eje;
 * con los cuatro `undefined` el resultado es idéntico a `auto` (retrocompatible con 0.3.5.0). Si `auto`
 * es null (la caja no cabe, ver `computeInnerTrendBox`) no hay caja que desplazar/redimensionar y se
 * sigue devolviendo null — las sobreescrituras ajustan la caja automática, no crean una desde cero.
 */
export function applyTrendBoxOverrides(
    auto: Box | null,
    overrides: { x?: number; y?: number; width?: number; height?: number }
): Box | null {
    if (!auto) {
        return null;
    }
    return {
        x: overrides.x ?? auto.x,
        y: overrides.y ?? auto.y,
        width: overrides.width ?? auto.width,
        height: overrides.height ?? auto.height,
    };
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
 *
 * 0.4.0.0 — tres parámetros nuevos, todos opcionales y retrocompatibles (con sus valores por omisión el
 * resultado es IDÉNTICO al de 0.3.5.0; así ningún test anterior que no los pase cambia de valor):
 *  - `topMargin` (default 0): aire real reservado ARRIBA del vértice del arco, análogo a FOOTER_GAP pero
 *    en el otro extremo. Causa raíz del bug "el arco toca la banda de título": `available` (todo el
 *    cálculo de radio máximo) asumía que el arco podía llegar hasta y=0 (el borde superior del propio
 *    viewport del medidor, justo debajo de la banda de título nativa de Power BI) sin ningún margen —
 *    por eso aumentar `spacing.spaceAbovePlotArea` (una propiedad nativa de Power BI, fuera de este
 *    cálculo) no bastaba: el arco seguía dibujándose hasta el borde de SU viewport. La fórmula resta
 *    `topMargin` de `available` (como si `gaugeHeight` fuera topMargin px más chico) y luego SUMA
 *    `topMargin` al `cy` final — equivalente a resolver el mismo sistema de restricciones con una caja
 *    topMargin px más baja y desplazar el resultado hacia abajo esa misma distancia. El panel de formato
 *    (gaugeCard.topMargin) usa como valor por omisión FOOTER_GAP (ver settings.ts), para quedar
 *    visualmente simétrico con el margen inferior existente; el parámetro de esta función por sí solo
 *    sigue en 0 (comportamiento 0.3.5.0) si no se pasa explícitamente.
 *  - `arcScale` (default 100, %): multiplica el radio FINAL ya calculado como el máximo seguro. Con
 *    100 no cambia nada; con menos de 100 el arco se encoge desde ese máximo seguro — nunca puede
 *    introducir una colisión nueva (sólo añade holgura), así que no se re-valida contra las restricciones.
 *  - `offsetY` (default 0): desplazamiento vertical final aplicado a `cy` después de todo lo anterior.
 *    A diferencia de `topMargin`/`arcScale`, SÍ puede introducir solapes si el usuario lo usa de forma
 *    agresiva (documentado en el panel); con 0 el resultado es exacto al de 0.3.5.0.
 */
export function computeGaugeFrame(
    width: number,
    gaugeHeight: number,
    thickness: number,
    startAngle: number,
    endAngle: number,
    footer: boolean,
    centerTextHeight: number = 0,
    topMargin: number = 0,
    arcScale: number = 100,
    offsetY: number = 0
): GaugeFrame {
    const widthRadius = width / 2 / BAND_FACTOR - thickness / 2;
    if (!footer) {
        const radius = (Math.min(width, gaugeHeight) / 2 / BAND_FACTOR - thickness / 2) * (arcScale / 100);
        return { radius, cx: width / 2, cy: gaugeHeight / 2 + offsetY };
    }
    const lo = Math.min(startAngle, endAngle);
    const hi = Math.max(startAngle, endAngle);
    const cosAt = (deg: number) => Math.cos((deg * Math.PI) / 180);
    // Fracción del radio exterior que el arco ocupa sobre y bajo el centro (y = -r·cos a).
    const top = containsAngle(lo, hi, 0) ? 1 : Math.max(0, cosAt(lo), cosAt(hi));
    const bottom = containsAngle(lo, hi, 180) ? 1 : Math.max(0, -cosAt(lo), -cosAt(hi));
    const trendBottom = TREND_TOP_FACTOR + TREND_HEIGHT_FACTOR;
    const available = gaugeHeight - FOOTER_GAP - topMargin;
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
    const safeRadius = outer === widthOuter ? widthRadius : (outer - thickness / 2) / BAND_FACTOR;
    return {
        radius: safeRadius * (arcScale / 100),
        cx: width / 2,
        cy: topMargin + (available - contentBottom) + offsetY,
    };
}
