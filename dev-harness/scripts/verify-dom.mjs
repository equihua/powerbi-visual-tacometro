// Verificación DOM (sin visión): extrae texto central, ángulos de target/marcador,
// colores de rangos y (0.3.0.0) sparkline mensual y pie de cada escenario, y los
// compara con lo esperado.
import { chromium } from "playwright-core";

const url = process.env.HARNESS_URL ?? "http://127.0.0.1:5178/";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.__harnessReady === true);
await page.waitForTimeout(300);

const data = await page.evaluate(() => [...document.querySelectorAll(".card")].map((card) => {
    const q = (s) => card.querySelector(s);
    const rot = (s) => { const m = /rotate\(([-\d.e]+)\)/.exec(q(s)?.getAttribute("transform") ?? ""); return m ? +(+m[1]).toFixed(2) : null; };
    const markerT = q(".value-marker > g")?.getAttribute("transform") ?? "";
    const tm = /translate\(([-\d.e]+),\s*([-\d.e]+)\)/.exec(markerT);
    const markerDeg = tm ? +(Math.atan2(+tm[1], -+tm[2]) * 180 / Math.PI).toFixed(2) : null;
    const points = [...card.querySelectorAll(".trend-point")];
    const footerValue = (kind) => q(`.footer-${kind} .footer-value`);
    return {
        id: card.id,
        text: q("text.center-text")?.textContent ?? null,
        // GaugeMarker (B3) reemplazó a TargetMarker: la clase es "gauge-marker marker-target".
        targetDeg: rot(".marker-target"),
        markerDeg,
        gaugeTranslate: q("svg.gauge-svg > g")?.getAttribute("transform") ?? null,
        ranges: [...card.querySelectorAll(".gauge-ranges path")].map((p) => p.getAttribute("fill")),
        perfArcFill: q("path.performance-arc")?.getAttribute("fill") ?? null,
        bg: !!q("path.gauge-background"),
        trendFills: points.map((p) => p.getAttribute("fill")),
        trendLabels: points.map((p) => p.querySelector("title")?.textContent.split(":")[0] ?? null),
        trendRealLine: q(".trend-real-line")?.getAttribute("stroke") ?? null,
        trendCurrent: points.findIndex((p) => p.classList.contains("trend-point-current")),
        programmedLine: !!q(".trend-programmed-line"),
        footerProgrammed: footerValue("programmed")?.textContent ?? null,
        footerDif: footerValue("difference")?.textContent ?? null,
        footerDifFill: footerValue("difference")?.getAttribute("fill") ?? null,
        footerDescriptor: q(".footer-descriptor .footer-label")?.textContent ?? null,
        // 0.3.2.0: valor de «Real & Mes anterior» (Real − Real mes anterior) y su color.
        footerPrev: footerValue("descriptor")?.textContent ?? null,
        footerPrevFill: footerValue("descriptor")?.getAttribute("fill") ?? null,
        // 0.3.2.0: hueco vertical (px de pantalla) entre lo más bajo del medidor (banda, marcadores, sparkline)
        // y lo más alto del texto del pie. null sin pie.
        footerGapPx: (() => {
            const texts = [...card.querySelectorAll(".gauge-footer text")].map((t) => t.getBoundingClientRect().top);
            const parts = [q("svg.gauge-svg > g"), q(".gauge-trend-slot")].filter(Boolean).map((g) => g.getBoundingClientRect().bottom);
            return texts.length && parts.length ? +(Math.min(...texts) - Math.max(...parts)).toFixed(1) : null;
        })(),
        // 0.3.1.0: layout responsivo.
        svgSize: q("svg.gauge-svg") ? `${q("svg.gauge-svg").getAttribute("width")}x${q("svg.gauge-svg").getAttribute("height")}` : null,
        trendSlot: q(".gauge-trend-slot")?.getAttribute("transform") ?? null,
        trendInside: (() => {
            // Puntos (centro en pantalla) dentro del círculo interior de la banda (grosor por defecto 20)
            // y por debajo del número central. null sin sparkline.
            const svg = q("svg.gauge-svg"), text = q("text.center-text");
            if (!points.length || !svg || !text) return null;
            // 0.3.2.0: centro del medidor desde su transform y radio interior desde el path del fondo (menor radio de arco).
            const c = /translate\(([-\d.e]+),\s*([-\d.e]+)\)/.exec(q("svg.gauge-svg > g").getAttribute("transform"));
            const inner = Math.min(...[...(q("path.gauge-background").getAttribute("d") ?? "").matchAll(/A([\d.]+),/g)].map((m) => +m[1]));
            const s = svg.getBoundingClientRect(), t = text.getBoundingClientRect();
            return points.every((p) => {
                const r = p.getBoundingClientRect();
                const x = r.left + r.width / 2 - s.left - +c[1], y = r.top + r.height / 2 - s.top - +c[2];
                return Math.hypot(x, y) < inner && r.top >= t.bottom - 1;
            });
        })(),
        footerSlot: q(".gauge-footer-slot")?.getAttribute("transform") ?? null,
        footerLabels: [...card.querySelectorAll(".footer-label")].map((l) => l.textContent),
        footerLabelsAligned: (() => {
            const ys = [...card.querySelectorAll(".footer-label")].map((l) => Math.round(l.getBoundingClientRect().bottom));
            return ys.length ? new Set(ys).size === 1 : null;
        })(),
        // Etiquetas del pie sin solaparse entre sí y dentro del ancho del SVG (medido en el navegador).
        footerLabelsFit: (() => {
            const svg = q("svg.gauge-svg");
            const rs = [...card.querySelectorAll(".footer-label")].map((l) => l.getBoundingClientRect());
            if (!rs.length || !svg) return null;
            const s = svg.getBoundingClientRect();
            return rs.every((r, i) => r.left >= s.left - 0.5 && r.right <= s.right + 0.5 && (i === 0 || r.left >= rs[i - 1].right));
        })(),
        // Revisión: el texto de depuración (gaugeData=…) no debe verse en la tarjeta (capturas limpias).
        debugTextVisible: card.innerText.includes("gaugeData"),
        info: (card.dataset.debug ?? "").split("\n")[0].slice(0, 80),
    };
}));
// Esperado con start=-120°, end=60° (barrido 180°): ang(v) = -120 + 180*(v-min)/(max-min)
const ang = (v, mn, mx) => +(-120 + 180 * (v - mn) / (mx - mn)).toFixed(2);
const noExtras = { gaugeTranslate: "translate(150, 150)", trendFills: [], trendRealLine: null, footerProgrammed: null, footerDescriptor: null,
    debugTextVisible: false };
