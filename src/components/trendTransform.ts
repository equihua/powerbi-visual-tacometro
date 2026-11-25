/**
 * 0.4.x — geometría del transform de la serie de tendencia (TrendSparkline): pivote FIJO en la esquina
 * inferior izquierda LOCAL de la caja — punto (0, height) en las coordenadas SVG de la propia caja
 * (origen arriba a la izquierda, Y hacia abajo, igual que el resto del markup) — y rotación positiva
 * con apariencia ANTIHORARIA para quien ve la pantalla, aunque el SVG tenga Y invertido.
 *
 * Fórmula pedida: p' = T(X,Y)·S(s)·R(ángulo)·p. T(X,Y) es la traslación que YA aplica el grupo
 * contenedor (`<g class="gauge-trend-slot" transform="translate(...)">`, Gauge.tsx) — la interfaz de
 * posición/tamaño existente (`trendPosX`/`trendPosY`/`trendWidth`/`trendHeight`, layout.ts) sigue
 * intacta; su resolución a % de viewport queda para una fase posterior. Este módulo sólo implementa
 * R(ángulo) y S(s), pivotando en (0, height): el único punto de la caja que, al rotar y/o escalar,
 * queda siempre invariante (ver «pivote fijo» en trendTransform.test.ts) — por eso basta con esta
 * matriz para la homotecia anticolisión (trendFit.ts): nunca mueve el pivote ni cambia el ángulo.
 *
 * Derivación: un punto local (Px, Py) (SVG, Y hacia abajo) se expresa relativo al pivote en un sistema
 * cartesiano matemático (Y hacia arriba): u = Px, v = height − Py (en el pivote, u = v = 0). Se rota
 * con la matriz estándar antihoraria:
 *   u1 = u·cosθ − v·senθ
 *   v1 = u·senθ + v·cosθ
 * — este paso es el que hace que un ángulo positivo se vea antihorario en pantalla, compensando la
 * inversión de Y: un punto arriba del pivote (v > 0) con +90° termina a la izquierda del pivote
 * (u1 < 0), igual que giraría una manija de reloj en sentido antihorario. Se escala (u2 = s·u1,
 * v2 = s·v1) y se regresa a coordenadas SVG locales (Px' = u2, Py' = height − v2). Desarrollando queda
 * una única matriz afín 2D (`a,b,c,d,e,f`, convención SVG: x' = a·x + c·y + e, y' = b·x + d·y + f),
 * exportable como un solo `transform` (`matrix(...)`) sin encadenar varias primitivas.
 *
 * Con ángulo 0 y escala 1 (los valores por omisión) la matriz es la identidad: regresión visual exacta
 * del comportamiento 0.3.x/0.4.0.0 (sin rotación).
 */

export interface Point {
    x: number;
    y: number;
}

export interface TrendTransformCoefficients {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
}

/** Precisión del `matrix(...)` emitido al markup; suficiente para que el redondeo sea imperceptible. */
const MATRIX_PRECISION = 4;

function round(value: number): number {
    const factor = 10 ** MATRIX_PRECISION;
    const rounded = Math.round(value * factor) / factor;
    return rounded === 0 ? 0 : rounded; // evita "-0" en el markup
}

/** Coeficientes (sin redondear) de la matriz afín que implementa R(angleDeg)·S(scale) pivotando en (0, height). */
export function trendTransformCoefficients(height: number, angleDeg: number, scale: number): TrendTransformCoefficients {
    const theta = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return {
        a: scale * cos,
        b: -scale * sin,
        c: scale * sin,
        d: scale * cos,
        e: -scale * height * sin,
        f: height - scale * height * cos,
    };
}

/** Aplica la matriz (sin redondear) a un punto; para geometría (colisiones/pruebas), no para markup. */
export function applyTrendTransform(point: Point, height: number, angleDeg: number, scale: number): Point {
    const { a, b, c, d, e, f } = trendTransformCoefficients(height, angleDeg, scale);
    return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

/**
 * `transform` SVG para el grupo de la serie de tendencia: `undefined` en el caso identidad (ángulo 0 Y
 * escala 1 — los valores por omisión, sin excepción: así el markup por omisión no cambia ni un byte
 * frente a la versión anterior sin rotación); `matrix(a,b,c,d,e,f)` en cualquier otro caso.
 */
export function trendTransformAttribute(height: number, angleDeg: number, scale: number): string | undefined {
    if (angleDeg === 0 && scale === 1) {
        return undefined;
    }
    const { a, b, c, d, e, f } = trendTransformCoefficients(height, angleDeg, scale);
    return `matrix(${round(a)},${round(b)},${round(c)},${round(d)},${round(e)},${round(f)})`;
}

/** Las 4 esquinas LOCALES de la caja width×height, SIN transformar (orden: sup-izq, sup-der, inf-der, inf-izq). */
export function trendBoxCorners(width: number, height: number): Point[] {
    return [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
    ];
}

/** Las 4 esquinas de la caja YA rotadas/escaladas (mismo pivote); para la homotecia anticolisión (trendFit.ts). */
export function transformedTrendBoxCorners(width: number, height: number, angleDeg: number, scale: number): Point[] {
    return trendBoxCorners(width, height).map((corner) => applyTrendTransform(corner, height, angleDeg, scale));
}
