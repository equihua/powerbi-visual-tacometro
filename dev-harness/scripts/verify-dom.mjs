// Verificación DOM (sin visión): extrae texto central, ángulos de target/marcador
// y colores de rangos de cada escenario y los compara con lo esperado.
import { chromium } from "playwright-core";

const url = process.env.HARNESS_URL ?? "http://127.0.0.1:5178/";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(url);
await page.waitForFunction(() => window.__harnessReady === true);
await page.waitForTimeout(300);

const data = await page.evaluate(() => [...document.querySelectorAll(".card")].map((card) => {
    const q = (s) => card.querySelector(s);
    const rot = (s) => { const m = /rotate\(([-\d.e]+)\)/.exec(q(s)?.getAttribute("transform") ?? ""); return m ? +(+m[1]).toFixed(2) : null; };
    const markerT = q(".value-marker > g")?.getAttribute("transform") ?? "";
    const tm = /translate\(([-\d.e]+),\s*([-\d.e]+)\)/.exec(markerT);
    const markerDeg = tm ? +(Math.atan2(+tm[1], -+tm[2]) * 180 / Math.PI).toFixed(2) : null;
    return {
        id: card.id,
        text: q("text.center-text")?.textContent ?? null,
        targetDeg: rot(".target-marker"),
        markerDeg,
        ranges: [...card.querySelectorAll(".gauge-ranges path")].map((p) => p.getAttribute("fill")),
        perfArcFill: q("path.performance-arc")?.getAttribute("fill") ?? null,
        bg: !!q("path.gauge-background"),
        info: q("pre")?.textContent.split("\n")[0],
    };
}));
// Esperado con start=-120°, end=60° (barrido 180°): ang(v) = -120 + 180*(v-min)/(max-min)
const ang = (v, mn, mx) => +(-120 + 180 * (v - mn) / (mx - mn)).toFixed(2);
const expected = {
    "s1-normal": { text: "65", targetDeg: ang(80, 0, 100), markerDeg: ang(65, 0, 100) },
    "s2a-clamp-high": { text: "100", targetDeg: ang(80, 0, 100), markerDeg: ang(100, 0, 100) },
    "s2b-clamp-low": { text: "0", targetDeg: ang(80, 0, 100), markerDeg: ang(0, 0, 100) },
    "s3-thirds": { text: "50", targetDeg: ang(75, 0, 90), markerDeg: ang(50, 0, 90) },
    "s4-range": { text: "700", targetDeg: ang(1000, 200, 1200), markerDeg: ang(700, 200, 1200) },
    "s5a-anim-ranges": { text: "20", targetDeg: ang(80, 0, 100), markerDeg: ang(20, 0, 100) },
    "s5b-anim-arc": { text: "20", targetDeg: ang(80, 0, 100), markerDeg: ang(20, 0, 100) },
};
let fails = 0;
for (const d of data) {
    const e = expected[d.id];
    const ok = e && d.text === e.text && Math.abs(d.targetDeg - e.targetDeg) < 0.05 && Math.abs(d.markerDeg - e.markerDeg) < 0.05;
    if (!ok) fails++;
    console.log(ok ? "OK  " : "FAIL", JSON.stringify(d), "esperado:", JSON.stringify(e));
}
await browser.close();
process.exit(fails ? 1 : 0);
