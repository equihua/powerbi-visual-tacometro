// Harness: instancia la clase Visual REAL (../../src/visual.ts) y le pasa
// VisualUpdateOptions mock con columnas por rol, igual que Power BI. Así las
// props de <Gauge> se construyen con extractSettings/extractGaugeData del visual
// (sin duplicar lógica).
import { Visual } from "../../src/visual";

type Roles = Partial<Record<"measure" | "min" | "max" | "target" | "lowThreshold" | "midThreshold", number>>;
type Objects = Record<string, Record<string, unknown>>;

const VIEWPORT = { width: 300, height: 300 };

function buildDataView(roles: Roles, objects: Objects = {}, format?: string): any {
    const values = Object.entries(roles).map(([role, value]) => ({
        source: { displayName: role, roles: { [role]: true }, format: role === "measure" ? format : undefined },
        values: [value],
    }));
    return { metadata: { columns: values.map((v) => v.source), objects }, categorical: { values } };
}

interface Scenario {
    id: string;
    title: string;
    roles: Roles;
    objects?: Objects;
    animateTo?: number;
}

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
    card.appendChild(host);
    const info = document.createElement("pre");
    card.appendChild(info);
    grid.appendChild(card);

    const visual = new Visual({ element: host, host: {} } as any);
    const render = (roles: Roles) => {
        const dataView = buildDataView(roles, sc.objects);
        visual.update({ viewport: VIEWPORT, dataViews: [dataView], type: 2 } as any);
        // Props efectivas que el visual entrega a <Gauge> (método privado, sólo lectura).
        const gaugeData = (visual as any).extractGaugeData(dataView);
        const s = (visual as any).extractSettings();
        info.textContent = `gaugeData=${JSON.stringify(gaugeData)}\nangles=${s.startAngle}..${s.endAngle} showRanges=${s.showRanges}`;
    };
    render(sc.roles);

    if (sc.animateTo !== undefined) {
        let flipped = false;
        const toggle = () => {
            flipped = !flipped;
            render({ ...sc.roles, measure: flipped ? sc.animateTo : sc.roles.measure });
        };
        const btn = document.createElement("button");
        btn.textContent = `Alternar valor (${sc.roles.measure} <-> ${sc.animateTo})`;
        btn.className = "animate";
        btn.onclick = toggle;
        card.insertBefore(btn, info);
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
