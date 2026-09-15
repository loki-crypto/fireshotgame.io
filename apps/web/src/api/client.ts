import type { GameEvent, PhaseSummary } from "@fireshot/sim";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

export interface LevelInfo { level: number; intoLevel: number; needed: number }

export interface Profile {
  id: string;
  name: string;
  email: string;
  xp: number;
  level: number;
  levelInfo: LevelInfo;
  bytes: number;
  activeSeconds: number;
  createdAt: string;
  badges: string[];
  upgradesOwned: string[];
  loadout: string[];
  slots: number;
  certificate: { code: string; issuedAt: string } | null;
}

export interface PhaseProgress {
  phaseId: string;
  unlocked: boolean;
  completed: boolean;
  completions: number;
  bestTimeS: number | null;
  activeSeconds: number;
}

export interface ProgressResponse {
  phases: PhaseProgress[];
  terminalAccuracy: number;
}

export interface BadgeEarned { id: string; earnedAt: string }

export interface EligibilityRequirement { key: "phases" | "accuracy" | "activeTime"; met: boolean; current: number; required: number }
export interface Eligibility { eligible: boolean; requirements: EligibilityRequirement[]; certificate: { code: string; issuedAt: string; fullName: string; activeHours: number } | null }

export interface VerifyResponse {
  valid: boolean;
  signatureOk: boolean;
  revoked: boolean;
  anonymized: boolean;
  code: string;
  fullName: string | null;
  activeHours: number;
  issuedAt: string;
  modules: string[];
}

const BASE = "/api/v1";
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "same-origin", headers: { "X-Requested-With": "fetch" } })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => { window.setTimeout(() => { refreshing = null; }, 0); });
  }
  return refreshing;
}

export async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "network");
  }
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refreshSession()) return request<T>(method, path, body, false);
  }
  if (!res.ok) {
    let code = "unknown", message = res.statusText, details: unknown;
    try {
      const data = (await res.json()) as { error?: { code: string; message: string; details?: unknown } };
      if (data.error) ({ code, message, details } = data.error);
    } catch { /* corpo não JSON */ }
    throw new ApiError(res.status, code, message, details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  register: (b: { email: string; password: string; name: string; acceptedTerms: boolean }) => request<{ user: Profile }>("POST", "/auth/register", b),
  login: (b: { email: string; password: string }) => request<{ user: Profile }>("POST", "/auth/login", b),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<Profile>("GET", "/me"),
  progress: () => request<ProgressResponse>("GET", "/progress"),
  startPhase: (phaseId: string) => request<{ sessionId: string; seed: number; equippedUpgrades: string[] }>("POST", `/phases/${encodeURIComponent(phaseId)}/start`),
  sendEvents: (sessionId: string, events: { type: string; clientTs: string; payload: Omit<GameEvent, "type"> }[]) =>
    request<{ accepted: number; rejected: { index: number; reason: string }[]; xpDelta: number; bytesDelta: number; newBadges: { id: string; name: string }[] }>("POST", `/sessions/${sessionId}/events`, { events }),
  answer: (sessionId: string, terminalId: string, b: { challengeIndex: number; attemptNo: number; answer: unknown; tampered: boolean }) =>
    request<{ correct: boolean; items: boolean[]; xpDelta: number; bytesDelta: number; newBadges: { id: string; name: string }[] }>("POST", `/sessions/${sessionId}/terminals/${encodeURIComponent(terminalId)}/answer`, b),
  complete: (sessionId: string, summary: PhaseSummary, elapsedS: number) =>
    request<{
      accepted: boolean; reasons: string[]; xpDelta: number; bytesDelta: number; xp: number; level: number; leveledUp: boolean;
      newBadges: { id: string; name: string }[]; breakdown: { key: string; xp: number; bytes: number }[];
    }>("POST", `/sessions/${sessionId}/complete`, { clientTs: new Date().toISOString(), elapsedS, stats: summary }),
  heartbeat: (b: { phaseId: string | null; clientTs: string }) => request<void>("POST", "/heartbeat", b),
  upgrades: () => request<{ owned: string[]; loadout: string[]; slots: number; bytes: number }>("GET", "/upgrades"),
  buyUpgrade: (id: string) => request<{ owned: string[]; loadout: string[]; slots: number; bytes: number }>("POST", `/upgrades/${encodeURIComponent(id)}/buy`),
  setLoadout: (ids: string[]) => request<{ owned: string[]; loadout: string[]; slots: number; bytes: number }>("PUT", "/upgrades/loadout", { equipped: ids }),
  badges: () => request<{ earned: BadgeEarned[] }>("GET", "/badges"),
  eligibility: () => request<Eligibility>("GET", "/certificates/eligibility"),
  issueCertificate: (b: { fullName: string; acceptTerms: boolean }) => request<{ code: string; issuedAt: string; fullName: string; activeHours: number }>("POST", "/certificates", b),
  deleteAccount: (b: { password: string; anonymizeCertificates: boolean }) => request<void>("DELETE", "/me", b),
  verify: (code: string) => request<VerifyResponse>("GET", `/verify/${encodeURIComponent(code)}`),
};

export function errorMessage(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    const key = err.code === "network" ? "errors.network" : `errors.${err.code}`;
    const authKey = `auth.errors.${err.code}`;
    const msg = t(authKey);
    if (msg !== authKey) return msg;
    const m2 = t(key);
    return m2 !== key ? m2 : err.message || t("errors.unknown");
  }
  return t("errors.unknown");
}
