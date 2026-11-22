import { describe, expect, it } from "vitest";
import { findCurrentPosition, lastIndexWithReal, orderPeriodRows, periodSortKey } from "../src/components/trend";

// Revisión 0.3.0.0 (bloqueador 1): el orden cronológico de la serie es determinista y sale
// de una clave explícita (rol «Orden del periodo»), nunca de abreviaturas de mes.
describe("periodSortKey — clave explícita de orden del periodo", () => {
    it("acepta números, fechas y textos numéricos", () => {
        expect(periodSortKey(3)).toBe(3);
        expect(periodSortKey("12")).toBe(12);
        expect(periodSortKey(new Date(Date.UTC(2026, 1, 1)))).toBe(Date.UTC(2026, 1, 1));
    });

    it("no infiere orden desde abreviaturas de mes ni textos no numéricos", () => {
        for (const value of ["Ene", "Feb", "Oct", "Dic", "", "3a", null, undefined, true, Number.NaN]) {
            expect(periodSortKey(value)).toBeNull();
        }
    });
});

describe("orderPeriodRows — permutación de filas por clave", () => {
    it("ordena ascendente por la clave, sin importar el orden de filas del host", () => {
        expect(orderPeriodRows([3, 1, 4, 2])).toEqual([1, 3, 0, 2]);
    });

    it("es estable con claves repetidas y deja al final, en orden del host, las filas sin clave", () => {
        expect(orderPeriodRows([2, null, 1, 2, null])).toEqual([2, 0, 3, 1, 4]);
    });
});

describe("findCurrentPosition — periodo actual explícito", () => {
    const periods = [
        { key: 1, label: "Ene" },
        { key: 2, label: "Feb" },
        { key: 3, label: "Mar" },
    ];

    it("con clave de orden compara el valor actual con la clave (numérica)", () => {
        expect(findCurrentPosition(2, periods, true)).toBe(1);
        expect(findCurrentPosition("3", periods, true)).toBe(2);
    });

    it("sin clave de orden compara con la etiqueta (texto exacto, sin mayúsculas/espacios)", () => {
        expect(findCurrentPosition("Feb", periods, false)).toBe(1);
        expect(findCurrentPosition(" mar ", periods, false)).toBe(2);
    });

    it("sin coincidencia devuelve -1 (no se elige otra fila)", () => {
        expect(findCurrentPosition(12, periods, true)).toBe(-1);
        expect(findCurrentPosition("Oct", periods, false)).toBe(-1);
        expect(findCurrentPosition("Feb", periods, true)).toBe(-1);
    });
});

describe("lastIndexWithReal — mes actual por omisión", () => {
    it("es el último punto (en orden cronológico) con Real; -1 si ninguno tiene", () => {
        expect(lastIndexWithReal([{ real: 1 }, { real: 2 }, { real: null }])).toBe(1);
        expect(lastIndexWithReal([{ real: null }, { real: null }])).toBe(-1);
    });
});

describe("periodSortKey — fecha inválida (cobertura 0.3.1.0)", () => {
    it("una fecha inválida no da clave de orden", () => {
        expect(periodSortKey(new Date("no-es-fecha"))).toBeNull();
    });
});
