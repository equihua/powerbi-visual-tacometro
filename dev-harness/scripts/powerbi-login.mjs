// Evidencia del bloqueo de autenticación: abre https://app.powerbi.com (sin credenciales)
// y guarda UNA captura de la pantalla a la que redirige (login de Microsoft).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../screenshots");
mkdirSync(out, { recursive: true });
const path = resolve(out, "powerbi-service-login.png");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: "es-MX" });
const resp = await page.goto("https://app.powerbi.com", { waitUntil: "domcontentloaded", timeout: 60000 });
console.log("status inicial:", resp?.status());
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => console.log("networkidle timeout (continuo)"));
await page.waitForTimeout(3000);
console.log("url final:", page.url());
console.log("titulo:", await page.title());
await page.screenshot({ path });
console.log("captura:", path);
await browser.close();
