import { describe, expect, it, vi } from "vitest";
import { ActiveTimeTracker, HEARTBEAT_INTERVAL_MS, INPUT_WINDOW_MS } from "../src/api/activeTime";

function setup(visible = true) {
  let now = 0;
  let vis = visible;
  let intervalFn: (() => void) | null = null;
  const send = vi.fn(async (_phaseId: string | null) => {});
  const tracker = new ActiveTimeTracker({
    now: () => now,
    isVisible: () => vis,
    send,
    setInterval: (fn, ms) => { expect(ms).toBe(HEARTBEAT_INTERVAL_MS); intervalFn = fn; return 1; },
    clearInterval: () => { intervalFn = null; },
  });
  return {
    tracker, send,
    advance: (ms: number) => { now += ms; },
    setVisible: (v: boolean) => { vis = v; },
    fire: () => intervalFn?.(),
    running: () => intervalFn !== null,
  };
}

describe("ActiveTimeTracker (tempo ativo, não tempo online)", () => {
  it("não envia heartbeat sem input recente", () => {
    const s = setup();
    s.tracker.start();
    s.advance(HEARTBEAT_INTERVAL_MS);
    s.fire();
    expect(s.send).not.toHaveBeenCalled();
  });

  it("envia quando a aba está visível e houve input nos últimos 60 s", () => {
    const s = setup();
    s.tracker.start();
    s.tracker.phaseId = "01-lan";
    s.tracker.markInput();
    s.advance(HEARTBEAT_INTERVAL_MS);
    s.fire();
    expect(s.send).toHaveBeenCalledWith("01-lan");
    expect(s.tracker.sent).toBe(1);
  });

  it("para de enviar quando o input fica velho (> 60 s)", () => {
    const s = setup();
    s.tracker.start();
    s.tracker.markInput();
    s.advance(INPUT_WINDOW_MS + 1);
    s.fire();
    expect(s.send).not.toHaveBeenCalled();
  });

  it("não envia com a aba oculta", () => {
    const s = setup(false);
    s.tracker.start();
    s.tracker.markInput();
    s.fire();
    expect(s.send).not.toHaveBeenCalled();
    s.setVisible(true);
    s.fire();
    expect(s.send).toHaveBeenCalledTimes(1);
  });

  it("falha de rede no heartbeat não derruba o rastreador", async () => {
    const s = setup();
    s.send.mockRejectedValueOnce(new Error("offline"));
    s.tracker.start();
    s.tracker.markInput();
    expect(() => s.fire()).not.toThrow();
    await Promise.resolve();
    s.fire();
    expect(s.send).toHaveBeenCalledTimes(2);
  });

  it("start é idempotente e stop cancela o intervalo", () => {
    const s = setup();
    s.tracker.start();
    s.tracker.start();
    expect(s.running()).toBe(true);
    s.tracker.stop();
    expect(s.running()).toBe(false);
  });
});
