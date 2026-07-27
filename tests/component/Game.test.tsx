import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Game } from "@/components/Game";
import type { AnswerRecord } from "@/lib/game/engine";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// Un profil est nécessaire pour que la partie soit sauvegardée ; on court-circuite
// `localStorage` (indisponible sous jsdom ici), hors sujet pour ce test.
vi.mock("@/lib/profile", () => ({
  useProfile: () => ({
    profile: { id: 1, name: "Test" },
    setProfile: () => {},
    ready: true,
  }),
}));

const ROUND_MS = 60_000;
let fetchMock: ReturnType<typeof vi.fn>;

/** Réponses effectivement postées à la fin du round. */
function postedAnswers(): AnswerRecord[] {
  const call = fetchMock.mock.calls.find(([url]) => url === "/api/sessions");
  if (!call) throw new Error("aucune session postée");
  return JSON.parse(call[1].body).answers;
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * Un appui au doigt. `pointerdown` et non `click` : c'est le chemin réel du
 * pavé depuis le passage au multi-touch — `fireEvent.click` emprunterait la
 * porte clavier (`detail === 0`) et ne prouverait rien du tactile.
 */
function press(label: string): void {
  fireEvent.pointerDown(screen.getByLabelText(label));
}

/**
 * Tape le produit affiché ; le dernier chiffre valide la question ET fait
 * apparaître la suivante dans le même tick — aucun délai à laisser passer.
 */
function answerCurrent(): void {
  const a = Number(screen.getByTestId("operand-a").textContent);
  const b = Number(screen.getByTestId("operand-b").textContent);
  for (const digit of String(a * b)) {
    press(`Chiffre ${digit}`);
  }
}

/** Un appui neutre : prouve la présence sans jamais valider quoi que ce soit. */
function poke(): void {
  press("Tout effacer");
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Game — enchaînement des questions", () => {
  /**
   * Le score est un nombre de réponses par minute : toute pause imposée après
   * une bonne réponse se retranche du round et plafonne mécaniquement le score.
   * La validation ne doit donc JAMAIS geler la saisie.
   */
  it("n'impose aucun temps mort entre deux questions", () => {
    render(<Game operation="multiplication" />);

    answerCurrent();
    // Dans le même tick : la question a changé et le pavé reste actif.
    expect(screen.getByLabelText("Chiffre 1")).not.toBeDisabled();

    answerCurrent();
    answerCurrent();

    advance(ROUND_MS);
    const answers = postedAnswers();
    expect(answers).toHaveLength(3);
    // Aucune réponse ne porte le silence d'un feedback bloquant.
    for (const answer of answers) expect(answer.maxIdleMs).toBe(0);
  });
});

describe("Game — écho du résultat trouvé", () => {
  it("affiche brièvement la réponse validée, sans figer la suivante", () => {
    render(<Game operation="multiplication" />);

    const a = Number(screen.getByTestId("operand-a").textContent);
    const b = Number(screen.getByTestId("operand-b").textContent);
    answerCurrent();

    // La question suivante est déjà posée, et le résultat trouvé reste lisible.
    expect(screen.getByTestId("answer-echo")).toHaveTextContent(String(a * b));
    expect(screen.getByLabelText("Chiffre 1")).not.toBeDisabled();

    // La case entière passe au vert, pas un contour.
    expect(screen.getByTestId("answer")).toHaveClass("answer-correct");

    // Il s'efface tout seul.
    advance(1000);
    expect(screen.queryByTestId("answer-echo")).not.toBeInTheDocument();
    // Le vert part AU MÊME MOMENT : une seule condition les pilote.
    expect(screen.getByTestId("answer")).not.toHaveClass("answer-correct");
  });

  it("rend la case au gris dès la première frappe", () => {
    render(<Game operation="multiplication" />);
    answerCurrent();
    expect(screen.getByTestId("answer")).toHaveClass("answer-correct");

    press("Chiffre 0");
    expect(screen.getByTestId("answer")).not.toHaveClass("answer-correct");
  });

  // Le 0 est la seule frappe qui ne puisse JAMAIS valider (les réponses vont de
  // 1 à 100) : taper « 1 » rendrait ces tests flaky une fois sur cent, quand la
  // question tirée au hasard se trouve être 1×1.
  const NEUTRE = "Chiffre 0";

  it("est recouvert dès la première frappe", () => {
    render(<Game operation="multiplication" />);
    answerCurrent();
    expect(screen.getByTestId("answer-echo")).toBeInTheDocument();

    press(NEUTRE);
    expect(screen.queryByTestId("answer-echo")).not.toBeInTheDocument();
    expect(screen.getByTestId("answer")).toHaveTextContent("0");
  });

  it("ne réapparaît pas quand la saisie est effacée", () => {
    render(<Game operation="multiplication" />);
    answerCurrent();

    press(NEUTRE);
    press("Effacer"); // saisie de nouveau vide, mais la question a changé
    expect(screen.queryByTestId("answer-echo")).not.toBeInTheDocument();
  });
});

describe("Game — mesure de l'inactivité", () => {
  it("sépare le blocage actif de l'absence sur une même durée", () => {
    render(<Game operation="multiplication" />);

    // 1. Réponse immédiate.
    answerCurrent();

    // 2. 20 s sans toucher à rien, puis réponse : c'est une absence.
    advance(20_000);
    answerCurrent();

    // 3. 20 s aussi, mais un appui toutes les 4 s : il cherchait.
    for (let i = 0; i < 5; i++) {
      advance(4000);
      poke();
    }
    answerCurrent();

    // Fin du round → sauvegarde.
    advance(ROUND_MS);

    const answers = postedAnswers();
    expect(answers).toHaveLength(3);

    expect(answers[0].maxIdleMs).toBe(0);

    // Les deux dernières ont duré ~20 s…
    expect(answers[1].responseMs).toBeGreaterThanOrEqual(20_000);
    expect(answers[2].responseMs).toBeGreaterThanOrEqual(20_000);
    // …mais seule l'une des deux est du silence.
    expect(answers[1].maxIdleMs).toBe(20_000);
    expect(answers[2].maxIdleMs).toBe(4000);
  });

  it("retient la plus longue pause, pas la dernière", () => {
    render(<Game operation="multiplication" />);

    advance(9000);
    poke();
    advance(1000);
    answerCurrent();

    advance(ROUND_MS);
    expect(postedAnswers()[0].maxIdleMs).toBe(9000);
  });

  it("repart de zéro à chaque nouvelle question", () => {
    render(<Game operation="multiplication" />);

    advance(12_000);
    answerCurrent();
    answerCurrent(); // enchaînée sans temps mort

    advance(ROUND_MS);
    const answers = postedAnswers();
    expect(answers[0].maxIdleMs).toBe(12_000);
    expect(answers[1].maxIdleMs).toBe(0);
  });
});
