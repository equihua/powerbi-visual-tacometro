// Harness: instancia la clase Visual REAL (../../src/visual.ts) y le pasa
// VisualUpdateOptions mock con columnas por rol, igual que Power BI. Así las
// props de <Gauge> se construyen con extractSettings/extractGaugeData del visual
// (sin duplicar lógica).
import { Visual } from "../../src/visual";

type RoleName =
    | "measure" | "min" | "max" | "target" | "lowThreshold" | "midThreshold"
    | "targetWithMargin" | "programmed" | "previousMonth" | "semaphore" | "currentPeriod" | "trendSemaphore";
type Cell = number | string | null;
type Roles = Partial<Record<RoleName, Cell>>;
type Series = Partial<Record<RoleName, Cell[]>>;
type Objects = Record<string, Record<string, unknown>>;

const VIEWPORT = { width: 300, height: 300 };

/** DataView sin periodo (un valor agregado por rol), como en 0.2.0.0. */
function buildDataView(roles: Roles, objects: Objects = {}, format?: string): any {
    const values = Object.entries(roles).map(([role, value]) => ({
        source: { displayName: role, roles: { [role]: true }, format: role === "measure" ? format : undefined },
        values: [value],
    }));
    return { metadata: { columns: values.map((v) => v.source), objects }, categorical: { values } };
}

/**
 * 0.3.0.0: DataView con el rol «period» (Grouping) y, opcional, «periodOrder» (clave POA_Mes[Mes]):
 * una fila por mes en cada medida. `hostRows` reordena las filas para simular un orden de host
 * distinto del cronológico (el visual debe ordenar por la clave).
 */
function buildMonthlyDataView(period: string[], series: Series, objects: Objects = {}, format?: string,
    order?: number[], hostRows?: number[]): any {
    const rows = hostRows ?? period.map((_, i) => i);
    const pick = <T>(cells: T[]) => rows.map((row) => cells[row]);
    const values = Object.entries(series).map(([role, cells]) => ({
        source: { displayName: role, roles: { [role]: true }, format: role === "measure" ? format : undefined },
        values: pick(cells as Cell[]),
    }));
    const categories: any[] = [{ source: { displayName: "Abrev", roles: { period: true } }, values: pick(period) }];
    if (order) categories.push({ source: { displayName: "Mes", roles: { periodOrder: true } }, values: pick(order) });
    return {
        metadata: { columns: [...categories.map((c) => c.source), ...values.map((v) => v.source)], objects },
        categorical: { categories, values },
    };
}

/**
 * Host mínimo: servicios que usan update() e interacciones (A3) como funciones vacías.
 * Con `host: {}` (versión previa del harness) update() fallaba desde 0.2.0.0 por eventService.
 */
function mockHost(highContrast = false, tooltipHost?: HTMLElement): any {
    const noop = () => undefined;
    return {
        createSelectionManager: () => ({ showContextMenu: noop }),
        eventService: { renderingStarted: noop, renderingFinished: noop, renderingFailed: noop },
        // 0.3.2.1: tooltipService simulado que pinta los dataItems recibidos (como el tooltip del host de
        // Power BI) en un div .harness-tooltip, para evidenciar qué datos muestra el visual al hover.
        tooltipService: tooltipHost ? mockTooltipService(tooltipHost) : { enabled: () => false, show: noop, hide: noop },
        hostCapabilities: { allowInteractions: true },
        colorPalette: highContrast
            ? { isHighContrast: true, foreground: { value: "#FFFF00" }, background: { value: "#000000" } }
            : { isHighContrast: false },
    };
}

/** Tooltip del host simulado: muestra `displayName: value` en las coordenadas que pide el visual. */
function mockTooltipService(card: HTMLElement): any {
    const box = document.createElement("div");
    box.className = "harness-tooltip";
    box.style.cssText = "position:absolute;display:none;pointer-events:none;background:#fff;border:1px solid #888;" +
        "box-shadow:0 2px 6px rgba(0,0,0,.25);padding:4px 6px;font-size:11px;line-height:1.35;z-index:10;white-space:nowrap";
    card.style.position = "relative";
    card.appendChild(box);
    return {
        enabled: () => true,
        show: (options: { dataItems: Array<{ displayName: string; value: string }>; coordinates: number[] }) => {
            const visual = card.querySelector(".visual") as HTMLElement;
            box.innerHTML = options.dataItems.map((item) => `<div><b>${item.displayName}</b>: ${item.value}</div>`).join("");
            box.style.left = `${visual.offsetLeft + options.coordinates[0] + 12}px`;
            box.style.top = `${visual.offsetTop + options.coordinates[1] + 12}px`;
            box.style.display = "block";
        },
        hide: () => { box.style.display = "none"; },
    };
}

