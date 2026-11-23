// 0.3.2.1: evidencia real del tooltip al pasar el mouse por puntos de la sparkline mensual.
// Requiere el harness servido en HARNESS_URL (por defecto http://127.0.0.1:5178/).
// Uso: OUT_DIR=<carpeta> PHASE=<before|after> node scripts/hover-tooltip.mjs
// Escribe <PHASE>-hover-<escenario>-<mes>.png y <PHASE>-hover.json en OUT_DIR.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.env.OUT_DIR ?? resolve(here, "../screenshots"));
const phase = process.env.PHASE ?? "after";
mkdirSync(out, { recursive: true });
const url = process.env.HARNESS_URL ?? "http://127.0.0.1:5178/";

// Escenario s6 (Oct es el mes actual): Ene, Jun y Oct; s9 (Jun es el mes actual): Feb y Sep.
const targets = [
    { scenario: "s6-trend-footer", points: [0, 5, 9] },
    { scenario: "s9-trend-host-order", points: [1, 8] },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.__harnessReady === true);
await page.waitForTimeout(600); // animación inicial del medidor (400 ms)

const results = [];
for (const { scenario, points } of targets) {
    const circles = page.locator(`#${scenario} circle.trend-point`);
    for (const position of points) {
        const circle = circles.nth(position);
        const title = await circle.locator("title").textContent();
        await page.mouse.move(0, 0);
        await circle.hover({ force: true });
        await page.waitForTimeout(50);
        const tooltip = await page.locator(`#${scenario} .harness-tooltip`).innerText();
        const month = title.split(":")[0];
        const file = resolve(out, `${phase}-hover-${scenario}-${month}.png`);
        await page.locator(`#${scenario}`).screenshot({ path: file });
        results.push({ scenario, point: position, svgTitle: title, hostTooltip: tooltip.split("\n"), screenshot: file });
        console.log(`${scenario} punto ${position} (${title}) → tooltip: ${tooltip.replace(/\n/g, " | ")}`);
    }
}
writeFileSync(resolve(out, `${phase}-hover.json`), JSON.stringify({ url, phase, errors, results }, null, 2));
console.log("errores de página:", errors.length);
await browser.close();
