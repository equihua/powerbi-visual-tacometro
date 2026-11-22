// Empaqueta dev-harness/src/main.ts (que importa ../src/visual.ts real) con esbuild.
// Uso: node build.mjs            -> genera dist/
//      node build.mjs --serve    -> sirve dist/ en http://127.0.0.1:5178 (sólo loopback)
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(here, "dist");
mkdirSync(outdir, { recursive: true });
copyFileSync(resolve(here, "index.html"), resolve(outdir, "index.html"));

const options = {
    entryPoints: [resolve(here, "src/main.ts")],
    bundle: true,
    outfile: resolve(outdir, "main.js"),
    format: "iife",
    target: "es2022",
    sourcemap: true,
    // React/D3/powerbi-* se resuelven desde ../node_modules (raíz) -> una sola copia de React.
    nodePaths: [resolve(here, "../node_modules")],
    // El visual importa style/visual.less; en el harness no se necesita.
    loader: { ".less": "empty" },
    // Gauge.tsx usa el namespace global `powerbi` sólo para tipos (import IViewport = powerbi.IViewport).
    banner: { js: "var powerbi = globalThis.powerbi || {};" },
    define: { "process.env.NODE_ENV": "\"development\"" },
    logLevel: "info",
};

if (process.argv.includes("--serve")) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    const { hosts, port } = await ctx.serve({ servedir: outdir, host: "127.0.0.1", port: 5178 });
    console.log(`harness: http://${hosts[0]}:${port}/`);
} else {
    await esbuild.build(options);
}
