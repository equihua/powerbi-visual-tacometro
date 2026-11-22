import { defineConfig } from "vitest/config";

// Configuración de pruebas unitarias. No participa en `pbiviz package`
// (webpack de pbiviz solo compila desde src/visual.ts).
export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
        server: {
            deps: {
                // Publica ESM sin extensiones y sin "type": "module": debe transformarse con Vite.
                inline: ["powerbi-visuals-utils-formattingmodel"],
            },
        },
        coverage: {
            provider: "v8",
            // Módulos históricos + todos los módulos nuevos de A3/B1/B3 (lógica pura y GaugeMarker,
            // renderizable sin DOM). Quedan fuera los componentes cuyo comportamiento depende de
            // efectos d3 en el DOM (PerformanceArc, ValueMarker) y TargetMarker.tsx (código sin uso
            // heredado de la línea base); ver CHANGELOG.md.
            include: [
                "src/components/scales.ts",
                "src/components/arcUtils.ts",
                "src/components/semaphore.ts",
                "src/components/markers.ts",
                "src/components/GaugeMarker.tsx",
                // 0.3.0.0: sparkline mensual y pie (renderizables sin DOM).
                "src/components/layout.ts",
                "src/components/trend.ts",
                "src/components/TrendSparkline.tsx",
                "src/components/GaugeFooter.tsx",
                "src/highContrast.ts",
                "src/tooltips.ts",
                "src/visual.ts",
            ],
            // skipFull explícito: Vitest 5 activa skipFull=true en el reporter "text" cuando
            // detecta un entorno de agente/CI-IA, ocultando archivos al 100% (p. ej. scales.ts).
            reporter: [["text", { skipFull: false }], "text-summary"],
        },
    },
});
