import { signal, computed } from "@preact/signals";
import { api, ApiError, type Profile, type ProgressResponse } from "../api/client";

export type HubTab = "map" | "shop" | "profile" | "badges" | "certificate" | "settings";

export type Route =
  | { name: "menu" }
  | { name: "auth"; mode: "login" | "register" }
  | { name: "hub"; tab: HubTab }
  | { name: "game"; phaseId: string; guest: boolean; nonce: number }
  | { name: "settings" }
  | { name: "legal"; doc: "terms" | "privacy"; back: Route };

export const route = signal<Route>({ name: "menu" });
export const user = signal<Profile | null>(null);
export const progress = signal<ProgressResponse | null>(null);
export const booting = signal(true);
export const serverOnline = signal(true);

export const isLogged = computed(() => user.value !== null);

export function navigate(r: Route): void {
  route.value = r;
  window.scrollTo?.(0, 0);
}

export async function refreshUser(): Promise<void> {
  try {
    const [me, prog] = await Promise.all([api.me(), api.progress()]);
    user.value = me;
    progress.value = prog;
    serverOnline.value = true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      user.value = null;
      progress.value = null;
    } else if (err instanceof ApiError && err.code === "network") {
      serverOnline.value = false;
    } else if (err instanceof ApiError && err.status >= 500) {
      serverOnline.value = false;
    }
  }
}

export async function boot(): Promise<void> {
  await refreshUser();
  booting.value = false;
  if (user.value) navigate({ name: "hub", tab: "map" });
}

export async function logout(): Promise<void> {
  try { await api.logout(); } catch { /* ignora */ }
  user.value = null;
  progress.value = null;
  navigate({ name: "menu" });
}
