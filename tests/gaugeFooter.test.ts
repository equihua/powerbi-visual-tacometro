import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GaugeFooter, GaugeFooterProps, TREND_DESCRIPTOR } from "../src/components/GaugeFooter";

function render(overrides: Partial<GaugeFooterProps> = {}): string {
    const props: GaugeFooterProps = {
        width: 300,
        height: 40,
        real: 91.47,
        actualReal: 91.47,
        programmed: 95,
        difColor: "#FFC000",
        // Resolución de prueba: subir verde, bajar rojo, 0 neutro (la semántica real está en previousMonthDelta.test.ts).
        previousMonthDifColor: (delta: number) => (delta > 0 ? "#007F38" : delta < 0 ? "#C00000" : "#252423"),
        showDescriptor: true,
        format: (value: number) => value.toFixed(2),
        fontFamily: "Arial",
        valueColor: "#252423",
        labelColor: "#605E5C",
        ...overrides,
    };
    return renderToStaticMarkup(React.createElement("svg", null, React.createElement(GaugeFooter, props)));
}

function item(markup: string, kind: string): string {
    const start = markup.indexOf(`class="footer-item footer-${kind}"`);
    expect(start).toBeGreaterThan(-1);
    return markup.slice(start, markup.indexOf("</g>", start));
}

