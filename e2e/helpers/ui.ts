import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

type ProjectUse = {
  isMobile?: boolean;
};

export function isMobileProject(testInfo: TestInfo): boolean {
  return Boolean((testInfo.project.use as ProjectUse | undefined)?.isMobile);
}

export async function openDrawer(
  page: Page,
  drawerName: 'Dataset Library' | 'Assumptions',
): Promise<Locator> {
  const triggerLabel =
    drawerName === 'Dataset Library' ? 'Open library panel' : 'Open assumptions panel';
  await page.getByRole('button', { name: triggerLabel }).click();
  const drawer = page.getByRole('dialog', { name: drawerName });
  await expect(drawer).toBeVisible();
  return drawer;
}

export async function openMobileSearch(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Open search' }).click();
  const dialog = page.getByRole('dialog', { name: 'Search companies' });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function setRange(slider: Locator, value: number): Promise<void> {
  await slider.focus();

  const stepAttr = await slider.getAttribute('step');
  const step = stepAttr ? Number(stepAttr) : 1;
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error(`Invalid range step: ${stepAttr}`);
  }

  let current = Number(await slider.inputValue());
  if (!Number.isFinite(current)) {
    throw new Error('Slider value is not numeric.');
  }

  if (Math.abs(current - value) <= step / 2) {
    return;
  }

  const key = value > current ? 'ArrowRight' : 'ArrowLeft';

  for (let i = 0; i < 500; i += 1) {
    await slider.press(key);
    const next = Number(await slider.inputValue());
    if (!Number.isFinite(next)) {
      break;
    }

    current = next;
    const reachedTarget =
      (key === 'ArrowRight' && current >= value - step / 2) ||
      (key === 'ArrowLeft' && current <= value + step / 2);
    if (reachedTarget) {
      return;
    }
  }

  throw new Error(`Unable to set slider to ${value}; current value is ${current}.`);
}
