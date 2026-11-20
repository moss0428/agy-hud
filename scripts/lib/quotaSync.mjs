import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;
export const WINDOW_TOLERANCE_MS = 5 * 60 * 1000;
const TIE_REFRESH_MS = 5000;

/**
 * Default path for the cross-session quota sync cache file.
 */
export function defaultQuotaCachePath() {
  return path.join(os.tmpdir(), 'agy-hud-quota-sync.json');
}

/**
 * Normalize an incoming quota bucket into canonical fraction + reset epoch milliseconds.
 */
export function normalizeIncomingBucket(entry, nowMs = Date.now()) {
  if (
    !entry ||
    typeof entry !== 'object' ||
    Array.isArray(entry) ||
    entry.disabled === true ||
    typeof entry.remaining_fraction !== 'number' ||
    !Number.isFinite(entry.remaining_fraction)
  ) {
    return null;
  }

  const remainingFraction = Math.max(0, Math.min(1, entry.remaining_fraction));
  let resetMs = null;

  if (typeof entry.reset_time === 'string' && entry.reset_time) {
    const parsed = Date.parse(entry.reset_time);
    if (Number.isFinite(parsed)) {
      resetMs = parsed;
    }
  }
  if (
    resetMs === null &&
    typeof entry.reset_in_seconds === 'number' &&
    Number.isFinite(entry.reset_in_seconds)
  ) {
    resetMs = nowMs + Math.max(0, Math.floor(entry.reset_in_seconds)) * 1000;
  }

  const resetTime =
    typeof entry.reset_time === 'string' && entry.reset_time
      ? entry.reset_time
      : resetMs !== null
        ? new Date(resetMs).toISOString()
        : null;

  return {
    remaining_fraction: remainingFraction,
    resetMs,
    resetTime,
  };
}

function isCacheEntryValid(cached, nowMs, maxAgeMs) {
  if (
    !cached ||
    typeof cached !== 'object' ||
    typeof cached.remaining_fraction !== 'number' ||
    !Number.isFinite(cached.remaining_fraction) ||
    typeof cached.updatedAtMs !== 'number' ||
    !Number.isFinite(cached.updatedAtMs)
  ) {
    return false;
  }
  if (nowMs - cached.updatedAtMs > maxAgeMs) {
    return false;
  }
  if (typeof cached.resetMs === 'number' && cached.resetMs <= nowMs) {
    return false;
  }
  return true;
}

function buildCacheRecord(norm, nowMs) {
  return {
    remaining_fraction: norm.remaining_fraction,
    resetMs: norm.resetMs,
    resetTime: norm.resetTime,
    updatedAtMs: nowMs,
  };
}

/**
 * Merge an incoming quota bucket against a cached entry using reset-window & usage rules.
 */
export function mergeBucket(
  incomingRaw,
  cached,
  nowMs = Date.now(),
  maxAgeMs = DEFAULT_MAX_AGE_MS
) {
  const incoming = normalizeIncomingBucket(incomingRaw, nowMs);
  if (!incoming) {
    return {
      entry: incomingRaw,
      nextCache: cached ?? null,
      changed: false,
    };
  }

  const validCached = isCacheEntryValid(cached, nowMs, maxAgeMs) ? cached : null;
  if (!validCached) {
    return {
      entry: incomingRaw,
      nextCache: buildCacheRecord(incoming, nowMs),
      changed: true,
    };
  }

  let winner = 'incoming';

  if (
    incoming.remaining_fraction >= 0.9999 &&
    validCached.remaining_fraction < 0.9999
  ) {
    // Protect active consumption against idle windows with sliding 100% reset timers
    winner = 'cache';
  } else if (
    incoming.resetMs !== null &&
    incoming.resetMs <= nowMs &&
    validCached.resetMs !== null &&
    validCached.resetMs > nowMs
  ) {
    // Sleeping window still holding an expired window adopts the newer active window
    winner = 'cache';
  } else if (
    incoming.resetMs !== null &&
    validCached.resetMs !== null &&
    Math.abs(incoming.resetMs - validCached.resetMs) > WINDOW_TOLERANCE_MS
  ) {
    winner = incoming.resetMs > validCached.resetMs ? 'incoming' : 'cache';
  } else {
    // Same reset window (or missing resetMs): lower remaining_fraction is fresher
    const diff = incoming.remaining_fraction - validCached.remaining_fraction;
    if (diff < -1e-6) {
      winner = 'incoming';
    } else if (diff > 1e-6) {
      winner = 'cache';
    } else {
      const shouldRefresh = nowMs - validCached.updatedAtMs > TIE_REFRESH_MS;
      return {
        entry: incomingRaw,
        nextCache: shouldRefresh ? buildCacheRecord(incoming, nowMs) : validCached,
        changed: shouldRefresh,
      };
    }
  }

  if (winner === 'cache') {
    const mergedEntry = {
      ...incomingRaw,
      remaining_fraction: validCached.remaining_fraction,
      ...(validCached.resetTime ? { reset_time: validCached.resetTime } : {}),
      ...(validCached.resetMs !== null
        ? {
            reset_in_seconds: Math.max(
              0,
              Math.floor((validCached.resetMs - nowMs) / 1000)
            ),
          }
        : {}),
    };
    return {
      entry: mergedEntry,
      nextCache: validCached,
      changed: false,
    };
  }

  return {
    entry: incomingRaw,
    nextCache: buildCacheRecord(incoming, nowMs),
    changed: true,
  };
}

