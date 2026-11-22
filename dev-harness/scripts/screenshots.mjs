// Capturas reales con Chromium del sistema (playwright-core, headless).
// Requiere el harness servido en HARNESS_URL (por defecto http://127.0.0.1:5178/).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../screenshots");
mkdirSync(out, { recursive: true });
const url = process.env.HARNESS_URL ?? "http://127.0.0.1:5178/";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
// Reloj controlado (fake timers de Playwright: Date, performance.now, rAF) para
// congelar la transición d3 a mitad de camino y capturarla de forma determinista.
await page.clock.install();
await page.goto(url);
await page.waitForFunction(() => window.__harnessReady === true);
await page.waitForTimeout(300);

const shot = async (name, selector) => {
    const path = resolve(out, name);
    if (selector) await page.locator(selector).screenshot({ path });
    else await page.screenshot({ path, fullPage: true });
    console.log("captura:", path);
};

await shot("00-all-initial.png");
for (const id of ["s1-normal", "s2a-clamp-high", "s2b-clamp-low", "s3-thirds", "s4-range"]) {
    await shot(`${id}.png`, `#${id}`);
}
await shot("s5a-anim-0-before.png", "#s5a-anim-ranges");
await shot("s5b-anim-0-before.png", "#s5b-anim-arc");

// Animación: 400 ms (TRANSITION_DURATION_MS). Captura a mitad (~120 ms) y al final.
const sample = () => page.evaluate(() => ({
    arcD: document.querySelector("#s5b-anim-arc path.performance-arc")?.getAttribute("d")?.slice(0, 60),
    markerA: document.querySelector("#s5a-anim-ranges .value-marker > g")?.getAttribute("transform"),
}));
const before = await sample();
// Se pausa el reloj: a partir de aquí el tiempo sólo avanza con runFor().
await page.clock.pauseAt(new Date(Date.now() + 60_000));
await page.click("#animate-all");
await page.clock.runFor(150); // ~37% de 400 ms (easeCubicOut -> ~75% del recorrido)
const mid = await sample();
await shot("s5a-anim-1-mid.png", "#s5a-anim-ranges");
await shot("s5b-anim-1-mid.png", "#s5b-anim-arc");
await page.clock.runFor(1000);
await page.clock.resume();
await page.waitForTimeout(200);
const after = await sample();
await shot("s5a-anim-2-after.png", "#s5a-anim-ranges");
await shot("s5b-anim-2-after.png", "#s5b-anim-arc");
await shot("99-all-after-animation.png");

console.log("muestras transform/d:", JSON.stringify({ before, mid, after }, null, 1));
console.log("consola navegador:", logs.length ? logs.join("\n") : "(sin mensajes)");
await browser.close();
