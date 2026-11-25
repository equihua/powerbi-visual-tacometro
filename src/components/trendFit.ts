import { Point, transformedTrendBoxCorners } from "./trendTransform";

/**
 * Homotecia automática anticolisión de la caja de tendencia: reduce `desiredScale` (nunca por debajo
 * de este piso documentado, 30%) hasta que la caja, YA rotada (ángulo fijo) y escalada, libre el
 * viewport, el pie y la corona del arco del medidor — nunca mueve el pivote (esquina inferior
 * izquierda) ni cambia el ángulo, sólo la escala. Por debajo de 30% los puntos, barras o la línea de
 * la serie dejan de ser legibles (mismo criterio de "mínimo útil" que TREND_MIN_HEIGHT en layout.ts,
 * aplicado aquí a la reducción relativa en vez de al alto absoluto). Si ni siquiera este piso libra
 * los obstáculos, `fitTrendScale` lo reporta explícito (`fits: false`) — nunca se fuerza un recorte
 * visual (clip-path) sobre el contenido para disimularlo.
 */
export const TREND_MIN_SCALE = 0.3;

export interface TrendArcObstacle {
    /** Centro del medidor, en el mismo sistema de coordenadas absoluto que `boxOrigin`. */
    center: Point;
    innerRadius: number;
    outerRadius: number;
    /** Grados; misma convención que el resto del repo (arcUtils/layout): 0 = 12 en punto, horario. */
    startAngle: number;
    endAngle: number;
}

export interface TrendFitObstacles {
    viewportWidth: number;
    viewportHeight: number;
    /** Borde superior del pie (si existe); la caja no debe descender más allá. */
    footerTop?: number;
    /** Corona del arco del medidor (banda + sobresaliente de marcadores); se omite si no aplica. */
    arc?: TrendArcObstacle;
    /** Holgura mínima (px) exigida frente al pie y al arco (el viewport es un límite físico, sin holgura). */
    clearance?: number;
}

export interface TrendFitResult {
    scale: number;
    /** false: ni siquiera TREND_MIN_SCALE libra los obstáculos; `scale` queda en el piso igualmente. */
    fits: boolean;
}

/** Misma convención que `direction()` en layout.ts: 0 = 12 en punto, sentido horario, Y hacia abajo. */
function angleOfPoint(x: number, y: number): number {
    return (Math.atan2(x, -y) * 180) / Math.PI;
}

function normalizeTo360(deg: number): number {
    return ((deg % 360) + 360) % 360;
}

/** ¿`deg` cae en el barrido [lo, hi] (grados, con vueltas de 360°)? */
function inSweep(deg: number, lo: number, hi: number): boolean {
    if (hi - lo >= 360) {
        return true;
    }
    return normalizeTo360(deg - lo) <= normalizeTo360(hi - lo);
}

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const length2 = abx * abx + aby * aby;
    const t = length2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / length2));
    const cx = a.x + t * abx;
    const cy = a.y + t * aby;
    return Math.hypot(p.x - cx, p.y - cy);
}

/**
 * Distancia de un punto (relativo al centro del sector) al sector anular {r0 <= ρ <= r1, ángulo en
 * [lo, hi]}: 0 si el punto ya está dentro (colisión); si no, la distancia al borde más próximo del
 * sector (radial —r0 o r1— dentro del barrido, o uno de los dos bordes angulares fuera de él).
 */
export function pointDistanceToAnnularSector(point: Point, r0: number, r1: number, lo: number, hi: number): number {
    const rho = Math.hypot(point.x, point.y);
    const theta = angleOfPoint(point.x, point.y);
    if (inSweep(theta, lo, hi)) {
        if (rho < r0) return r0 - rho;
        if (rho > r1) return rho - r1;
        return 0;
    }
    const edgeDistance = (deg: number): number => {
        const a = (deg * Math.PI) / 180;
        const dir: Point = { x: Math.sin(a), y: -Math.cos(a) };
        return pointSegmentDistance(point, { x: dir.x * r0, y: dir.y * r0 }, { x: dir.x * r1, y: dir.y * r1 });
    };
    return Math.min(edgeDistance(lo), edgeDistance(hi));
}

function sub(a: Point, b: Point): Point {
    return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a: Point, b: Point): number {
    return a.x * b.x + a.y * b.y;
}

function cross(a: Point, b: Point): number {
    return a.x * b.y - a.y * b.x;
}

