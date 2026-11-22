import { describe, expect, it } from "vitest";
import * as capabilities from "../capabilities.json";

const roles = capabilities.dataRoles as Array<{ name: string; kind: string; displayName: string; description?: string }>;
const mapping = capabilities.dataViewMappings[0] as any;

describe("capabilities.json — rol «Periodo (mes)» (0.3.0.0)", () => {
    it("declara el rol de agrupación period", () => {
        expect(roles.find((role) => role.name === "period")).toMatchObject({ kind: "Grouping", displayName: "Periodo (mes)" });
    });

    it("el periodo es opcional y admite como máximo un campo", () => {
        expect(mapping.conditions[0].period).toEqual({ max: 1 });
    });

    it("el mapeo categórico agrupa por periodo (y su orden) con reducción de datos suficiente para 12+ meses", () => {
        expect(mapping.categorical.categories.select).toEqual([{ bind: { to: "period" } }, { bind: { to: "periodOrder" } }]);
        expect(mapping.categorical.categories.dataReductionAlgorithm.top.count).toBeGreaterThanOrEqual(12);
    });

    it("revisión B1: declara «Orden del periodo» (Grouping) y «Periodo actual» (Measure), opcionales y de un campo", () => {
        expect(roles.find((role) => role.name === "periodOrder")).toMatchObject({ kind: "Grouping", displayName: "Orden del periodo" });
        expect(roles.find((role) => role.name === "currentPeriod")).toMatchObject({ kind: "Measure", displayName: "Periodo actual" });
        expect(mapping.conditions[0].periodOrder).toEqual({ max: 1 });
        expect(mapping.conditions[0].currentPeriod).toEqual({ max: 1 });
    });

    it("revisión B1: contrato de orden del host — orden implícito ascendente por el periodo (respeta «Ordenar por columna»)", () => {
        expect((capabilities as any).sorting).toEqual({ implicit: { clauses: [{ role: "period", direction: 1 }] } });
    });

    it("revisión B2: declara «Semáforo por periodo» (Measure, opcional, un campo) con la guía del semáforo mensual", () => {
        const role = roles.find((entry) => entry.name === "trendSemaphore");
        expect(role).toMatchObject({ kind: "Measure", displayName: "Semáforo por periodo" });
        expect(role?.description).toContain("POA Semáforo mes color");
        expect(mapping.conditions[0].trendSemaphore).toEqual({ max: 1 });
    });

    it("conserva los 11 roles de medida previos en values, en el mismo orden (0.2.0.0), y añade los nuevos al final", () => {
        const bound = mapping.categorical.values.select.map((entry: { bind: { to: string } }) => entry.bind.to);
        expect(bound).toEqual([
            "measure", "min", "max", "target", "lowThreshold", "midThreshold",
            "semaphore", "targetWithMargin", "programmed", "previousMonth", "tooltips",
            "currentPeriod", "trendSemaphore",
        ]);
        for (const role of ["measure", "min", "max", "target", "lowThreshold", "midThreshold", "semaphore", "targetWithMargin", "programmed", "previousMonth"]) {
            expect(mapping.conditions[0][role]).toEqual({ max: 1 });
        }
    });
});
