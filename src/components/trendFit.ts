import { Point, applyTrendTransform, trendBoxCorners } from "./trendTransform";
import { TrendDrawnShapes } from "./trend";

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

/**
 * 0.4.1.1 (fix final QA rotación 30°/Barras, DICTAMEN-QA.md) — el usuario autorizó LIMITAR el ángulo de
 * la serie («Gráfico de tendencia») cuando la homotecia de escala (`fitTrendScaleForShapes`, arriba) no
 * basta para separarla del arco, en vez de tolerar la colisión documentada a ±30°/45°/90° (versión
 * anterior de esta rama, `tests/trendRotationMatrixIndependentCollision.test.ts`) o de forzar un recorte
 * visual (clip-path, prohibido en todo este módulo).
 *
 * Valor determinado EMPÍRICAMENTE, no estimado: se barrieron las 16 combinaciones de posición/tamaño
 * AUTOMÁTICOS (2 tamaños de tarjeta reales del reporte, 430×338/430×268 × 4 `TrendChartType` ×
 * `trendShowProgrammed` true/false) a cada ángulo entero de 0° a 45° (ambos signos), verificando colisión
 * con la MISMA implementación independiente (no `fitTrendScaleForShapes`, para no heredar un posible bug
 * de cableado) que `tests/trendRotationMatrixIndependentCollision.test.ts` usa. Resultado:
 *  - +21° es el primer entero POSITIVO que colisiona (chartType "area", ambos tamaños de tarjeta).
 *  - −9° es el primer entero NEGATIVO que colisiona (chartType "area" primero; "line"/"lineDots" se unen
 *    a partir de magnitudes mayores). La asimetría viene de que el barrido del arco por omisión
 *    (−120°..60°, NO simétrico respecto al vertical) combinado con que "area" dibuja un polígono a TODO
 *    el ancho de la caja hasta su borde superior (el contenido con mayor brazo de palanca respecto al
 *    pivote, la esquina inferior izquierda) hace que una rotación negativa acerque esa esquina lejana al
 *    arco antes que una positiva de la misma magnitud.
 * El máximo SIMÉTRICO (±A con 0 colisiones en AMBOS signos, las 16 combinaciones) es
 * min(20, 8) = 8 — confirmado idéntico aplicando `TREND_SAFETY_CLEARANCE` (abajo) en el fitter: el margen
 * no desplaza esta frontera (los casos que colisionan ya agotan el piso `TREND_MIN_SCALE`, no son un
 * artefacto de redondeo que el margen pudiera evitar). Queda por DEBAJO de una expectativa inicial de
 * ~15° porque esa cifra no consideraba el signo negativo ni el chartType "area"; se documenta el valor
 * real (8°) en vez de forzarlo. Si se cambia cualquier parámetro que afecte esta geometría (barrido del
 * arco por omisión, TREND_MIN_SCALE, el padding/holgura de la caja automática), este valor debe
 * RE-verificarse con el mismo barrido — nunca ajustarse a ojo.
 */
export const TREND_MAX_ANGLE_DEG = 8;

/**
 * 0.4.1.1 — margen mínimo de seguridad (px) que el FITTER de producción (Gauge.tsx, vía `clearance` en
 * `TrendFitObstacles`) exige de más frente al pie y al arco, por encima de la holgura geométrica exacta:
 * cubre el redondeo de precisión del `matrix(...)` emitido (`MATRIX_PRECISION`, trendTransform.ts — ver
 * los 3 casos de redondeo documentados en la versión anterior de
 * `tests/trendRotationMatrixIndependentCollision.test.ts`) sin necesidad de enumerar casos por redondeo
 * uno a uno. El VERIFICADOR independiente de colisión (ese mismo archivo de pruebas) sigue evaluando con
 * `clearance = 0` (sin ningún margen): este valor sólo entra al FITTER que decide la escala/ángulo
 * efectivos, nunca a la medición de si el resultado final realmente colisiona.
 */
export const TREND_SAFETY_CLEARANCE = 0.5;

/** Recorta `angleDeg` a ±TREND_MAX_ANGLE_DEG, preservando el signo — mismo criterio que
 * `fitTrendAngleAndScaleForShapes` aplica antes de buscar una escala/ángulo seguros, y que
 * settings.ts/visual.ts usan para validar/mostrar el panel y sanear el valor en tiempo de ejecución. */
