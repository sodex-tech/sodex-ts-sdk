import { describe, expect, it, vi } from "vitest";
import { MiniEmitter } from "../../src/ws/emitter";

interface TestEvents {
  open: undefined;
  data: { value: number };
  error: { message: string };
}

describe("MiniEmitter", () => {
  it("fires listener on emit", () => {
    const emitter = new MiniEmitter<TestEvents>();
    const fn = vi.fn();
    emitter.on("data", fn);
    emitter.emit("data", { value: 42 });
    expect(fn).toHaveBeenCalledWith({ value: 42 });
  });

  it("supports multiple listeners", () => {
    const emitter = new MiniEmitter<TestEvents>();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    emitter.on("data", fn1);
    emitter.on("data", fn2);
    emitter.emit("data", { value: 1 });
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it("on() returns unsubscribe function", () => {
    const emitter = new MiniEmitter<TestEvents>();
    const fn = vi.fn();
    const unsub = emitter.on("data", fn);
    unsub();
    emitter.emit("data", { value: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("off() removes a listener", () => {
    const emitter = new MiniEmitter<TestEvents>();
    const fn = vi.fn();
    emitter.on("data", fn);
    emitter.off("data", fn);
    emitter.emit("data", { value: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("handles undefined payload (open event)", () => {
    const emitter = new MiniEmitter<TestEvents>();
    const fn = vi.fn();
    emitter.on("open", fn);
    emitter.emit("open", undefined);
    expect(fn).toHaveBeenCalledWith(undefined);
  });

  it("clear() removes all listeners", () => {
    const emitter = new MiniEmitter<TestEvents>();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    emitter.on("data", fn1);
    emitter.on("error", fn2);
    emitter.clear();
    emitter.emit("data", { value: 1 });
    emitter.emit("error", { message: "err" });
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  it("emitting to unregistered event does not throw", () => {
    const emitter = new MiniEmitter<TestEvents>();
    expect(() => emitter.emit("data", { value: 1 })).not.toThrow();
  });
});