interface Scenario {
    id: string;
    title: string;
    roles?: Roles;
    /** 0.3.0.0: meses del rol «period» y una serie por rol. */
    period?: string[];
    /** Revisión: clave de orden (rol «Orden del periodo») y orden de filas del host. */
    order?: number[];
    hostRows?: number[];
    series?: Series;
    format?: string;
    objects?: Objects;
    animateTo?: number;
    highContrast?: boolean;
    /** 0.3.1.0: tamaño de la tarjeta (por defecto 300x300) para probar el layout responsivo. */
    viewport?: { width: number; height: number };
}

// Serie tipo TableroMaestro (POA Real / POA Programado / POA Semáforo por POA_Mes[Abrev]):
// Real hasta octubre, Programado todo el año; el mes actual es el último con Real (Oct).
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const REAL: Cell[] = [72.1, 78.4, 81.0, 79.5, 85.2, 88.9, 86.3, 90.1, 93.4, 91.47, null, null];
const PROG: Cell[] = [70, 75, 80, 82, 85, 87, 89, 91, 93, 95, 97, 100];
// 0.3.2.0: «Real mes anterior» por fila = Real del mes previo (Oct → Sep 93.4; Jun → May 85.2).
const PREV: Cell[] = [null, ...REAL.slice(0, -1)];
const SEM: Cell[] = ["Rojo", "Rojo", "Amarillo", "Rojo", "Amarillo", "Verde", "Amarillo", "Amarillo", "Verde", "Amarillo", null, null];
const constant = (value: number): Cell[] => MONTHS.map(() => value);
const MONTH_KEYS = MONTHS.map((_, i) => i + 1); // POA_Mes[Mes]
// «Semáforo por periodo» = POA Semáforo mes color (en blanco sin Real); el del medidor, POA Semáforo color.
const POA_SERIES: Series = {
    measure: REAL, programmed: PROG, previousMonth: PREV, semaphore: SEM, trendSemaphore: SEM,
    min: constant(0), max: constant(120), target: constant(95), targetWithMargin: constant(95),
    lowThreshold: constant(80), midThreshold: constant(95),
};
// Revisión 0.3.2.0: «Real & Mes anterior» = Real SIN recortar − Real mes anterior, verde si favorable / rojo si no.
// Dos meses (Sep → Oct) sin semáforo de la fuente: el color de zona del medidor sale de los umbrales 80/95.
const prevSeries = (sep: number, oct: number): Series => ({
    measure: [sep, oct], previousMonth: [null, sep], programmed: [95, 95], min: [0, 0], max: [120, 120],
    target: [95, 95], lowThreshold: [80, 80], midThreshold: [95, 95], currentPeriod: [10, 10],
});
// 0.3.3.1: número central = color del semáforo de la fuente (el mismo que consume el arco). Datos realistas: el
// semáforo NO contradice a propósito los datos; se deriva como lo haría el modelo, por cumplimiento Real / Programado
// de cada mes (>= 100% Verde, >= 95% Amarillo, < 95% Rojo), y alimenta «Semáforo» y «Semáforo por periodo».
// Las bandas 50/70 del arco son la referencia geométrica: 72.89 cae en la banda alta pero, con Programado 80
// (91.1%), el semáforo de la fuente es Rojo y el número y el arco indicador se pintan rojos.
const ZONE_REAL = [41.2, 48.5, 55.3, 52.1, 60.4, 66.8, 63.2, 69.5, 71.4];
const ZONE_PROG = [45, 50, 55, 58, 60, 63, 65, 68, 70];
const compliance = (real: number, prog: number): string => (real >= prog ? "Verde" : real >= 0.95 * prog ? "Amarillo" : "Rojo");
const zoneSeries = (oct: number, octProg: number): Series => {
    const semaphore: Cell[] = [...ZONE_REAL.map((real, i) => compliance(real, ZONE_PROG[i])), compliance(oct, octProg), null, null];
    return {
        measure: [...ZONE_REAL, oct, null, null],
        programmed: [...ZONE_PROG, octProg, 82, 84],
        min: constant(0), max: constant(100), target: constant(75), lowThreshold: constant(50), midThreshold: constant(70),
        semaphore, trendSemaphore: semaphore, currentPeriod: constant(10),
    };
};
// Orden de filas del host deliberadamente NO cronológico (para s9).
const SHUFFLED_ROWS = [9, 2, 11, 0, 5, 7, 1, 10, 4, 3, 8, 6];

