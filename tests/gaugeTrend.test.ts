import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Gauge from "../src/components/Gauge";
import { GaugeData, GaugeSettings } from "../src/components/types";
import { TrendPoint } from "../src/components/trend";
import { computeGaugeFrame, computeInnerTrendBox, FOOTER_GAP, MARKER_OVERHANG } from "../src/components/layout";
import { bandRadii } from "../src/components/arcUtils";

/** Markup del Gauge 0.2.0.0 (commit e3aceaf) generado ANTES de este cambio. */
import { baseline } from "./fixtures/gaugeBaseline020";
const settings = baseline.settings as GaugeSettings;

/**
 * 0.3.3.0: única diferencia intencional con el markup 0.2.0.0: el número central (91.47 con umbrales 80/95)
 * ya no usa labelColor (#777777) sino el color de la banda del arco que contiene el valor (media → #FFC000).
 */
function baseline033(markup: string): string {
    const legacy = 'fill="#777777">91.47</text>';
    expect(markup).toContain(legacy);
    return markup.replace(legacy, 'fill="#FFC000">91.47</text>');
}

const thresholds = { lowThreshold: 80, midThreshold: 95 };
const trend: TrendPoint[] = [
    { label: "Ene", real: 80, programmed: 85, semaphore: "Rojo", thresholds },
    { label: "Feb", real: 88, programmed: 90, semaphore: "Amarillo", thresholds },
    { label: "Mar", real: 91.47, programmed: 95, semaphore: "Amarillo", thresholds },
];

function render(d: GaugeData, s: GaugeSettings = settings, width = 300, height = 300): string {
    return renderToStaticMarkup(React.createElement(Gauge, { viewport: { width, height }, settings: s, gaugeData: d }));
}

/** Grupo del medidor: desde el primer <g> hasta antes de las ranuras nuevas o el cierre del SVG. */
function gaugeGroup(markup: string): string {
    const start = markup.indexOf("<g ");
    const ends = ['<g class="gauge-trend-slot"', '<g class="gauge-footer-slot"', "</svg>"]
        .map((needle) => markup.indexOf(needle, start))
        .filter((index) => index > -1);
    return markup.slice(start, Math.min(...ends));
}

describe("Gauge 0.3.0.0 — el medidor aprobado no cambia", () => {
    it("sin Programado ni tendencia el markup es idéntico byte a byte al de 0.2.0.0 salvo el color del número central (0.3.3.0)", () => {
        expect(render(baseline.base as GaugeData)).toBe(baseline033(baseline.noMarkers300x300));
    });

    it("con Programado pero sin serie mensual el markup es idéntico byte a byte al de 0.2.0.0 salvo el color del número central (0.3.3.0) (sin pie)", () => {
        expect(render(baseline.markers as GaugeData)).toBe(baseline033(baseline.markers300x300));
    });

    it("con un solo mes (serie insuficiente) y Programado el markup es idéntico byte a byte al de 0.2.0.0 salvo el color del número central (0.3.3.0)", () => {
        const oneMonth = { ...baseline.markers, trend: trend.slice(0, 1), trendCurrentIndex: 0 } as GaugeData;
        expect(render(oneMonth)).toBe(baseline033(baseline.markers300x300));
    });

    it("0.3.2.0: con tendencia y Programado el medidor es el mismo dibujo de 0.2.0.0 (300x300), sólo desplazado hacia el pie", () => {
        // render sin tendencia = 0.2.0.0 byte a byte (pruebas anteriores), así que el medidor no cambia de diseño:
        // con pie (-90°..90°, 300x300) el radio lo limita el ancho y sólo el centro baja de y=150 a y=177.7.
        const withTrend = gaugeGroup(render({ ...baseline.markers, trend, trendCurrentIndex: 2 } as GaugeData));
        expect(withTrend).toContain('<g transform="translate(150, 177.7)">');
        expect(withTrend.replace('<g transform="translate(150, 177.7)">', '<g transform="translate(150, 150)">')).toBe(
            gaugeGroup(render(baseline.markers as GaugeData, settings, 300, 300))
        );
    });
});

