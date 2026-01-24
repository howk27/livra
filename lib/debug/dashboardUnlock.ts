/**
 * Runtime flag for IAP Dashboard route guard.
 * Settings 7-tap sets this before navigating; dashboard checks and consumes it.
 */

let dashboardUnlocked = false;

export function unlockDashboard(): void {
  dashboardUnlocked = true;
}

export function isDashboardUnlocked(): boolean {
  return dashboardUnlocked;
}

export function resetDashboardUnlock(): void {
  dashboardUnlocked = false;
}
