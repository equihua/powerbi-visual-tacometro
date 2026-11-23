import { describe, expect, it } from "vitest";
import * as pbiviz from "../pbiviz.json";
import * as pkg from "../package.json";
import * as lock from "../package-lock.json";

describe("versión 0.3.4.1 (fix: causa raíz del ancho inconsistente del sparkline + limpieza de debug)", () => {
    it("pbiviz.json, package.json y package-lock.json están sincronizados en 0.3.4.1", () => {
        expect(pbiviz.visual.version).toBe("0.3.4.1");
        expect(pkg.version).toBe("0.3.4.1");
        expect(lock.version).toBe("0.3.4.1");
        expect((lock.packages as Record<string, { version?: string }>)[""].version).toBe("0.3.4.1");
    });
});