describe("GaugeFooter — leyenda inferior horizontal", () => {
    it("Programado: valor actual y etiqueta", () => {
        const programmed = item(render(), "programmed");
        expect(programmed).toMatch(/class="footer-value"[^>]*>95.00</);
        expect(programmed).toMatch(/class="footer-label"[^>]*>Programado</);
    });

    it("Dif. Real & Prog. (etiqueta del boceto 0.3.1.0): Real − Programado con signo y coloreado", () => {
        const dif = item(render(), "difference");
        expect(dif).toMatch(/class="footer-value"[^>]*fill="#FFC000"[^>]*>-3.53</);
        expect(dif).toMatch(/class="footer-label"[^>]*>Dif\. Real &amp; Prog\.</);
        expect(item(render({ real: 100 }), "difference")).toMatch(/>\+5.00</);
        expect(item(render({ real: 95 }), "difference")).toMatch(/>0.00</);
    });

    it("tercera columna con la etiqueta exacta del boceto 'Real & Mes anterior' (sin valor si falta Real mes anterior)", () => {
        expect(TREND_DESCRIPTOR).toBe("Real & Mes anterior");
        const descriptor = item(render(), "descriptor");
        expect(descriptor).toMatch(/class="footer-label"[^>]*>Real &amp; Mes anterior</);
        expect(descriptor).not.toContain("footer-value");
        expect(descriptor).not.toContain("Prog. Mensual");
        expect(render({ showDescriptor: false })).not.toContain("footer-descriptor");
    });

    it("0.3.2.0: 'Real & Mes anterior' muestra Real − Real mes anterior con signo y el color de favorabilidad", () => {
        const descriptor = item(render({ previousMonth: 93.4 }), "descriptor");
        expect(descriptor).toMatch(/class="footer-value"[^>]*fill="#C00000"[^>]*>-1.93</);
        expect(descriptor).toMatch(/class="footer-label"[^>]*>Real &amp; Mes anterior</);
        expect(item(render({ previousMonth: 88.9 }), "descriptor")).toMatch(/class="footer-value"[^>]*>\+2.57</);
        expect(item(render({ previousMonth: 91.47 }), "descriptor")).toMatch(/class="footer-value"[^>]*>0.00</);
    });

    it("0.3.2.0: usa el mismo formateador que Dif. Real & Prog.; cada diferencia conserva su propio color", () => {
        const markup = render({ previousMonth: 90, difColor: "#FFC000", format: (value: number) => `${value.toFixed(1)} pp` });
        expect(item(markup, "difference")).toMatch(/fill="#FFC000"[^>]*>-3.5 pp</);
        expect(item(markup, "descriptor")).toMatch(/class="footer-value"[^>]*fill="#007F38"[^>]*>\+1.5 pp</);
    });

    it("0.3.2.0: sin Real mes anterior (o no finito) la 3.ª columna queda sólo con la etiqueta", () => {
        for (const previousMonth of [undefined, Number.NaN]) {
            const descriptor = item(render({ previousMonth }), "descriptor");
            expect(descriptor).not.toContain("footer-value");
            expect(descriptor).toMatch(/class="footer-label"[^>]*>Real &amp; Mes anterior</);
        }
    });

    it("0.3.2.0: el valor de mes anterior no depende de Programado", () => {
        const markup = render({ programmed: undefined, previousMonth: 93.4 });
        expect(markup).not.toContain("footer-difference");
        expect(item(markup, "descriptor")).toMatch(/class="footer-value"[^>]*>-1.93</);
    });

    it("0.3.2.0: con los tres valores, comparten renglón (mismo y) y las etiquetas el suyo", () => {
        const markup = render({ previousMonth: 93.4 });
        const valueYs = [...markup.matchAll(/class="footer-value" y="([\d.]+)"/g)].map((m) => Number(m[1]));
        expect(valueYs).toHaveLength(3);
        expect(new Set(valueYs).size).toBe(1);
    });

    it("los elementos van en una fila horizontal, repartidos en el ancho", () => {
        const markup = render();
        const xs = [...markup.matchAll(/class="footer-item [^"]*" transform="translate\(([\d.]+), 0\)"/g)].map((m) => Number(m[1]));
        expect(xs).toEqual([50, 150, 250]);
    });

    it("0.3.1.0: valores en un mismo renglón y etiquetas alineadas en otro, cerca del borde inferior", () => {
        const markup = render();
        const labelYs = [...markup.matchAll(/class="footer-label" y="([\d.]+)"/g)].map((m) => Number(m[1]));
        const valueYs = [...markup.matchAll(/class="footer-value" y="([\d.]+)"/g)].map((m) => Number(m[1]));
        expect(labelYs).toHaveLength(3);
        expect(new Set(labelYs).size).toBe(1);
        expect(new Set(valueYs).size).toBe(1);
        expect(labelYs[0]).toBeGreaterThan(valueYs[0]);
        expect(labelYs[0]).toBeLessThanOrEqual(40);
    });

    it("0.3.1.0 responsivo: en tarjetas angostas las etiquetas reducen su fuente para no chocar ni salirse", () => {
        const widthOf = (text: string, size: number) => text.length * size * 0.5;
        const sizes = (markup: string) =>
            [...markup.matchAll(/class="footer-label" y="[\d.]+" font-size="([\d.]+)"[^>]*>([^<]+)</g)].map((m) => ({
                size: Number(m[1]),
                text: m[2].replace("&amp;", "&"),
            }));
        // 300 px: tamaño base sin cambios.
        expect(sizes(render()).map((l) => l.size)).toEqual([9, 9, 9]);
        // 220 px: columnas de ~73 px; cada etiqueta cabe en su columna (con 2 px de aire por lado).
        const narrow = sizes(render({ width: 220 }));
        expect(narrow).toHaveLength(3);
        for (const label of narrow) {
            expect(label.size).toBeLessThan(9);
            expect(label.size).toBeGreaterThanOrEqual(6);
            expect(widthOf(label.text, label.size)).toBeLessThanOrEqual(220 / 3 - 4);
        }
    });

    it("sin Programado sólo queda el descriptor (no hay diferencia que calcular)", () => {
        const markup = render({ programmed: undefined });
        expect(markup).not.toContain("footer-programmed");
        expect(markup).not.toContain("footer-difference");
        expect(markup).toContain("footer-descriptor");
    });

    it("usa los colores recibidos para valores y etiquetas (alto contraste lo resuelve el llamador)", () => {
        const markup = render({ valueColor: "#FFFFFF", labelColor: "#FFFF00" });
        expect(item(markup, "programmed")).toMatch(/class="footer-value"[^>]*fill="#FFFFFF"/);
        expect(item(markup, "programmed")).toMatch(/class="footer-label"[^>]*fill="#FFFF00"/);
    });
});
