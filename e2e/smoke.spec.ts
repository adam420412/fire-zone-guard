import { test, expect } from "@playwright/test";

/**
 * Smoke E2E: aplikacja startuje w Chromium.
 * Realne testy eksportu PDF Kanban dodawane są iteracyjnie — ten plik
 * istnieje, żeby pipeline Playwrighta miał co uruchomić i potwierdzał,
 * że binarki + cache działają.
 */
test("aplikacja ładuje stronę startową", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
});