function readCacheFile(cachePath) {
  try {
    if (!fs.existsSync(cachePath)) {
      return { version: 1, accounts: {} };
    }
    const raw = fs.readFileSync(cachePath, 'utf8');
    if (!raw.trim()) {
      return { version: 1, accounts: {} };
    }
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      parsed.accounts &&
      typeof parsed.accounts === 'object' &&
      !Array.isArray(parsed.accounts)
    ) {
      return {
        version: 1,
        accounts: parsed.accounts,
      };
    }
  } catch {
    // Fail open on unreadable or corrupted cache files
  }
  return { version: 1, accounts: {} };
}

function pruneAccounts(accounts, nowMs, maxAgeMs) {
  const nextAccounts = {};
  let pruned = false;

  for (const [acctKey, buckets] of Object.entries(accounts)) {
    if (!buckets || typeof buckets !== 'object' || Array.isArray(buckets)) {
      pruned = true;
      continue;
    }
    const nextBuckets = {};
    for (const [bucketKey, record] of Object.entries(buckets)) {
      if (isCacheEntryValid(record, nowMs, maxAgeMs)) {
        nextBuckets[bucketKey] = record;
      } else {
        pruned = true;
      }
    }
    if (Object.keys(nextBuckets).length > 0) {
      nextAccounts[acctKey] = nextBuckets;
    } else if (Object.keys(buckets).length > 0) {
      pruned = true;
    }
  }

  return { nextAccounts, pruned };
}

function writeCacheAtomic(cachePath, data) {
  const dir = path.dirname(cachePath);
  const rand = Math.random().toString(36).slice(2, 8);
  const tmpPath = path.join(
    dir,
    `.${path.basename(cachePath)}.${process.pid}.${rand}.tmp`
  );
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(data), {
      encoding: 'utf8',
      mode: 0o600,
    });
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(tmpPath, 0o600);
      } catch {
        // Ignore chmod errors on filesystems without POSIX permissions
      }
    }
    fs.renameSync(tmpPath, cachePath);
  } catch {
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // Fail open silently
    }
  }
}

/**
 * Synchronize payload.quota across concurrent CLI sessions for the same account.
 * Fail-open: never throws and never fabricates quota when payload.quota is absent/empty.
 */
export function syncQuotaPayload(
  payload,
  {
    nowMs = Date.now(),
    cachePath = process.env.AGY_HUD_QUOTA_CACHE_PATH || defaultQuotaCachePath(),
    enabled = process.env.AGY_HUD_QUOTA_SYNC !== '0',
    maxAgeMs = DEFAULT_MAX_AGE_MS,
  } = {}
) {
  if (
    !enabled ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    !payload.quota ||
    typeof payload.quota !== 'object' ||
    Array.isArray(payload.quota) ||
    Object.keys(payload.quota).length === 0
  ) {
    return payload;
  }

  const accountKey =
    typeof payload.email === 'string' && payload.email.trim()
      ? payload.email.trim().toLowerCase()
      : '_default';

  const cache = readCacheFile(cachePath);
  const { nextAccounts, pruned } = pruneAccounts(cache.accounts, nowMs, maxAgeMs);
  const accountBuckets = { ...(nextAccounts[accountKey] ?? {}) };
  const mergedQuota = {};
  let anyChanged = pruned;

  for (const [bucketKey, bucketValue] of Object.entries(payload.quota)) {
    const { entry, nextCache, changed } = mergeBucket(
      bucketValue,
      accountBuckets[bucketKey],
      nowMs,
      maxAgeMs
    );
    mergedQuota[bucketKey] = entry;
    if (nextCache) {
      accountBuckets[bucketKey] = nextCache;
    }
    if (changed) {
      anyChanged = true;
    }
  }

  if (Object.keys(accountBuckets).length > 0) {
    nextAccounts[accountKey] = accountBuckets;
  }

  if (anyChanged) {
    writeCacheAtomic(cachePath, { version: 1, accounts: nextAccounts });
  }

  return {
    ...payload,
    quota: mergedQuota,
  };
}
