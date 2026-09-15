import { describe, expect, it } from "vitest";
import { InputManager, LOCK_SETTLE_MS, MAX_LOOK_DELTA } from "../src/game/input/InputManager";
import { DEFAULT_SETTINGS, rebind, type Settings } from "../src/app/settings";

function setup(patch: Partial<Settings> = {}) {
  let now = 0;
  const settings: Settings = { ...structuredClone(DEFAULT_SETTINGS), ...patch };
  const input = new InputManager(() => settings, () => now);
  return { input, settings, advance: (ms: number) => { now += ms; } };
}

describe("InputManager", () => {
  it("converte teclas mantidas em movimento e respeita o mapeamento", () => {
    const { input } = setup();
    input.keyDown("KeyW");
    input.keyDown("KeyD");
    let inp = input.build();
    expect(inp.forward).toBe(1);
    expect(inp.strafe).toBe(1);
    input.keyDown("KeyS");
    inp = input.build();
    expect(inp.forward).toBe(0);
    input.keyUp("KeyW");
    input.keyUp("KeyS");
    input.keyDown("ArrowLeft");
    input.keyUp("KeyD");
    inp = input.build();
    expect(inp.forward).toBe(0);
    expect(inp.strafe).toBe(-1);
  });

  it("bordas (recarregar, arma, denunciar) valem uma única vez por toque", () => {
    const { input } = setup();
    input.keyDown("KeyR");
    input.keyDown("Digit3");
    const first = input.build();
    expect(first.reload).toBe(true);
    expect(first.weaponSlot).toBe(3);
    const second = input.build();
    expect(second.reload).toBe(false);
    expect(second.weaponSlot).toBe(0);
    input.keyUp("KeyR");
    input.keyDown("KeyR");
    expect(input.build().reload).toBe(true);
  });

  it("atirar exige ponteiro capturado", () => {
    const { input } = setup();
    input.keyDown("Mouse0");
    expect(input.build().fire).toBe(false);
    input.setLocked(true);
    expect(input.build().fire).toBe(true);
  });

  it("não produz entrada quando desabilitado (terminal/pausa)", () => {
    const { input } = setup();
    input.enabled = false;
    input.keyDown("KeyW");
    input.keyDown("KeyR");
    const inp = input.build();
    expect(inp.forward).toBe(0);
    expect(inp.reload).toBe(false);
  });

  it("releaseAll solta teclas presas", () => {
    const { input } = setup();
    input.keyDown("KeyW");
    input.releaseAll();
    expect(input.build().forward).toBe(0);
  });

  it("mouse gira a câmera com sensibilidade e inversão do eixo Y", () => {
    const { input, advance } = setup({ sensitivity: 2, invertY: true });
    input.setLocked(true);
    advance(LOCK_SETTLE_MS + 1);
    input.mouseMove(10, 10);
    expect(input.yaw).toBeCloseTo(-10 * 0.0022 * 2);
    expect(input.pitch).toBeCloseTo(10 * 0.0022 * 2);
  });

  it("limita o pitch e ignora movimento sem captura", () => {
    const { input, advance } = setup();
    input.mouseMove(50, 50);
    expect(input.yaw).toBe(0);
    input.setLocked(true);
    advance(LOCK_SETTLE_MS + 1);
    for (let i = 0; i < 200; i++) input.mouseMove(0, -200);
    expect(input.pitch).toBeLessThan(Math.PI / 2);
    expect(input.pitch).toBeGreaterThan(Math.PI / 2 - 0.05);
  });

  it("descarta o salto espúrio do primeiro evento após capturar o ponteiro", () => {
    const { input, advance } = setup();
    input.setLocked(true);
    input.mouseMove(-1013, -584);
    expect(input.yaw).toBe(0);
    expect(input.pitch).toBe(0);
    advance(LOCK_SETTLE_MS + 1);
    input.mouseMove(MAX_LOOK_DELTA + 1, 0);
    expect(input.yaw).toBe(0);
    input.mouseMove(20, 0);
    expect(input.yaw).not.toBe(0);
  });

  it("roda do mouse alterna armas uma vez", () => {
    const { input } = setup();
    input.wheelMove(120);
    expect(input.build().weaponCycle).toBe(1);
    expect(input.build().weaponCycle).toBe(0);
    input.wheelMove(-3);
    expect(input.build().weaponCycle).toBe(-1);
  });

  it("usa as teclas remapeadas", () => {
    const { input, settings } = setup();
    settings.bindings = rebind(settings.bindings, "reload", "KeyQ");
    input.keyDown("KeyR");
    expect(input.build().reload).toBe(false);
    input.keyDown("KeyQ");
    expect(input.build().reload).toBe(true);
  });
});
