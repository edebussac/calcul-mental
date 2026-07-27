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
// Doit coller EXACTEMENT au feedback de Game : 1 ms de plus et l'attente
// compterait comme du silence sur la question suivante (ce qu'elle est).
const FEEDBACK_MS = 350;
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

/** Tape le produit affiché ; le dernier chiffre valide la question. */
function answerCurrent(): void {
  const a = Number(screen.getByTestId("operand-a").textContent);
  const b = Number(screen.getByTestId("operand-b").textContent);
  for (const digit of String(a * b)) {
    fireEvent.click(screen.getByLabelText(`Chiffre ${digit}`));
  }
  advance(FEEDBACK_MS); // laisse passer le feedback → question suivante
}

/** Un appui neutre : prouve la présence sans jamais valider quoi que ce soit. */
function poke(): void {
  fireEvent.click(screen.getByLabelText("Tout effacer"));
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