describe("Gauge 0.3.0.0 — sparkline mensual y pie debajo del medidor", () => {
    const withTrend = { ...baseline.markers, trend, trendCurrentIndex: 2 } as GaugeData;

    it("0.3.2.0: la sparkline va dentro del semicírculo bajo el número y el pie abajo, sin hueco grande", () => {
        const markup = render(withTrend);
        // Caja 300x260 con pie: radio por el ancho (interior 130.5), contenido inferior = sparkline (0.6·130.5 = 78.3)
        // terminando a FOOTER_GAP (4) del pie → centro (150, 256 − 78.3 = 177.7); caja: y 177.7 + 13.05.
        // 0.3.3.0: ancho = cuerda interior a y = 0.6·130.5 → 1.6·130.5·0.995 = 207.76; x = 150 − 103.88 = 46.12
        // (antes 1.5·130.5 → x 52.13). Centro y pie no cambian.
        // 0.3.3.1 (-90°..90°, sin anillo bajo la horizontal): punto extremo (radio 4 + holgura 0.5) tangente al
        // círculo interior en y = 0.6·130.5 − 6: X = √(126² − 72.3²) = 103.19; ancho 2·(103.19 + 6) = 218.39 → x = 40.81.
        expect(markup).toContain('<g transform="translate(150, 177.7)">');
        expect(markup).toMatch(/<g class="gauge-trend-slot" transform="translate\(40.81, 190.75\)">[^]*class="trend-sparkline"/);
        expect(markup).toMatch(/<g class="gauge-footer-slot" transform="translate\(0, 260\)">[^]*class="gauge-footer"/);
    });

    it("0.3.1.0: todos los puntos quedan dentro del círculo interior y por debajo del número central", () => {
        for (const [width, height] of [[300, 300], [600, 300], [300, 500], [180, 160]]) {
            const markup = render(withTrend, settings, width, height);
            const slot = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup);
            expect(slot, `${width}x${height}`).not.toBeNull();
            const gaugeHeight = height - 40;
            const frame = computeGaugeFrame(width, gaugeHeight, settings.thickness, settings.startAngle, settings.endAngle, true);
            const inner = frame.radius * 0.95 - settings.thickness / 2;
            const circles = [...markup.matchAll(/<circle[^>]*cx="([-\d.]+)" cy="([-\d.]+)"/g)];
            expect(circles.length).toBe(3);
            for (const [, cx, cy] of circles) {
                const x = Number(slot![1]) + Number(cx) - width / 2;
                const y = Number(slot![2]) + Number(cy) - Math.round(frame.cy * 100) / 100;
                expect(Math.hypot(x, y)).toBeLessThan(inner);
                expect(y).toBeGreaterThan(0);
            }
        }
    });

    it("0.3.1.0: el SVG usa todo el ancho y el pie queda anclado al borde inferior en cualquier tamaño", () => {
        for (const [width, height] of [[600, 300], [300, 500], [180, 160]]) {
            const markup = render(withTrend, settings, width, height);
            expect(markup).toContain(`width="${width}" height="${height}"`);
            const frame = computeGaugeFrame(width, height - 40, settings.thickness, settings.startAngle, settings.endAngle, true);
            expect(markup).toContain(`<g transform="translate(${width / 2}, ${Math.round(frame.cy * 100) / 100})">`);
            expect(markup).toContain(`<g class="gauge-footer-slot" transform="translate(0, ${height - 40})">`);
        }
    });

    it("0.3.2.0: con arco invertido (90°..270°) el centro deja sitio al número central (fontSize) arriba en tarjeta ancha", () => {
        const markup = render(withTrend, { ...settings, startAngle: 90, endAngle: 270 }, 600, 300);
        const cy = Number(/<g transform="translate\([-\d.]+, ([-\d.]+)\)">/.exec(markup)![1]);
        expect(cy).toBeGreaterThanOrEqual(settings.fontSize);
    });

    it("0.3.2.0: el hueco entre el medidor y el pie es FOOTER_GAP y no hay solape (300x300, 480x300, 220x200)", () => {
        const s = { ...settings, startAngle: -120, endAngle: 60 };
        for (const [width, height] of [[300, 300], [480, 300], [220, 200]]) {
            const markup = render({ ...withTrend, previousMonth: 93.4 } as GaugeData, s, width, height);
            const center = /<g transform="translate\(([-\d.]+), ([-\d.]+)\)">/.exec(markup)!;
            const cy = Number(center[2]);
            const frame = computeGaugeFrame(width, height - 40, s.thickness, -120, 60, true);
            const { outerRadius } = bandRadii(frame.radius, s.thickness);
            // Más bajo de la banda/marcadores (ángulo -120°) y de la sparkline.
            const arcBottom = cy + 0.5 * (outerRadius + MARKER_OVERHANG);
            const slot = /class="gauge-trend-slot" transform="translate\(([-\d.]+), ([-\d.]+)\)"/.exec(markup)!;
            const sparkHeight = computeInnerTrendBox(frame.radius, s.thickness, -120, 60)!.height;
            const bottom = Math.max(arcBottom, Number(slot[2]) + sparkHeight);
            const footerTop = height - 40;
            expect(bottom, `${width}x${height}`).toBeLessThanOrEqual(footerTop - FOOTER_GAP + 0.01);
            expect(footerTop - bottom, `${width}x${height}`).toBeLessThan(FOOTER_GAP + 1);
            // Antes (0.3.1.0) el centro era (alto − 40)/2: el centro ahora está más abajo.
            expect(cy, `${width}x${height}`).toBeGreaterThan(footerTop / 2);
        }
    });

    it("los puntos usan el color de estado de cada mes y el mes actual se resalta", () => {
        const markup = render(withTrend);
        const fills = [...markup.matchAll(/<circle[^>]*class="(trend-point[^"]*)"[^>]*fill="([^"]*)"/g)].map((m) => m[2]);
        expect(fills).toEqual(["#C00000", "#FFC000", "#FFC000"]);
        expect(markup).toContain("trend-point-current");
    });

    it("el pie muestra Programado, la diferencia con el color de estado actual y el descriptor", () => {
        const markup = render(withTrend);
        expect(markup).toMatch(/footer-programmed[^]*?>95.00</);
        expect(markup).toMatch(/footer-difference[^]*?fill="#FFC000"[^>]*>-3.53</);
        expect(markup).toContain(">Real &amp; Mes anterior<");
    });

    it("0.3.2.0: con Real mes anterior, 'Real & Mes anterior' muestra Real − mes anterior; bajar es desfavorable (rojo)", () => {
        const markup = render({ ...withTrend, previousMonth: 93.4 } as GaugeData);
        expect(markup).toMatch(/footer-descriptor[^]*?class="footer-value"[^>]*fill="#C00000"[^>]*>-1.93</);
        // Sin el rol opcional (baseline.markers no lo trae): sólo la etiqueta.
        expect(render(withTrend)).not.toMatch(/footer-descriptor"[^]*?footer-value/);
    });

    it("0.3.2.0 (revisión): la diferencia con el mes anterior usa el Real sin recortar (150 − 100)", () => {
        const markup = render({ ...withTrend, value: 120, actualValue: 150, previousMonth: 100 } as GaugeData);
        expect(markup).toMatch(/footer-descriptor[^]*?class="footer-value"[^>]*>\+50.00</);
    });

    it("revisión B1: sin índice de mes actual no se resalta ningún punto (no se asume el último)", () => {
        const markup = render({ ...baseline.markers, trend } as GaugeData);
        expect(markup).toContain("trend-sparkline");
        expect(markup).not.toContain("trend-point-current");
    });

    it("con un solo mes no hay sparkline ni pie (la serie mensual no es suficiente)", () => {
        const markup = render({ ...baseline.markers, trend: trend.slice(0, 1), trendCurrentIndex: 0 } as GaugeData);
        expect(markup).not.toContain("trend-sparkline");
        expect(markup).not.toContain("gauge-footer");
    });

    it("Real fuera de rango: la diferencia usa el mismo Real que muestra el centro (recortado a [mín, máx])", () => {
        // Real 150 con máximo 120: el centro muestra 120.00, así que el pie muestra 120.00 − 95.00 = +25.00.
        const markup = render({ ...withTrend, value: 120, actualValue: 150 } as GaugeData);
        expect(markup).toMatch(/class="center-text"[^>]*>120.00</);
        expect(markup).toMatch(/footer-difference[^]*?class="footer-value"[^>]*>\+25.00</);
    });

    it("alto contraste: el pie usa el foreground", () => {
        const hc = { ...settings, highContrast: { foreground: "#FFFF00", background: "#000000" } };
        const markup = render(withTrend, hc);
        expect(markup).toMatch(/footer-difference[^]*?class="footer-value"[^>]*fill="#FFFF00"/);
        expect(markup).toMatch(/footer-programmed[^]*?class="footer-label"[^>]*fill="#FFFF00"/);
    });
});
