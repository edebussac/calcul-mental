import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Keypad } from "@/components/Keypad";

describe("Keypad", () => {
  const noop = () => {};

  it("affiche les chiffres 0 à 9, effacer et tout effacer", () => {
    render(<Keypad onDigit={noop} onDelete={noop} onReset={noop} />);
    for (let d = 0; d <= 9; d++) {
      expect(screen.getByLabelText(`Chiffre ${d}`)).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Effacer")).toBeInTheDocument();
    expect(screen.getByLabelText("Tout effacer")).toBeInTheDocument();
  });

  it("remonte le chiffre cliqué", async () => {
    const onDigit = vi.fn();
    render(<Keypad onDigit={onDigit} onDelete={noop} onReset={noop} />);
    await userEvent.click(screen.getByLabelText("Chiffre 7"));
    expect(onDigit).toHaveBeenCalledWith(7);
  });

  it("déclenche onDelete sur la touche effacer", async () => {
    const onDelete = vi.fn();
    render(<Keypad onDigit={noop} onDelete={onDelete} onReset={noop} />);
    await userEvent.click(screen.getByLabelText("Effacer"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("déclenche onReset sur la touche tout effacer", async () => {
    const onReset = vi.fn();
    render(<Keypad onDigit={noop} onDelete={noop} onReset={onReset} />);
    await userEvent.click(screen.getByLabelText("Tout effacer"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("désactive les touches quand disabled", () => {
    render(<Keypad onDigit={noop} onDelete={noop} onReset={noop} disabled />);
    expect(screen.getByLabelText("Chiffre 5")).toBeDisabled();
    expect(screen.getByLabelText("Effacer")).toBeDisabled();
    expect(screen.getByLabelText("Tout effacer")).toBeDisabled();
  });
});
