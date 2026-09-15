import { describe, expect, it } from "vitest";
import { ACTIONS, DEFAULT_BINDINGS, DEFAULT_SETTINGS, keyLabel, loadSettings, rebind } from "../src/app/settings";

describe("rebind", () => {
  it("atribui a tecla à ação e remove de qualquer outra (sem conflito)", () => {
    const next = rebind(DEFAULT_BINDINGS, "fire", "KeyW");
    expect(next.fire).toContain("KeyW");
    expect(next.forward).not.toContain("KeyW");
    expect(next.forward).toContain("ArrowUp");
    const all = Object.values(next).flat();
    expect(all.filter((c) => c === "KeyW")).toHaveLength(1);
  });

  it("substitui apenas o slot indicado", () => {
    const next = rebind(DEFAULT_BINDINGS, "forward", "KeyI", 1);
    expect(next.forward).toEqual(["KeyW", "KeyI"]);
    const again = rebind(next, "forward", "KeyU", 0);
    expect(again.forward).toEqual(["KeyU", "KeyI"]);
  });

  it("não altera o objeto original", () => {
    const copy = structuredClone(DEFAULT_BINDINGS);
    rebind(DEFAULT_BINDINGS, "jump", "KeyW");
    expect(DEFAULT_BINDINGS).toEqual(copy);
  });

  it("toda ação tem ao menos uma tecla padrão", () => {
    for (const a of ACTIONS) expect(DEFAULT_BINDINGS[a].length, a).toBeGreaterThan(0);
  });
});

describe("loadSettings", () => {
  it("usa padrões sem armazenamento ou com JSON inválido", () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ getItem: () => "{nope" })).toEqual(DEFAULT_SETTINGS);
  });

  it("mescla valores salvos com padrões (inclusive ações novas)", () => {
    const saved = { sensitivity: 2.5, bindings: { fire: ["Mouse2"] } };
    const s = loadSettings({ getItem: () => JSON.stringify(saved) });
    expect(s.sensitivity).toBe(2.5);
    expect(s.fov).toBe(DEFAULT_SETTINGS.fov);
    expect(s.bindings.fire).toEqual(["Mouse2"]);
    expect(s.bindings.reload).toEqual(DEFAULT_BINDINGS.reload);
  });
});

describe("keyLabel", () => {
  it("rotula teclas de forma legível", () => {
    expect(keyLabel("KeyE")).toBe("E");
    expect(keyLabel("Digit3")).toBe("3");
    expect(keyLabel("Mouse0")).toBe("Botão esquerdo");
    expect(keyLabel("Space")).toBe("Espaço");
    expect(keyLabel("F13")).toBe("F13");
  });
});