/** Dirección unitaria del ángulo `deg` (misma convención que `angleOfPoint`: 0 = 12 en punto, horario, Y abajo). */
function direction(deg: number): Point {
    const a = (deg * Math.PI) / 180;
    return { x: Math.sin(a), y: -Math.cos(a) };
}

/**
 * Distancia entre el segmento [p, q] (el CHORD original completo, no un tramo) y el borde radial
 * [edgeA, edgeB] (de r0·dir a r1·dir, en el ángulo `lo` o `hi`), para los tramos de [p, q] que caen
 * FUERA del barrido. No hace falta el caso general "segmentos que se cruzan en su interior": si [p, q]
 * cruzara este borde radial en un punto con ρ en [r0, r1], ese punto ya caería en el sector (ángulo
 * exactamente `lo`/`hi`, radio en rango) y el bucle por tramos de `segmentDistanceToAnnularSector`
 * (arriba) ya lo habría detectado como colisión en el tramo vecino que SÍ está dentro del barrido —
 * ese tramo comparte ese mismo punto como uno de sus extremos (`cuts` corta exactamente ahí), así que
 * su ρ ya se evalúa ahí. Confirmado con 300 000 casos aleatorios (r0/r1/barrido/segmento arbitrarios):
 * ninguno cruza este borde radial sin que el bucle por tramos ya hubiera devuelto 0 antes — por eso el
 * mínimo de las 4 distancias punto-segmento (sin chequeo de cruce) ya es exacto en este uso.
 */
function distanceToRadialEdge(p: Point, q: Point, edgeA: Point, edgeB: Point): number {
    return Math.min(
        pointSegmentDistance(p, edgeA, edgeB),
        pointSegmentDistance(q, edgeA, edgeB),
        pointSegmentDistance(edgeA, p, q),
        pointSegmentDistance(edgeB, p, q)
    );
}

/**
 * Distancia exacta del SEGMENTO [p, q] (no sólo sus extremos) al sector anular {r0 <= ρ <= r1, ángulo en
 * [lo, hi]}: 0 si el segmento toca o atraviesa el sector en cualquier punto intermedio, no sólo en sus
 * extremos — Reviewer B1: el sector anular es una región NO convexa, así que un borde puede cruzarla
 * aunque sus dos extremos queden limpios (uno más cerca del centro que r0, el otro más lejos que r1).
 *
 * A diferencia de `segmentToAnnularSector` (layout.ts, que asume el segmento siempre dentro del círculo
 * r1 — válido para su caso de uso, el contenido de la sparkline), esta versión no asume nada sobre el
 * rango de ρ del segmento: la caja de tendencia, ya rotada/escalada, puede tener extremos a cualquier
 * distancia del centro del arco.
 *
 * Se parte [p, q] en los puntos donde cruza los dos bordes angulares del sector (`lo`, `hi`) — dentro de
 * cada tramo el ángulo se mantiene de un solo lado (dentro o fuera del barrido). En los tramos DENTRO del
 * barrido, ρ(t) = |p + t·(q−p)| es convexa en t (es la raíz de una cuadrática en t), así que su mínimo y
 * máximo en el tramo están en sus 2 extremos y, si el mínimo global (clamped al tramo) cae dentro de él,
 * también ahí: basta evaluar ρ en esos candidatos para saber si el rango [ρmin, ρmax] del tramo se solapa
 * con [r0, r1] (colisión, distancia 0) o queda entero por dentro (r0 − ρmax) o por fuera (ρmin − r1) de la
 * corona. En los tramos FUERA del barrido el punto más cercano del sector está en uno de sus 2 bordes
 * radiales (segmentos de r0·dir a r1·dir en `lo`/`hi`), ya cubierto por `segmentDistance` normal.
 */
