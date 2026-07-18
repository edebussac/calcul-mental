import { test, expect, type Page } from "@playwright/test";

/** Sème un profil dans localStorage pour sauter l'étape de création. */
async function seedProfile(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "calcul-mental.profile",
      JSON.stringify({ id: 1, name: "Test" }),
    );
  });
}

/** Répond correctement à la question affichée. */
async function answerCurrent(page: Page) {
  await expect(page.getByLabel("Chiffre 1")).toBeEnabled();
  const a = Number(await page.getByTestId("operand-a").innerText());
  const b = Number(await page.getByTestId("operand-b").innerText());
  for (const digit of String(a * b)) {
    await page.getByLabel(`Chiffre ${digit}`).click();
  }
}

test("joue une session de multiplication et affiche le score", async ({
  page,
}) => {
  await seedProfile(page);
  await page.goto("/play/multiplication");

  // La question doit s'afficher.
  await expect(page.getByTestId("question")).toBeVisible();

  // Répond jusqu'à ce que le round se termine (round court en e2e).
  const finalScore = page.getByTestId("final-score");
  for (let i = 0; i < 20; i++) {
    if (await finalScore.isVisible().catch(() => false)) break;
    try {
      await answerCurrent(page);
    } catch {
      break; // le round s'est probablement terminé pendant la saisie
    }
  }

  // Écran de résultat visible avec un score numérique.
  await expect(page.getByText("Terminé")).toBeVisible();
  await expect(finalScore).toBeVisible();
  expect(Number(await finalScore.innerText())).toBeGreaterThanOrEqual(0);
});