export function clampTrendAngle(angleDeg: number): number {
    return Math.max(-TREND_MAX_ANGLE_DEG, Math.min(TREND_MAX_ANGLE_DEG, angleDeg));
}

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
    /**
     * Corona(s) del arco del medidor a evitar: normalmente la banda (+ sobresaliente de marcadores) y,
     * cuando «Mostrar Rangos» está activo, TAMBIÉN el anillo delgado del indicador del semáforo
     * (`semaphore-indicator`/PerformanceArc, `semaphoreIndicatorRing` en arcUtils.ts) — un sector anular
     * DISTINTO, de radio MENOR (vive por dentro del radio interior de la banda, nunca se superpone con
     * ella; ver su JSDoc). `computeInnerTrendBox` (layout.ts) ya exige esa doble holgura al dimensionar
     * la caja a ángulo 0; esta lista generaliza el mismo chequeo a la geometría YA rotada/escalada (fix
     * QA rotación 30°/Barras, DICTAMEN-QA.md: una rotación puede acercar el contenido al anillo sin que
     * la banda sola lo detecte). Un único objeto sigue aceptado; se omite si no aplica ningún arco.
     */
    arc?: TrendArcObstacle | TrendArcObstacle[];
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
 * ¿El polígono (esquinas absolutas, orden consistente) libra la corona de un arco (con la holgura
 * pedida)? La corona del arco es un sector anular NO convexo: un borde puede atravesarla aunque sus 2
 * extremos queden limpios (Reviewer B1) — por eso se evalúa primero por BORDE
 * (`segmentDistanceToAnnularSector`). Eso solo, por sí mismo, no basta (Reviewer O1): la corona puede
 * quedar ENTERA dentro del polígono sin que ningún borde la toque; por eso, tras confirmar que ningún
 * borde cruza la corona, se evalúa además si su punto representativo (`arcRepresentativePoint`) cae
 * dentro del polígono (`pointInConvexPolygon` — válido para cualquier polígono CONVEXO, p. ej. una barra
 * rectangular o la caja nominal, rotados o no; las formas que construye `buildTrendDrawnShapes` son
 * siempre convexas: rectángulos de barra/segmento engrosado, o la caja nominal).
 */
