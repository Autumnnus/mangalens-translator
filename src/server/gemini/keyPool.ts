type KeyState = {
  cooldownUntil: number;
  failureStreak: number;
  inFlight: number;
  lastUsedAt: number;
  minuteWindowStart: number;
  minuteRequests: number;
  minuteTokens: number;
  dayWindowStart: number;
  dayRequests: number;
};

type AcquireResult =
  | {
      key: string;
      release: () => void;
      waitMs: 0;
    }
  | {
      key: null;
      release: null;
      waitMs: number;
    };

const MAX_COOLDOWN_MS = 180000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const BASE_RATE_LIMIT_COOLDOWN_MS = 30_000;

type ModelLimits = {
  rpm: number;
  rpd: number;
  tpm: number;
};

const MODEL_LIMITS = {
  flashLite: { rpm: 15, rpd: 1000, tpm: 1_000_000 },
  flash: { rpm: 10, rpd: 250, tpm: 1_000_000 },
  pro: { rpm: 5, rpd: 100, tpm: 250_000 },
} satisfies Record<string, ModelLimits>;

const getUtcDayStart = (timestamp: number) => {
  const d = new Date(timestamp);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const getModelLimits = (modelName: string): ModelLimits => {
  const lower = modelName.toLowerCase();
  if (lower.includes("flash-lite")) return MODEL_LIMITS.flashLite;
  if (lower.includes("pro")) return MODEL_LIMITS.pro;
  return MODEL_LIMITS.flash;
};

class GeminiApiKeyPool {
  private orderedKeys: string[];
  private keyStates: Map<string, KeyState>;

  constructor(keys: string[]) {
    this.orderedKeys = [];
    this.keyStates = new Map();
    this.syncKeys(keys);
  }

  syncConfig(keys: string[]) {
    this.syncKeys(keys);
  }

  private syncKeys(keys: string[]) {
    const normalized = keys.filter(Boolean);
    this.orderedKeys = normalized;

    const keySet = new Set(normalized);
    for (const existingKey of this.keyStates.keys()) {
      if (!keySet.has(existingKey)) {
        this.keyStates.delete(existingKey);
      }
    }

    const now = Date.now();
    for (const key of normalized) {
      if (!this.keyStates.has(key)) {
        this.keyStates.set(key, {
          cooldownUntil: 0,
          failureStreak: 0,
          inFlight: 0,
          lastUsedAt: now,
          minuteWindowStart: now,
          minuteRequests: 0,
          minuteTokens: 0,
          dayWindowStart: getUtcDayStart(now),
          dayRequests: 0,
        });
      }
    }
  }

  private refreshWindows(state: KeyState, now: number) {
    if (now - state.minuteWindowStart >= MINUTE_MS) {
      state.minuteWindowStart = now;
      state.minuteRequests = 0;
      state.minuteTokens = 0;
    }

    const dayStart = getUtcDayStart(now);
    if (dayStart !== state.dayWindowStart) {
      state.dayWindowStart = dayStart;
      state.dayRequests = 0;
    }
  }

  acquire({
    modelName,
    excludeKeys,
  }: {
    modelName: string;
    excludeKeys?: Set<string>;
  }): AcquireResult {
    const now = Date.now();
    const limits = getModelLimits(modelName);
    let minimumWaitMs = Number.POSITIVE_INFINITY;

    for (const key of this.orderedKeys) {
      if (excludeKeys?.has(key)) continue;

      const state = this.keyStates.get(key);
      if (!state) continue;
      this.refreshWindows(state, now);

      if (state.cooldownUntil > now) {
        minimumWaitMs = Math.min(minimumWaitMs, state.cooldownUntil - now);
        continue;
      }

      // Keep one in-flight request per key to avoid bursty overuse.
      if (state.inFlight >= 1) {
        minimumWaitMs = Math.min(minimumWaitMs, 250);
        continue;
      }

      if (state.minuteRequests >= limits.rpm) {
        minimumWaitMs = Math.min(
          minimumWaitMs,
          state.minuteWindowStart + MINUTE_MS - now,
        );
        continue;
      }

      if (state.dayRequests >= limits.rpd) {
        minimumWaitMs = Math.min(
          minimumWaitMs,
          state.dayWindowStart + DAY_MS - now,
        );
        continue;
      }

      if (state.minuteTokens >= limits.tpm) {
        minimumWaitMs = Math.min(
          minimumWaitMs,
          state.minuteWindowStart + MINUTE_MS - now,
        );
        continue;
      }

      state.inFlight += 1;
      state.lastUsedAt = now;
      state.minuteRequests += 1;
      state.dayRequests += 1;

      return {
        key,
        waitMs: 0,
        release: () => {
          const current = this.keyStates.get(key);
          if (!current) return;
          current.inFlight = Math.max(0, current.inFlight - 1);
        },
      };
    }

    return {
      key: null,
      release: null,
      waitMs:
        Number.isFinite(minimumWaitMs) && minimumWaitMs > 0
          ? Math.ceil(minimumWaitMs)
          : 500,
    };
  }

  markSuccess(key: string, totalTokens: number) {
    const state = this.keyStates.get(key);
    if (!state) return;
    this.refreshWindows(state, Date.now());
    state.failureStreak = 0;
    state.cooldownUntil = 0;
    state.lastUsedAt = Date.now();
    state.minuteTokens += Math.max(0, Math.floor(totalTokens));
  }

  markRateLimited(key: string, modelName: string) {
    const state = this.keyStates.get(key);
    if (!state) return;
    const now = Date.now();
    this.refreshWindows(state, now);

    state.failureStreak += 1;

    const multiplier = Math.min(4, Math.max(1, state.failureStreak));
    const limits = getModelLimits(modelName);
    const minuteBoundaryWait = Math.max(
      0,
      state.minuteWindowStart + MINUTE_MS - now,
    );
    const cooldownMs = Math.max(
      minuteBoundaryWait,
      Math.min(MAX_COOLDOWN_MS, BASE_RATE_LIMIT_COOLDOWN_MS * multiplier),
    );

    state.cooldownUntil = now + Math.max(cooldownMs, MINUTE_MS / limits.rpm);
    state.lastUsedAt = now;
  }

  getStatusSummary(modelName: string) {
    const now = Date.now();
    const limits = getModelLimits(modelName);
    const cooldowns = this.orderedKeys.map((key) => {
      const state = this.keyStates.get(key);
      if (!state) return 0;
      this.refreshWindows(state, now);

      let wait = Math.max(0, state.cooldownUntil - now);
      if (state.inFlight >= 1) {
        wait = Math.max(wait, 250);
      }
      if (state.minuteRequests >= limits.rpm || state.minuteTokens >= limits.tpm) {
        wait = Math.max(wait, state.minuteWindowStart + MINUTE_MS - now);
      }
      if (state.dayRequests >= limits.rpd) {
        wait = Math.max(wait, state.dayWindowStart + DAY_MS - now);
      }
      return wait;
    });
    const positiveWaits = cooldowns.filter((value) => value > 0);

    return {
      totalKeys: this.orderedKeys.length,
      earliestReadyInMs: positiveWaits.length > 0 ? Math.min(...positiveWaits) : 0,
    };
  }
}

const poolRegistry = new Map<string, GeminiApiKeyPool>();

export const getGeminiApiKeyPool = ({
  poolId,
  keys,
}: {
  poolId: string;
  keys: string[];
}) => {
  const existing = poolRegistry.get(poolId);
  if (existing) {
    existing.syncConfig(keys);
    return existing;
  }

  const created = new GeminiApiKeyPool(keys);
  poolRegistry.set(poolId, created);
  return created;
};
