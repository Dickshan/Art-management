const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Separate connections: one for normal cache ops, two more for pub/sub
// (subscriber connections cannot issue other commands once subscribed).
const redis = new Redis(redisUrl);
const redisPub = new Redis(redisUrl);
const redisSub = new Redis(redisUrl);

redis.on('connect', () => console.log('[redis] connected'));
redis.on('error', (err) => console.error('[redis] error', err.message));

const DEFAULT_TTL_SECONDS = 60;

/** Read-through cache helper: return cached value or compute + store it. */
async function cached(key, ttlSeconds, computeFn) {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);

  const value = await computeFn();
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds ?? DEFAULT_TTL_SECONDS);
  return value;
}

/** Invalidate one or more cache keys, e.g. after a mutation. */
async function invalidate(...keys) {
  if (keys.length) await redis.del(...keys);
}

module.exports = { redis, redisPub, redisSub, cached, invalidate };