function polygonClearsArc(corners: Point[], arc: TrendArcObstacle, clearance: number): boolean {
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

/** ¿El círculo (centro absoluto, radio ya escalado) libra la corona de un arco (con la holgura pedida)?
 * Un círculo es convexo: basta que la distancia de su centro al sector anular (`pointDistanceToAnnularSector`,
 * ya exacta — 0 si el centro cae dentro) exceda su radio — no hace falta un chequeo de encierro aparte
 * (ver razonamiento en `fitTrendScaleForShapes`). */
function circleClearsArc(circle: { center: Point; radius: number }, arc: TrendArcObstacle, clearance: number): boolean {
    const relative: Point = { x: circle.center.x - arc.center.x, y: circle.center.y - arc.center.y };
    const distance = pointDistanceToAnnularSector(relative, arc.innerRadius, arc.outerRadius, arc.startAngle, arc.endAngle);
    return distance > clearance + circle.radius;
}

/** ¿El polígono (esquinas absolutas) libra el viewport y el pie (semiplanos convexos: basta revisar las
 * esquinas — si todas quedan del lado correcto, cualquier punto del polígono, combinación convexa de
 * sus esquinas, también)? */
function polygonClearsViewportAndFooter(corners: Point[], obstacles: TrendFitObstacles): boolean {
    const clearance = obstacles.clearance ?? 0;
    return corners.every((corner) => {
        if (corner.x < 0 || corner.x > obstacles.viewportWidth) return false;
        if (corner.y < 0 || corner.y > obstacles.viewportHeight) return false;
        if (obstacles.footerTop !== undefined && corner.y > obstacles.footerTop - clearance) return false;
        return true;
    });
}

/** ¿El círculo (centro absoluto, radio ya escalado) libra el viewport y el pie? */
function circleClearsViewportAndFooter(circle: { center: Point; radius: number }, obstacles: TrendFitObstacles): boolean {
    const clearance = obstacles.clearance ?? 0;
    const { center, radius } = circle;
    if (center.x - radius < 0 || center.x + radius > obstacles.viewportWidth) return false;
    if (center.y - radius < 0 || center.y + radius > obstacles.viewportHeight) return false;
    if (obstacles.footerTop !== undefined && center.y + radius > obstacles.footerTop - clearance) return false;
    return true;
}

function normalizeArcs(arc: TrendFitObstacles["arc"]): TrendArcObstacle[] {
    if (!arc) return [];
    return Array.isArray(arc) ? arc : [arc];
}

/**
 * ¿El conjunto de formas (ya en coordenadas absolutas, geometría REAL transformada — no una
 * aproximación por caja) libra el viewport, el pie y cada arco de `obstacles.arc`? Un círculo nunca
 * necesita el chequeo de "encierro" que sí hace falta para polígonos (Reviewer O1): es convexo y su
 * intersección con el sector anular (otro conjunto, no necesariamente convexo) es no vacía si y solo si
 * la distancia de su centro al sector es <= su radio — exactamente lo que `circleClearsArc` evalúa; no
 * hay un caso "la corona cae entera dentro del círculo sin tocar su borde" que ese chequeo no cubra ya
 * (la distancia centro→sector ya captura cualquier solapamiento, sea parcial o total).
 */
function shapesClear(shapes: TrendDrawnShapes, obstacles: TrendFitObstacles): boolean {
    const polysOk = shapes.polygons.every((polygon) => polygonClearsViewportAndFooter(polygon, obstacles));
    const circlesOk = shapes.circles.every((circle) => circleClearsViewportAndFooter(circle, obstacles));
    if (!polysOk || !circlesOk) return false;
    const clearance = obstacles.clearance ?? 0;
    const arcs = normalizeArcs(obstacles.arc);
    return arcs.every(
        (arc) =>
            shapes.polygons.every((polygon) => polygonClearsArc(polygon, arc, clearance)) &&
            shapes.circles.every((circle) => circleClearsArc(circle, arc, clearance))
    );
}

/**
 * Escala máxima (entre TREND_MIN_SCALE y `desiredScale`) para la que la geometría REAL dibujada
 * (`shapes`, en coordenadas LOCALES — polígonos y círculos de `buildTrendDrawnShapes`, trend.ts), ya
 * rotada `angleDeg` (fijo) y escalada, y colocada en `boxOrigin` (mismo pivote/sistema que `fitTrendScale`
 * usa para la caja — esquina inferior izquierda LOCAL en (0, height)), libra los obstáculos (viewport,
 * pie y cada arco de `obstacles.arc`). Si `desiredScale` ya libra todo, se devuelve tal cual (nunca se
 * reduce de más). Si ni TREND_MIN_SCALE libra todo, se devuelve `{ scale: TREND_MIN_SCALE, fits: false }`.
 *
 * Fix QA rotación 30°/Barras (DICTAMEN-QA.md): a diferencia de `fitTrendScale` (que prueba sólo las 4
 * esquinas del rectángulo NOMINAL de la caja — válido para "lineDots"/"line"/"area", cuyo contenido real
 * nunca sale de ese rectángulo, pero NO para "bars", cuyas barras extremas pueden sobresalir en X), esta
 * función prueba la geometría REAL de cada forma — nunca puede pasar por alto un sobresaliente real. El
 * radio de cada círculo también se escala (mismo factor que sus coordenadas: un `transform` SVG de
 * rotación+escala uniforme escala el trazo/radio renderizado igual que las posiciones).
 */
export function fitTrendScaleForShapes(
    height: number,
    boxOrigin: Point,
    angleDeg: number,
    desiredScale: number,
    shapes: TrendDrawnShapes,
    obstacles: TrendFitObstacles
): TrendFitResult {
    const transformPoint = (point: Point, scale: number): Point => {
        const transformed = applyTrendTransform(point, height, angleDeg, scale);
        return { x: boxOrigin.x + transformed.x, y: boxOrigin.y + transformed.y };
    };
    const clearsAt = (scale: number): boolean => {
        const absolute: TrendDrawnShapes = {
            polygons: shapes.polygons.map((polygon) => polygon.map((corner) => transformPoint(corner, scale))),
            circles: shapes.circles.map((circle) => ({ center: transformPoint(circle.center, scale), radius: circle.radius * scale })),
        };
        return shapesClear(absolute, obstacles);
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

/**
 * Escala máxima (entre TREND_MIN_SCALE y `desiredScale`) para la que las 4 esquinas de la caja
 * width×height, colocada en `boxOrigin` (esquina superior izquierda, mismo sistema que Gauge.tsx usa
 * hoy para `trendBox`) y rotada `angleDeg` (fijo), libran los 3 obstáculos. Si `desiredScale` ya libra
 * todo, se devuelve tal cual (nunca se reduce de más). Si ni TREND_MIN_SCALE libra todo, se devuelve
 * `{ scale: TREND_MIN_SCALE, fits: false }`.
 *
 * Caso particular de `fitTrendScaleForShapes` (un único polígono: la caja NOMINAL completa, sin
 * círculos) — delega en ella, nunca un cálculo paralelo. Válido tal cual para "lineDots"/"line"/"area"
 * (su contenido real nunca sale de ese rectángulo, por construcción de `computeInnerTrendBox`/
 * TREND_PADDING); para "bars" (que SÍ puede sobresalir en X) usar `fitTrendScaleForShapes` con la
 * geometría real de `buildTrendDrawnShapes` (trend.ts) — ver Gauge.tsx.
 */
export function fitTrendScale(
    width: number,
    height: number,
    boxOrigin: Point,
    angleDeg: number,
    desiredScale: number,
    obstacles: TrendFitObstacles
): TrendFitResult {
    return fitTrendScaleForShapes(height, boxOrigin, angleDeg, desiredScale, { polygons: [trendBoxCorners(width, height)], circles: [] }, obstacles);
}

/** Resultado de `fitTrendAngleAndScaleForShapes`: además de la escala, el ÁNGULO efectivamente usado
 * (puede ser menor en magnitud que el pedido — nunca mayor, nunca cambia de signo). */
export interface TrendAngleFitResult {
    angle: number;
    scale: number;
    /** false: ni siquiera el ángulo 0° libra los obstáculos con TREND_MIN_SCALE; `angle` queda en 0° y
     * `scale` en el piso igualmente — nunca se inventa una posición ni se fuerza un recorte visual. */
    fits: boolean;
}

/**
 * Generaliza `fitTrendScaleForShapes` para también limitar/ajustar el ÁNGULO de la serie, no sólo su
 * escala — fix final QA rotación 30°/Barras (DICTAMEN-QA.md), autorizado por el usuario: LIMITAR el
 * ángulo cuando la homotecia de escala por sí sola no basta para separar la geometría REAL dibujada del
 * arco, en vez de tolerar la colisión o forzar un recorte visual (clip-path).
 *
 * Dos pasos, siempre en este orden, nunca mueve X/Y ni el pivote (esquina inferior izquierda LOCAL en
 * (0, height), igual que `fitTrendScaleForShapes`):
 *
 * 1. Recorta `desiredAngleDeg` a ±TREND_MAX_ANGLE_DEG (`clampTrendAngle`) — el límite GLOBAL, válido para
 *    la posición/tamaño AUTOMÁticos de la caja (ver JSDoc de TREND_MAX_ANGLE_DEG: con esos 16 escenarios,
 *    ningún ángulo dentro de ±A colisiona, así que este paso por sí solo YA es suficiente la inmensa
 *    mayoría de las veces — el 2º paso es un no-op en ese caso, `fitTrendScaleForShapes` encuentra una
 *    escala válida al primer intento).
 * 2. Si ese ángulo (ya recortado) NO libra los obstáculos ni con TREND_MIN_SCALE (`fitTrendScaleForShapes`
 *    devuelve `fits:false`) — lo que SÍ puede ocurrir con posición/tamaño PERSONALIZADOS del panel, una
 *    caja que el límite global no contempla — busca de forma DETERMINISTA (bisección en el valor
 *    ABSOLUTO del ángulo, mismo patrón de 50 iteraciones que la bisección de escala, nunca aleatoria) el
 *    mayor ángulo (mismo signo que el recortado, hacia 0°) para el que SÍ exista una escala válida en
 *    [TREND_MIN_SCALE, desiredScale]. Si NI SIQUIERA 0° libra los obstáculos (p. ej. el propio pivote ya
 *    colisiona, una caja personalizada mal ubicada), se documenta explícito: `{ angle: 0, scale:
 *    TREND_MIN_SCALE, fits: false }` — nunca se inventa una posición distinta ni se recorta el contenido.
 */
export function fitTrendAngleAndScaleForShapes(
    height: number,
    boxOrigin: Point,
    desiredAngleDeg: number,
    desiredScale: number,
    shapes: TrendDrawnShapes,
    obstacles: TrendFitObstacles
): TrendAngleFitResult {
    const fitAt = (angle: number): TrendFitResult => fitTrendScaleForShapes(height, boxOrigin, angle, desiredScale, shapes, obstacles);

    const clampedAngle = clampTrendAngle(desiredAngleDeg);
    const atClamped = fitAt(clampedAngle);
    if (atClamped.fits) {
        return { angle: clampedAngle, scale: atClamped.scale, fits: true };
    }

    const atZero = fitAt(0);
    if (!atZero.fits) {
        // Ni siquiera el ángulo 0° libra los obstáculos con el piso de escala: se documenta explícito,
        // nunca se fuerza un recorte (clip-path) ni se inventa una posición distinta.
        return { angle: 0, scale: atZero.scale, fits: false };
    }

    // Búsqueda determinista hacia 0°: bisección en |ángulo|, preservando el signo de `clampedAngle`.
    const sign = clampedAngle < 0 ? -1 : 1;
    let safeMagnitude = 0; // atZero.fits === true, confirmado arriba.
    let unsafeMagnitude = Math.abs(clampedAngle);
    for (let i = 0; i < 50; i++) {
        const midMagnitude = (safeMagnitude + unsafeMagnitude) / 2;
        if (fitAt(sign * midMagnitude).fits) {
            safeMagnitude = midMagnitude;
        } else {
            unsafeMagnitude = midMagnitude;
        }
    }
    const finalAngle = sign * safeMagnitude;
    return { angle: finalAngle, scale: fitAt(finalAngle).scale, fits: true };
}