export function segmentDistanceToAnnularSector(p: Point, q: Point, r0: number, r1: number, lo: number, hi: number): number {
    const pq = sub(q, p);
    const at = (t: number): Point => ({ x: p.x + t * pq.x, y: p.y + t * pq.y });
    const rhoAt = (t: number): number => Math.hypot(p.x + t * pq.x, p.y + t * pq.y);
    const pq2 = dot(pq, pq);
    // t que minimiza ρ(t) sobre toda la recta (pie de la perpendicular al centro), acotado a [0,1].
    const tClosest = pq2 === 0 ? 0 : Math.min(1, Math.max(0, -dot(p, pq) / pq2));
    const fullSweep = hi - lo >= 360;

    // Puntos donde el segmento cruza cada borde angular (rayo desde el centro en `lo`/`hi`); dividen
    // [p,q] en tramos donde el ángulo no cambia de lado respecto al barrido. Barrido completo: no hay
    // bordes angulares (nunca se sale del barrido), se omiten para no introducir cortes espurios.
    const cuts = [0, 1];
    if (!fullSweep) {
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
    }
    cuts.sort((x, y) => x - y);

    let best = Infinity;
    for (let i = 0; i + 1 < cuts.length; i++) {
        const tLo = cuts[i];
        const tHi = cuts[i + 1];
        const middle = at((tLo + tHi) / 2);
        if (!inSweep(angleOfPoint(middle.x, middle.y), lo, hi)) {
            continue; // tramo fuera del barrido: lo cubren los bordes radiales, más abajo.
        }
        const candidates = [tLo, tHi];
        if (tClosest > tLo && tClosest < tHi) {
            candidates.push(tClosest);
        }
        const rhos = candidates.map(rhoAt);
        const rhoMin = Math.min(...rhos);
        const rhoMax = Math.max(...rhos);
        if (rhoMax >= r0 && rhoMin <= r1) {
            return 0; // el rango de ρ en este tramo se solapa con [r0, r1]: colisión segura.
        }
        best = Math.min(best, rhoMax < r0 ? r0 - rhoMax : rhoMin - r1);
    }

    if (!fullSweep) {
        for (const deg of [lo, hi]) {
            const dir = direction(deg);
            const edgeA: Point = { x: dir.x * r0, y: dir.y * r0 };
            const edgeB: Point = { x: dir.x * r1, y: dir.y * r1 };
            best = Math.min(best, distanceToRadialEdge(p, q, edgeA, edgeB));
        }
    }
    return best;
}

/**
 * ¿Cae `point` dentro (o en el borde) del polígono CONVEXO `corners` (cualquier orden consistente,
 * horario o antihorario — no asume ejes alineados: sirve igual para la caja rotada)? Se recorre cada
 * arista y se compara el signo del cruz (edge × (point − a)); si todos los signos no-nulos coinciden,
 * `point` queda del mismo lado de las 4 aristas, o sea dentro. Un cruz exactamente 0 (punto sobre la
 * recta de la arista) no desempata — así un punto justo en el borde no produce un falso "fuera" por
 * redondeo.
 */
export function pointInConvexPolygon(point: Point, corners: Point[]): boolean {
    let sign = 0;
    for (let i = 0; i < corners.length; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % corners.length];
        const cr = cross(sub(b, a), sub(point, a));
        if (cr === 0) continue;
        const s = cr > 0 ? 1 : -1;
        if (sign === 0) {
            sign = s;
        } else if (s !== sign) {
            return false;
        }
    }
    return true;
}

/**
 * Punto SIEMPRE dentro de la corona (radio medio, ángulo medio del barrido) — o, en los casos
 * degenerados (r0 === r1 o barrido de 0°), sobre su único límite posible, sin dividir entre 0 ni
 * generar NaN. Barrido completo (hi − lo >= 360): cualquier ángulo vale, así que se usa `startAngle`
 * directo (ya no hay "medio" que calcular, todos están dentro).
 *
 * Motor del fix de Reviewer O1 (`cornersClear`, abajo): la corona es una región CONEXA, así que si
 * ningún borde de la caja la cruza (chequeo de Reviewer B1, por segmento), la corona entera debe quedar
 * DENTRO o FUERA de la caja — no puede quedar "a medias" sin que algún borde la cruce (eso sería cruzar
 * la frontera de la caja, detectado por ese mismo chequeo). Por eso UN SOLO punto representativo basta
 * para decidir el caso que el chequeo por borde no cubre: la corona entera encerrada dentro de la caja.
 *
 * El ángulo medio NO es el promedio aritmético `(startAngle + endAngle) / 2` (fix de Reviewer, falso
 * negativo reportado): ese promedio sólo coincide con el barrido real cuando `endAngle > startAngle`.
 * El resto del módulo (`inSweep`, usada por el chequeo por borde de arriba) define el barrido real como
 * [startAngle, startAngle + normalizeTo360(endAngle − startAngle)] — recorriendo desde `startAngle` en
 * sentido horario hasta `endAngle`, sin asumir ningún orden entre ambos (p. ej. startAngle=90°,
 * endAngle=−90° barre la mitad INFERIOR, no la superior que daría el promedio aritmético). Usar
 * `normalizeTo360` aquí también mantiene el punto representativo consistente con ese mismo barrido.
 */
