import { describe, it, expect, vi, afterEach } from "vitest";
import { haptic } from "@/lib/haptics";

afterEach(() => {
  vi.restoreAllMocks();
  // Nettoie le label switch éventuellement injecté.
  document.querySelectorAll("label[aria-hidden='true']").forEach((el) => el.remove());
});

describe("haptic", () => {
  it("utilise navigator.vibrate quand disponible (Android)", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    haptic(30);
    expect(vibrate).toHaveBeenCalledWith(30);
    // Pas d'astuce iOS si la vibration a réussi.
    expect(document.querySelector("input[switch]")).toBeNull();
  });

  it("retombe sur l'astuce iOS (switch) quand vibrate échoue", () => {
    const vibrate = vi.fn(() => false);
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    haptic();
    expect(vibrate).toHaveBeenCalled();
    expect(document.querySelector("input[switch]")).not.toBeNull();
  });
});
