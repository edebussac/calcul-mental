import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("enregistre le chiffre au contact, sans attendre le relâchement", () => {
    const onDigit = vi.fn();
    render(<Keypad onDigit={onDigit} onDelete={noop} onReset={noop} />);
    // Doigt posé, jamais relevé : le chiffre doit déjà être parti.
    fireEvent.pointerDown(screen.getByLabelText("Chiffre 4"));
    expect(onDigit).toHaveBeenCalledWith(4);
  });

  it("accepte deux touches qui se chevauchent, dans l'ordre des contacts", () => {
    const onDigit = vi.fn();
    render(<Keypad onDigit={onDigit} onDelete={noop} onReset={noop} />);
    // Le 6 est pressé alors que le 5 est ENCORE enfoncé : avec `click`, le
    // second appui serait perdu faute de relâchement sur le même élément.
    fireEvent.pointerDown(screen.getByLabelText("Chiffre 5"));
    fireEvent.pointerDown(screen.getByLabelText("Chiffre 6"));
    expect(onDigit.mock.calls.map(([d]) => d)).toEqual([5, 6]);
  });

  it("reste utilisable au clavier (aucun pointerdown émis)", () => {
    const onDigit = vi.fn();
    render(<Keypad onDigit={onDigit} onDelete={noop} onReset={noop} />);
    // Entrée / Espace sur un bouton focalisé produit un click de `detail` 0.
    fireEvent.click(screen.getByLabelText("Chiffre 3"), { detail: 0 });
    expect(onDigit).toHaveBeenCalledExactlyOnceWith(3);
  });

  it("montre les DEUX touches enfoncées quand deux doigts se chevauchent", () => {
    const onDigit = vi.fn();
    render(<Keypad onDigit={onDigit} onDelete={noop} onReset={noop} />);
    const cinq = screen.getByLabelText("Chiffre 5");
    const six = screen.getByLabelText("Chiffre 6");

    fireEvent.pointerDown(cinq, { pointerId: 1 });
    fireEvent.pointerDown(six, { pointerId: 2 });
    // `:active` n'en aurait marqué qu'une seule — d'où l'état piloté par doigt.
    expect(cinq).toHaveAttribute("data-pressed");
    expect(six).toHaveAttribute("data-pressed");

    // Chaque doigt ne relâche que sa propre touche.
    fireEvent.pointerUp(cinq, { pointerId: 1 });
    expect(cinq).not.toHaveAttribute("data-pressed");
    expect(six).toHaveAttribute("data-pressed");

    fireEvent.pointerUp(six, { pointerId: 2 });
    expect(six).not.toHaveAttribute("data-pressed");
  });

  it("relâche l'état pressé si le geste est annulé", () => {
    render(<Keypad onDigit={noop} onDelete={noop} onReset={noop} />);
    const touche = screen.getByLabelText("Chiffre 9");
    fireEvent.pointerDown(touche, { pointerId: 1 });
    expect(touche).toHaveAttribute("data-pressed");
    // Ex. le navigateur reprend le geste (scroll, appel entrant).
    fireEvent.pointerCancel(touche, { pointerId: 1 });
    expect(touche).not.toHaveAttribute("data-pressed");
  });

  it("ne compte pas deux fois un appui suivi de son clic", () => {
    const onDigit = vi.fn();
    render(<Keypad onDigit={onDigit} onDelete={noop} onReset={noop} />);
    const key = screen.getByLabelText("Chiffre 8");
    // Séquence réelle d'un tap : le navigateur émet le click APRÈS le
    // pointerdown. C'est `detail` (≥ 1 ici) qui doit le faire ignorer — sans
    // quoi chaque chiffre partirait en double.
    fireEvent.pointerDown(key);
    fireEvent.pointerUp(key);
    fireEvent.click(key, { detail: 1 });
    expect(onDigit).toHaveBeenCalledExactlyOnceWith(8);
  });

  it("désactive les touches quand disabled", () => {
    const onDigit = vi.fn();
    render(
      <Keypad onDigit={onDigit} onDelete={noop} onReset={noop} disabled />,
    );
    expect(screen.getByLabelText("Chiffre 5")).toBeDisabled();
    expect(screen.getByLabelText("Effacer")).toBeDisabled();
    expect(screen.getByLabelText("Tout effacer")).toBeDisabled();
    // L'attribut ne suffit pas : un élément désactivé peut malgré tout recevoir
    // un pointerdown, d'où le garde-fou explicite dans `pressProps`.
    fireEvent.pointerDown(screen.getByLabelText("Chiffre 5"));
    expect(onDigit).not.toHaveBeenCalled();
  });
});