const scenarios: Scenario[] = [
    { id: "s1-normal", title: "1) Normal: v=65 min=0 max=100 target=80 low=40 mid=70",
        roles: { measure: 65, min: 0, max: 100, target: 80, lowThreshold: 40, midThreshold: 70 } },
    { id: "s2a-clamp-high", title: "2a) Fuera de rango: v=150 (max=100) -> clamp 100",
        roles: { measure: 150, min: 0, max: 100, target: 80, lowThreshold: 40, midThreshold: 70 } },
    { id: "s2b-clamp-low", title: "2b) Fuera de rango: v=-20 (min=0) -> clamp 0",
        roles: { measure: -20, min: 0, max: 100, target: 80, lowThreshold: 40, midThreshold: 70 } },
    { id: "s3-thirds", title: "3) Sin umbrales: v=50 min=0 max=90 -> low=30 mid=60",
        roles: { measure: 50, min: 0, max: 90, target: 75 } },
    { id: "s4-range", title: "4) min=200 max=1200 v=700 target=1000 low=500 mid=900",
        roles: { measure: 700, min: 200, max: 1200, target: 1000, lowThreshold: 500, midThreshold: 900 } },
    { id: "s5a-anim-ranges", title: "5a) Animación (rangos on): 20 -> 90",
        roles: { measure: 20, min: 0, max: 100, target: 80, lowThreshold: 40, midThreshold: 70 }, animateTo: 90 },
    { id: "s5b-anim-arc", title: "5b) Animación (rangos off, arco desempeño): 20 -> 90",
        roles: { measure: 20, min: 0, max: 100, target: 80, lowThreshold: 40, midThreshold: 70 },
        objects: { ranges: { showRanges: false } }, animateTo: 90 },
    { id: "s6-trend-footer", title: "6) 0.3.2.0 Periodo (mes): sparkline + pie (Oct: 91.47 vs Prog. 95 y vs Sep 93.4, Amarillo)",
        period: MONTHS, order: MONTH_KEYS, series: { ...POA_SERIES, currentPeriod: constant(10) }, format: "#,0.00" },
    { id: "s7-programmed-no-period", title: "7) 0.3.0.0 Sin periodo, con Programado: medidor 0.2.0.0 intacto, sin pie",
        roles: { measure: 91.47, min: 0, max: 120, target: 95, targetWithMargin: 95, programmed: 95,
            lowThreshold: 80, midThreshold: 95, semaphore: "Amarillo" }, format: "#,0.00" },
    { id: "s8-trend-hc", title: "8) 0.3.0.0 Sparkline + pie en alto contraste",
        period: MONTHS, series: POA_SERIES, format: "#,0.00", highContrast: true },
    { id: "s9-trend-host-order", title: "9) Revisión: filas del host desordenadas + Orden del periodo + Periodo actual = 6 (Jun: 88.90 vs 87)",
        period: MONTHS, order: MONTH_KEYS, hostRows: SHUFFLED_ROWS, series: { ...POA_SERIES, currentPeriod: constant(6) }, format: "#,0.00" },
    // 0.3.1.0: layout responsivo (sparkline dentro del semicírculo, pie anclado abajo) en tarjeta ancha y compacta.
    { id: "s10-trend-wide", title: "10) 0.3.2.0 Tarjeta ancha 480x300: medidor pegado al pie, Real & Mes anterior = -1.93",
        period: MONTHS, order: MONTH_KEYS, series: { ...POA_SERIES, currentPeriod: constant(10) }, format: "#,0.00",
        viewport: { width: 480, height: 300 } },
    { id: "s11-trend-compact", title: "11) 0.3.2.0 Tarjeta compacta 220x200",
        period: MONTHS, order: MONTH_KEYS, series: { ...POA_SERIES, currentPeriod: constant(10) }, format: "#,0.00",
        viewport: { width: 220, height: 200 } },
    // Revisión 0.3.2.0 (contraejemplos del revisor): el color de «Real & Mes anterior» no es el de la zona.
    { id: "s12-prev-unfavorable", title: "12) Revisión: Real 110 (zona verde) vs mes anterior 118 → -8.00 rojo",
        period: ["Sep", "Oct"], order: [9, 10], series: prevSeries(118, 110), format: "#,0.00" },
    { id: "s13-prev-favorable", title: "13) Revisión: Real 40 (zona roja) vs mes anterior 20 → +20.00 verde",
        period: ["Sep", "Oct"], order: [9, 10], series: prevSeries(20, 40), format: "#,0.00" },
    { id: "s14-prev-lower-better", title: "14) Revisión: menor es mejor, Real 110 vs 118 → -8.00 verde",
        period: ["Sep", "Oct"], order: [9, 10], series: prevSeries(118, 110), format: "#,0.00",
        objects: { ranges: { lowerIsBetter: true } } },
    { id: "s15-prev-out-of-range", title: "15) Revisión: Real 150 (máx. 120, centro 120) vs 100 → +50.00 verde; Dif. Prog. +25.00",
        period: ["Sep", "Oct"], order: [9, 10], series: prevSeries(100, 150), format: "#,0.00" },
    // 0.3.3.1: número central con el color del semáforo de la fuente (= arco indicador) y sparkline al ancho máximo seguro.
    { id: "s16-sem-red", title: "16) 0.3.3.1 Semáforo Rojo: Oct 35.40 vs Prog. 72 (49%) → número y arco rojos",
        period: MONTHS, order: MONTH_KEYS, series: zoneSeries(35.4, 72), format: "#,0.00" },
    { id: "s17-sem-yellow", title: "17) 0.3.3.1 Semáforo Amarillo: Oct 69.80 vs Prog. 72 (96.9%) → número y arco amarillos",
        period: MONTHS, order: MONTH_KEYS, series: zoneSeries(69.8, 72), format: "#,0.00" },
    { id: "s18-sem-red-high-band", title: "18) 0.3.3.1 Semáforo Rojo con valor en banda alta: Oct 72.89 vs Prog. 80 (91.1%) → número ROJO",
        period: MONTHS, order: MONTH_KEYS, series: zoneSeries(72.89, 80), format: "#,0.00" },
    { id: "s19-sem-green", title: "19) 0.3.3.1 Semáforo Verde: Oct 74.50 vs Prog. 72 (103.5%) → número y arco verdes",
        period: MONTHS, order: MONTH_KEYS, series: zoneSeries(74.5, 72), format: "#,0.00" },
    { id: "s20-sem-red-wide", title: "20) 0.3.3.1 Tarjeta ancha 480x300: 72.89 Rojo + sparkline al ancho máximo seguro",
        period: MONTHS, order: MONTH_KEYS, series: zoneSeries(72.89, 80), format: "#,0.00", viewport: { width: 480, height: 300 } },
    { id: "s21-sem-red-compact", title: "21) 0.3.3.1 Tarjeta compacta 220x200: 72.89 Rojo + sparkline",
        period: MONTHS, order: MONTH_KEYS, series: zoneSeries(72.89, 80), format: "#,0.00", viewport: { width: 220, height: 200 } },
    { id: "s22-sem-red-wide-sweep", title: "22) 0.3.3.1 Arco -135°..135°: el anillo del semáforo acota el ancho (sin tocarlo)",
        period: MONTHS, order: MONTH_KEYS, series: zoneSeries(72.89, 80), format: "#,0.00",
        objects: { gauge: { startAngle: -135, endAngle: 135 } } },
];

