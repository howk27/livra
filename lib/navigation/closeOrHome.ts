// lib/navigation/closeOrHome.ts
// A close control must always leave the screen. router.back() is a silent
// no-op when nothing sits under the route (a notification or link opened it on
// a cold start), which is how the Weekly Review's X went dead on the founder's
// device 2026-09-21. Same fallback the paywall has always had.

type ClosableRouter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: '/(tabs)/focus') => void;
};

export function closeOrHome(router: ClosableRouter): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/(tabs)/focus');
  }
}