const tenMonths = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct"];
const R = "#C00000", A = "#FFC000", V = "#007F38", HC = "#FFFF00";
const poaFills = [R, R, A, R, A, V, A, A, V, A];
// 0.3.1.0: SVG a todo el tamaño de la tarjeta, sparkline dentro del semicírculo bajo el número,
// pie anclado al borde inferior con etiquetas del boceto alineadas en un renglón.
// 0.3.2.0: hueco medidor→texto del pie entre 0 (sin solape) y 16 px (antes ~40-70 px); ver `gapOk`.
const layout031 = (w, h) => ({ svgSize: `${w}x${h}`, trendInside: true, footerSlot: `translate(0, ${h - 40})`,
    footerLabels: ["Programado", "Dif. Real & Prog.", "Real & Mes anterior"], footerLabelsAligned: true, footerLabelsFit: true,
    footerGapPx: "0..16" });
const gapOk = (v) => v !== null && v >= 0 && v <= 16;
const expected = {
    "s1-normal": { text: "65", targetDeg: ang(80, 0, 100), markerDeg: ang(65, 0, 100), ...noExtras },
    "s2a-clamp-high": { text: "100", targetDeg: ang(80, 0, 100), markerDeg: ang(100, 0, 100), ...noExtras },
    "s2b-clamp-low": { text: "0", targetDeg: ang(80, 0, 100), markerDeg: ang(0, 0, 100), ...noExtras },
    "s3-thirds": { text: "50", targetDeg: ang(75, 0, 90), markerDeg: ang(50, 0, 90), ...noExtras },
    "s4-range": { text: "700", targetDeg: ang(1000, 200, 1200), markerDeg: ang(700, 200, 1200), ...noExtras },
    "s5a-anim-ranges": { text: "20", targetDeg: ang(80, 0, 100), markerDeg: ang(20, 0, 100), ...noExtras },
    "s5b-anim-arc": { text: "20", targetDeg: ang(80, 0, 100), markerDeg: ang(20, 0, 100), ...noExtras },
    // 0.3.1.0: 300x300 con pie (40 px) abajo y sparkline DENTRO del semicírculo: medidor en 300x260 → centro (150, 130).
    "s6-trend-footer": { text: "91.47", targetDeg: ang(95, 0, 120), markerDeg: ang(91.47, 0, 120),
        gaugeTranslate: "translate(150, 175.25)", ...layout031(300, 300), trendSlot: "translate(52.13, 188.3)", trendFills: poaFills, trendLabels: tenMonths, trendRealLine: "#D1D5DB", trendCurrent: 9, programmedLine: true,
        footerProgrammed: "95.00", footerDif: "-3.53", footerDifFill: A, footerDescriptor: "Real & Mes anterior", footerPrev: "-1.93", footerPrevFill: R, debugTextVisible: false },
    "s10-trend-wide": { text: "91.47", gaugeTranslate: "translate(240, 167)", ...layout031(480, 300), trendFills: poaFills, trendCurrent: 9,
        footerProgrammed: "95.00", footerDif: "-3.53", footerDifFill: A, footerPrev: "-1.93", footerPrevFill: R, debugTextVisible: false },
    "s11-trend-compact": { text: "91.47", gaugeTranslate: "translate(110, 100.33)", ...layout031(220, 200), trendFills: poaFills, trendCurrent: 9,
        footerProgrammed: "95.00", footerDif: "-3.53", footerDifFill: A, footerPrev: "-1.93", footerPrevFill: R, debugTextVisible: false },
    // Programado sin periodo: sin serie mensual no hay pie ni sparkline; el medidor conserva 300x300 (0.2.0.0).
    "s7-programmed-no-period": { text: "91.47", targetDeg: ang(95, 0, 120), markerDeg: ang(91.47, 0, 120),
        ...noExtras, footerDif: null },
    "s8-trend-hc": { text: "91.47", targetDeg: ang(95, 0, 120), markerDeg: ang(91.47, 0, 120),
        gaugeTranslate: "translate(150, 175.25)", ...layout031(300, 300), trendFills: poaFills.map(() => HC), trendRealLine: HC, trendCurrent: 9,
        footerProgrammed: "95.00", footerDif: "-3.53", footerDifFill: HC, footerDescriptor: "Real & Mes anterior", footerPrev: "-1.93", footerPrevFill: HC, debugTextVisible: false },
    // Revisión B1: filas del host desordenadas; el visual ordena por «Orden del periodo» y el medidor usa
    // «Periodo actual» = 6 (Jun: Real 88.90, Programado 87.00, semáforo Verde), no el último mes con Real.
    "s9-trend-host-order": { text: "88.90", targetDeg: ang(95, 0, 120), markerDeg: ang(88.9, 0, 120),
        gaugeTranslate: "translate(150, 175.25)", ...layout031(300, 300), trendFills: poaFills, trendLabels: tenMonths, trendRealLine: "#D1D5DB", trendCurrent: 5, programmedLine: true,
        footerProgrammed: "87.00", footerDif: "+1.90", footerDifFill: V, footerDescriptor: "Real & Mes anterior", footerPrev: "+3.70", footerPrevFill: V, debugTextVisible: false },
    // Revisión 0.3.2.0: «Real & Mes anterior» = Real sin recortar − mes anterior; color por favorabilidad, no por zona.
    "s12-prev-unfavorable": { text: "110.00", footerDif: "+15.00", footerDifFill: V, footerPrev: "-8.00", footerPrevFill: R },
    "s13-prev-favorable": { text: "40.00", footerDif: "-55.00", footerDifFill: R, footerPrev: "+20.00", footerPrevFill: V },
    "s14-prev-lower-better": { text: "110.00", footerPrev: "-8.00", footerPrevFill: V },
    "s15-prev-out-of-range": { text: "120.00", footerDif: "+25.00", footerPrev: "+50.00", footerPrevFill: V },
};
const close = (a, b) => a !== null && Math.abs(a - b) < 0.05;
let fails = 0;
for (const d of data) {
    const e = expected[d.id];
    const mismatches = !e ? ["sin esperado"] : Object.keys(e).filter((key) =>
        key.endsWith("Deg") ? !close(d[key], e[key]) : key === "footerGapPx" ? !gapOk(d[key]) : JSON.stringify(d[key]) !== JSON.stringify(e[key]));
    if (mismatches.length) fails++;
    console.log(mismatches.length ? `FAIL [${mismatches.join(",")}]` : "OK  ", JSON.stringify(d), "esperado:", JSON.stringify(e));
}
const missing = Object.keys(expected).filter((id) => !data.some((d) => d.id === id));
if (missing.length) { fails += missing.length; console.log("FAIL escenarios ausentes:", missing.join(", ")); }
if (errors.length) { fails++; console.log("pageerror:", errors.join("\n")); }
console.log(`escenarios: ${data.length}, fallos: ${fails}`);
await browser.close();
process.exit(fails ? 1 : 0);
