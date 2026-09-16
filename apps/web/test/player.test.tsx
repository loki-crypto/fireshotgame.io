import { describe, expect, it } from "vitest";
import { avatars, registry, upgradeIcons } from "@fireshot/content";
import { render } from "preact";
import { USERNAME_RE, suggestUsername } from "../src/ui/screens/Auth";
import { nextUnlock, upgradeSlots } from "../src/ui/hub/unlocks";
import { PixelArt } from "../src/ui/components/PixelArt";

describe("username", () => {
  it("segue a mesma regra do servidor", () => {
    for (const ok of ["neo", "Neo.Sec_01", "a-b", "x".repeat(16), "007"]) expect(USERNAME_RE.test(ok), ok).toBe(true);
    for (const bad of ["ab", "x".repeat(17), ".neo", "_neo", "com espaço", "joão", "a@b"]) expect(USERNAME_RE.test(bad), bad).toBe(false);
  });

  it("sugere um username válido a partir do nome", () => {
    expect(suggestUsername("João da Silva")).toBe("joao.da.silva");
    expect(suggestUsername("  Ana  Lú ")).toBe("ana.lu");
    expect(suggestUsername("_Çé@#Ω Neo")).toBe("ce.neo");
    expect(suggestUsername("Maria Aparecida dos Santos").length).toBeLessThanOrEqual(16);
    expect(USERNAME_RE.test(suggestUsername("Lucas Ferreira"))).toBe(true);
  });
});

describe("desbloqueios do cartão do jogador", () => {
  it("slots espelham o servidor (1 + nível ÷ 2)", () => {
    expect([1, 2, 3, 4, 10].map(upgradeSlots)).toEqual([1, 2, 2, 3, 6]);
  });

  it("aponta o próximo nível que libera slot ou upgrade", () => {
    const from1 = nextUnlock(1, registry.upgrades)!;
    expect(from1.level).toBe(2);
    expect(from1.slot).toBe(true);
    expect(from1.upgrades.map((u) => u.id).sort()).toEqual(registry.upgrades.filter((u) => u.requiresLevel === 2).map((u) => u.id).sort());
    const from2 = nextUnlock(2, registry.upgrades)!;
    expect(from2.level).toBe(3);
    expect(from2.slot).toBe(false);
    expect(from2.upgrades.length).toBeGreaterThan(0);
    // sem upgrades novos, o próximo slot ainda conta como desbloqueio
    expect(nextUnlock(20, [])).toEqual({ level: 22, slot: true, upgrades: [] });
  });
});

describe("PixelArt", () => {
  it("desenha avatares e ícones como SVG nítido, juntando pixels vizinhos", () => {
    const host = document.createElement("div");
    const sprite = avatars[0]!;
    render(<PixelArt sprite={sprite} size={96} label={sprite.name} />, host);
    const svg = host.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe(sprite.name);
    expect(svg.getAttribute("viewBox")).toBe("0 0 12 12");
    expect(svg.getAttribute("shape-rendering")).toBe("crispEdges");
    const rects = [...svg.querySelectorAll("rect")];
    const painted = sprite.rows.join("").replace(/\./g, "").length;
    expect(rects.reduce((sum, r) => sum + Number(r.getAttribute("width")), 0)).toBe(painted);
    expect(rects.length).toBeLessThan(painted);

    render(<PixelArt sprite={upgradeIcons["def_mfa"]!} />, host);
    expect(host.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });
});