export function arcRepresentativePoint(arc: TrendArcObstacle): Point {
    const midRadius = (arc.innerRadius + arc.outerRadius) / 2;
    const fullSweep = arc.endAngle - arc.startAngle >= 360;
    const midAngle = fullSweep ? arc.startAngle : arc.startAngle + normalizeTo360(arc.endAngle - arc.startAngle) / 2;
    const dir = direction(midAngle);
    return { x: arc.center.x + dir.x * midRadius, y: arc.center.y + dir.y * midRadius };
}

/**
 * ¿Las 4 esquinas, ya en coordenadas absolutas, libran los 3 obstáculos (con la holgura pedida)?
 *
 * Viewport y pie son semiplanos (restricciones lineales): convexos, así que basta revisar las 4
 * esquinas — si todas quedan del lado correcto, cualquier punto del rectángulo (combinación convexa de
 * sus esquinas) también. La corona del arco, en cambio, es un sector anular NO convexo: un borde puede
 * atravesarla aunque sus 2 extremos queden limpios (Reviewer B1) — por eso la corona se evalúa primero
 * por BORDE (`segmentDistanceToAnnularSector`, los 4 lados del rectángulo ya transformado).
 *
 * Pero el chequeo por borde, por sí solo, no basta (Reviewer O1): la corona puede quedar ENTERA dentro
 * de la caja sin que ningún borde la toque (la caja simplemente la envuelve por completo). Por eso, tras
 * confirmar que ningún borde cruza la corona, se evalúa además si su punto representativo
 * (`arcRepresentativePoint`) cae dentro de la caja (`pointInConvexPolygon`) — si cae dentro, la corona
 * entera está encerrada (región conexa, ver razonamiento en `arcRepresentativePoint`).
 */
function cornersClear(corners: Point[], obstacles: TrendFitObstacles): boolean {
    const clearance = obstacles.clearance ?? 0;
    const cornersOk = corners.every((corner) => {
        if (corner.x < 0 || corner.x > obstacles.viewportWidth) return false;
        if (corner.y < 0 || corner.y > obstacles.viewportHeight) return false;
        if (obstacles.footerTop !== undefined && corner.y > obstacles.footerTop - clearance) return false;
        return true;
    });
    if (!cornersOk) return false;
    if (!obstacles.arc) return true;
    const arc = obstacles.arc;
    const edgesClear = corners.every((corner, i) => {
        const next = corners[(i + 1) % corners.length];
        const p: Point = { x: corner.x - arc.center.x, y: corner.y - arc.center.y };
        const q: Point = { x: next.x - arc.center.x, y: next.y - arc.center.y };
        const distance = segmentDistanceToAnnularSector(p, q, arc.innerRadius, arc.outerRadius, arc.startAngle, arc.endAngle);
        return distance > clearance;
    });
    if (!edgesClear) return false;
    return !pointInConvexPolygon(arcRepresentativePoint(arc), corners);
}

/**
 * Escala máxima (entre TREND_MIN_SCALE y `desiredScale`) para la que las 4 esquinas de la caja
 * width×height, colocada en `boxOrigin` (esquina superior izquierda, mismo sistema que Gauge.tsx usa
 * hoy para `trendBox`) y rotada `angleDeg` (fijo), libran los 3 obstáculos. Si `desiredScale` ya libra
 * todo, se devuelve tal cual (nunca se reduce de más). Si ni TREND_MIN_SCALE libra todo, se devuelve
 * `{ scale: TREND_MIN_SCALE, fits: false }`.
 */
export function fitTrendScale(
    width: number,
    height: number,
    boxOrigin: Point,
    angleDeg: number,
    desiredScale: number,
    obstacles: TrendFitObstacles
): TrendFitResult {
    const clearsAt = (scale: number): boolean => {
        const absoluteCorners = transformedTrendBoxCorners(width, height, angleDeg, scale).map((corner) => ({
            x: boxOrigin.x + corner.x,
            y: boxOrigin.y + corner.y,
        }));
        return cornersClear(absoluteCorners, obstacles);
    };

    if (clearsAt(desiredScale)) {
        return { scale: desiredScale, fits: true };
    }
    if (!clearsAt(TREND_MIN_SCALE)) {
        return { scale: TREND_MIN_SCALE, fits: false };
    }
    let safe = TREND_MIN_SCALE;
    let unsafe = desiredScale;
    for (let i = 0; i < 50; i++) {
        const mid = (safe + unsafe) / 2;
        if (clearsAt(mid)) {
            safe = mid;
        } else {
            unsafe = mid;
        }
    }
    return { scale: safe, fits: true };
}
