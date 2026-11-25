import { describe, expect, it } from "vitest";
import * as pbiviz from "../pbiviz.json";
import * as pkg from "../package.json";
import * as lock from "../package-lock.json";

describe("versión 0.4.1.1 (fix desajuste panel/render para chartType \"bars\" + matriz explícita de regresión)", () => {
    it("pbiviz.json, package.json y package-lock.json están sincronizados en 0.4.1.1", () => {
        expect(pbiviz.visual.version).toBe("0.4.1.1");
        expect(pkg.version).toBe("0.4.1.1");
        expect(lock.version).toBe("0.4.1.1");
        expect((lock.packages as Record<string, { version?: string }>)[""].version).toBe("0.4.1.1");
    });
});
