import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Keypad } from "@/components/Keypad";

describe("Keypad", () => {
  it("affiche les chiffres 0 à 9 et la touche effacer", () => {
    render(<Keypad onDigit={() => {}} onDelete={() => {}} />);
    for (let d = 0; d <= 9; d++) {
      expect(screen.getByLabelText(`Chiffre ${d}`)).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Effacer")).toBeInTheDocument();
  });

  it("remonte le chiffre cliqué", async () => {
    const onDigit = vi.fn();
    render(<Keypad onDigit={onDigit} onDelete={() => {}} />);
    await userEvent.click(screen.getByLabelText("Chiffre 7"));
    expect(onDigit).toHaveBeenCalledWith(7);
  });

  it("déclenche onDelete sur la touche effacer", async () => {
    const onDelete = vi.fn();
    render(<Keypad onDigit={() => {}} onDelete={onDelete} />);
    await userEvent.click(screen.getByLabelText("Effacer"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("désactive les touches quand disabled", () => {
    render(<Keypad onDigit={() => {}} onDelete={() => {}} disabled />);
    expect(screen.getByLabelText("Chiffre 5")).toBeDisabled();
    expect(screen.getByLabelText("Effacer")).toBeDisabled();
  });
});