const grid = document.getElementById("grid")!;
const animators: Array<() => void> = [];

for (const sc of scenarios) {
    const card = document.createElement("div");
    card.className = "card";
    card.id = sc.id;
    card.innerHTML = `<h2>${sc.title}</h2>`;
    const host = document.createElement("div");
    host.className = "visual";
    if (sc.highContrast) host.style.background = "#000000";
    const viewport = sc.viewport ?? VIEWPORT;
    if (sc.viewport) {
        host.style.width = `${viewport.width}px`;
        host.style.height = `${viewport.height}px`;
        if (viewport.width > VIEWPORT.width) card.style.gridColumn = "span 2";
    }
    card.appendChild(host);
    grid.appendChild(card);

    const visual = new Visual({ element: host, host: mockHost(sc.highContrast, sc.period ? card : undefined) } as any);
    const render = (roles: Roles | undefined) => {
        const dataView = sc.period
            ? buildMonthlyDataView(sc.period, sc.series ?? {}, sc.objects, sc.format, sc.order, sc.hostRows)
            : buildDataView(roles ?? {}, sc.objects, sc.format);
        visual.update({ viewport, dataViews: [dataView], type: 2 } as any);
        // Props efectivas que el visual entrega a <Gauge> (método privado, sólo lectura). Se guardan
        // en un atributo data-* (no visible) para verify-dom, sin texto de depuración en las capturas.
        const { trend, ...gaugeData } = (visual as any).extractGaugeData(dataView);
        const s = (visual as any).extractSettings();
        card.dataset.debug = `gaugeData=${JSON.stringify(gaugeData)}\ntrend=${trend ? trend.length + " meses" : "—"}` +
            `\nangles=${s.startAngle}..${s.endAngle} showRanges=${s.showRanges}`;
    };
    render(sc.roles);

    if (sc.animateTo !== undefined && sc.roles) {
        let flipped = false;
        const toggle = () => {
            flipped = !flipped;
            render({ ...sc.roles, measure: flipped ? sc.animateTo! : sc.roles!.measure });
        };
        const btn = document.createElement("button");
        btn.textContent = `Alternar valor (${sc.roles.measure} <-> ${sc.animateTo})`;
        btn.className = "animate";
        btn.onclick = toggle;
        card.appendChild(btn);
        animators.push(toggle);
    }
}

// Botón global para disparar todas las animaciones a la vez (lo usa el script de capturas).
const all = document.createElement("button");
all.id = "animate-all";
all.textContent = "Animar todos";
all.onclick = () => animators.forEach((fn) => fn());
document.body.insertBefore(all, grid);
(window as any).__harnessReady = true;
