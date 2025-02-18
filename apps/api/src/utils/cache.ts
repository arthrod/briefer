import { Request, Response, NextFunction } from 'express'
import cache from 'memory-cache'
import { logger } from '../logger.js'
import { CONFIG } from '../mf/chat/config/constants.js'

// 缓存接口
interface CacheOptions {
  ttl?: number // 过期时间（毫秒）
  prefix?: string // 键前缀
}

// 默认缓存选项
const defaultOptions: CacheOptions = {
  ttl: CONFIG.CACHE.DEFAULT_TTL,
  prefix: CONFIG.CACHE.KEY_PREFIX,
}

/**
 * Generates a cache key by concatenating a prefix and the provided key.
 * If a prefix is not supplied, the function uses the default prefix from the configuration.
 *
 * @param key - The primary key value.
 * @param prefix - An optional prefix for the cache key; if omitted, the default prefix is used.
 * @returns The final cache key in the format "prefix:key".
 */
export function generateCacheKey(key: string, prefix?: string): string {
  const finalPrefix = prefix || defaultOptions.prefix
  return `${finalPrefix}:${key}`
}

/**
 * Express middleware that caches JSON responses.
 *
 * This middleware attempts to return a cached response for the request's URL. If a cached response is found,
 * it sends that response immediately and logs a cache hit. If no cached response exists, it wraps the response's
 * JSON method to cache the output (using a TTL calculated as `duration * 1000` milliseconds) before sending the response,
 * and logs a cache miss.
 *
 * @param duration - The time-to-live (TTL) for the cached response in seconds.
 * @returns A middleware function that performs cache retrieval and storage.
 */
export function cacheMiddleware(duration: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.originalUrl || req.url
    const cachedResponse = cache.get(key)

    if (cachedResponse) {
      logger().debug('Cache hit:', { key })
      return res.json(cachedResponse)
    }

    logger().debug('Cache miss:', { key })
    const originalJson = res.json.bind(res)
    res.json = (body: any) => {
      cache.put(key, body, duration * 1000)
      return originalJson(body)
    }

    next()
  }
}

/**
 * Sets a value in the cache.
 *
 * This function stores a provided value in the cache using a generated cache key that
 * includes an optional prefix and a specified time-to-live (TTL) duration. Default cache
 * options are merged with any user-provided options. If an error occurs during the cache
 * operation, it is logged without throwing an exception.
 *
 * @param key - The key identifier for the cache entry.
 * @param value - The value to be cached.
 * @param options - An object with optional cache settings, such as `ttl` (time-to-live in milliseconds) and `prefix`.
 *
 * @example
 * setCache('user_123', { name: 'Alice' }, { ttl: 5000, prefix: 'usr_' });
 */
export function setCache<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): void {
  try {
    const { ttl, prefix } = { ...defaultOptions, ...options }
    const cacheKey = generateCacheKey(key, prefix)
    
    cache.put(cacheKey, value, ttl)
    
    logger().debug('Cache set:', { key: cacheKey, ttl })
  } catch (error) {
    logger().error('Cache set error:', { error, key })
  }
}

/**
 * Retrieves a value from the cache using a generated cache key.
 *
 * This function creates a complete cache key by combining the provided key with an optional prefix,
 * and then attempts to retrieve the corresponding value from the cache. It logs a debug message
 * indicating whether the cache was hit or missed, and logs an error description if an exception occurs.
 *
 * @param key - The base key to locate the cached value.
 * @param prefix - An optional prefix used to generate a unique cache key.
 * @returns The cached value if it exists; otherwise, null.
 */
export function getCache<T>(key: string, prefix?: string): T | null {
  try {
    const cacheKey = generateCacheKey(key, prefix)
    const value = cache.get(cacheKey)
    
    if (value === null) {
      logger().debug('Cache miss:', { key: cacheKey })
    } else {
      logger().debug('Cache hit:', { key: cacheKey })
    }
    
    return value
  } catch (error) {
    logger().error('Cache get error:', { error, key })
    return null
  }
}

/**
 * Deletes a cache entry using the specified key and an optional prefix.
 *
 * This function constructs the full cache key by calling `generateCacheKey` with the provided key and prefix, then deletes the corresponding entry from the cache using `cache.del`. It also logs the deletion through a debug message.
 *
 * @param key - The base key for the cache entry to be deleted.
 * @param prefix - An optional prefix to be used when generating the cache key.
 */
export function deleteCache(key: string, prefix?: string): void {
  const cacheKey = generateCacheKey(key, prefix)
  cache.del(cacheKey)
  logger().debug('Cache delete:', { key: cacheKey })
}

/**
 * Clears all cached data.
 *
 * This function removes all entries from the cache by invoking the underlying cache system’s clear method,
 * and logs the operation at the debug level.
 *
 * @remarks
 * No parameters are required and the function returns void.
 */
export function clearCache(): void {
  cache.clear()
  logger().debug('Cache cleared')
}

/**
 * Batch sets multiple cache entries.
 *
 * Iterates over an array of items and stores each key-value pair in the cache using the `setCache` method.
 *
 * @param items - An array of objects, each containing a `key` and its corresponding `value` to cache.
 * @param options - Optional cache configuration options (e.g., TTL and key prefix). Defaults to an empty object.
 */
export function setBulkCache<T>(
  items: Array<{ key: string; value: T }>,
  options: CacheOptions = {}
): void {
  items.forEach(item => {
    setCache(item.key, item.value, options)
  })
}

/**
 * Retrieves multiple cache entries based on an array of keys.
 *
 * This function iterates over the provided array of keys and uses the `getCache`
 * function to fetch each cached value. If a cache entry for a key is not found,
 * the corresponding element in the returned array is `null`.
 *
 * @param keys - An array of string keys for which to fetch cached values.
 * @param prefix - An optional prefix to be applied to each key during retrieval.
 * @returns An array of cached values for the given keys, with `null` representing any missing entries.
 */
export function getBulkCache<T>(keys: string[], prefix?: string): Array<T | null> {
  return keys.map(key => getCache<T>(key, prefix))
}

/**
 * Batch deletes cache entries.
 *
 * Iterates through the provided array of keys and deletes each associated cache entry
 * by invoking the `deleteCache` function. An optional prefix can be specified to modify
 * each key before deletion.
 *
 * @param keys - An array of cache keys to be removed.
 * @param prefix - (Optional) A prefix to prepend to each key if required.
 */
export function deleteBulkCache(keys: string[], prefix?: string): void {
  keys.forEach(key => deleteCache(key, prefix))
}

/**
 * Retrieves cache keys that contain the specified pattern.
 *
 * This function filters all keys available in the cache and returns only those that include the given substring.
 * In case of an error during key retrieval, the error is logged and an empty array is returned.
 *
 * @param pattern - The substring to search for within each cache key.
 * @returns An array of cache keys containing the specified pattern, or an empty array if an error occurs.
 */
export function getCacheKeys(pattern: string): string[] {
  try {
    return cache.keys()
      .filter(key => key.includes(pattern))
  } catch (error) {
    logger().error('Get cache keys error:', { error, pattern })
    return []
  }
}

/**
 * Retrieves cache statistics.
 *
 * This function returns an object with details about the cache performance, including
 * the number of items currently stored in the cache, the total cache hits, and the total cache misses.
 *
 * @returns An object containing:
 *  - `size`: The number of items in the cache.
 *  - `hits`: The number of cache hits.
 *  - `misses`: The number of cache misses.
 */
export function getCacheStats(): {
  size: number
  hits: number
  misses: number
} {
  return {
    size: cache.size(),
    hits: cache.hits(),
    misses: cache.misses(),
  }
}

/**
 * Checks if a cache entry exists for the given key.
 *
 * This function generates a complete cache key using the provided key and an optional prefix,
 * and then determines whether a corresponding entry exists in the cache.
 *
 * @param key - The identifier for the cache entry.
 * @param prefix - An optional prefix to namespace the cache key.
 * @returns True if the cache contains an entry for the generated key; otherwise, false.
 */
export function hasCache(key: string, prefix?: string): boolean {
  const cacheKey = generateCacheKey(key, prefix)
  return cache.get(cacheKey) !== null
}

/**
 * Updates a cache entry by applying an updater function to its current value.
 *
 * This function retrieves the current value from the cache using the specified key
 * (and an optional prefix provided in the cache options), passes that value (or null if not present)
 * to the updater function, and stores the result back in the cache with the same key.
 *
 * @param key - The unique identifier for the cache entry.
 * @param updater - A function that receives the current cache value (or null if the key is not found)
 * and returns the new value to be stored.
 * @param options - Optional cache configuration options such as time-to-live (ttl) and key prefix.
 *
 * @example
 * updateCache('userSession', (currentSession) => {
 *   if (currentSession) {
 *     currentSession.lastActive = Date.now();
 *     return currentSession;
 *   }
 *   return { lastActive: Date.now(), initialized: true };
 * }, { ttl: 3600000 });
 */
export function updateCache<T>(
  key: string,
  updater: (oldValue: T | null) => T,
  options: CacheOptions = {}
): void {
  const oldValue = getCache<T>(key, options.prefix)
  const newValue = updater(oldValue)
  setCache(key, newValue, options)
}

/**
 * Retrieves a value from the cache by key or obtains and caches it if not already present.
 *
 * This asynchronous function first checks if a value is already cached under the provided key (and optional prefix from the options).
 * If a cached value is found, it is returned immediately. Otherwise, it calls the supplied async getter function to obtain the value,
 * caches the new value with the provided options, and then returns it. Any errors during the getter execution are logged and rethrown.
 *
 * @param key - The unique key identifying the cache entry.
 * @param getter - An asynchronous function that fetches the value when it is not cached.
 * @param options - Optional cache configuration settings such as TTL and key prefix.
 * @returns A promise that resolves to the cached or newly fetched value.
 *
 * @throws Error - Rethrows any error encountered during the getter function execution.
 */
export async function getOrSetCache<T>(
  key: string,
  getter: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const cachedValue = getCache<T>(key, options.prefix)
  
  if (cachedValue !== null) {
    return cachedValue
  }
  
  try {
    const value = await getter()
    setCache(key, value, options)
    return value
  } catch (error) {
    logger().error('Get or set cache error:', { error, key })
    throw error
  }
}

/**
 * A method decorator that caches the result of an asynchronous method based on its arguments.
 *
 * This decorator intercepts calls to the decorated method and generates a cache key by combining
 * the method name with a JSON stringified representation of its arguments. It then uses the
 * `getOrSetCache` function to either retrieve a cached value or execute the original method, cache its
 * result, and return it. The caching behavior can be customized through the provided options.
 *
 * @param options - Optional cache configuration such as time-to-live (TTL) and key prefix.
 *
 * @example
 * class UserService {
 *   @Cacheable({ ttl: 60000, prefix: 'user' })
 *   async getUserDetails(userId: string): Promise<UserDetails> {
 *     // Expensive operation to fetch user details...
 *   }
 * }
 */
export function Cacheable(options: CacheOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const key = `${propertyKey}:${JSON.stringify(args)}`
      
      return getOrSetCache(
        key,
        () => originalMethod.apply(this, args),
        options
      )
    }

    return descriptor
  }
}

/**
 * Preloads the cache for a set of keys.
 *
 * This function concurrently fetches values for the provided keys using the given asynchronous getter function
 * and stores them in the cache with the supplied configuration options. It logs the completion of the warmup
 * along with the number of keys processed. In the event of an error during any of the operations, the error is logged
 * and then rethrown.
 *
 * @param keys - An array of keys to warm up in the cache.
 * @param getter - An asynchronous function that returns a value for a given key.
 * @param options - Optional cache configuration options (such as TTL and key prefix).
 *
 * @returns A promise that resolves when the cache warmup completes.
 *
 * @throws Re-throws any error encountered during the cache warmup process.
 */
export async function warmupCache<T>(
  keys: string[],
  getter: (key: string) => Promise<T>,
  options: CacheOptions = {}
): Promise<void> {
  try {
    await Promise.all(
      keys.map(async key => {
        const value = await getter(key)
        setCache(key, value, options)
      })
    )
    
    logger().info('Cache warmup completed:', { keys: keys.length })
  } catch (error) {
    logger().error('Cache warmup error:', { error })
    throw error
  }
}

/**
 * Performs a health check on the cache system by verifying that a test entry can be stored, retrieved, and deleted.
 *
 * This function sets a test key ("health-check") with a sample value, checks if the value can be successfully retrieved,
 * deletes the test key, and gathers cache statistics along with the current process memory usage. If the cached value
 * matches the expected value, the cache is considered healthy; otherwise, it is deemed unhealthy. In the event of an error,
 * the function logs the error and returns an unhealthy status with error details.
 *
 * @returns An object containing:
 * - `status`: "healthy" if the test value is retrieved correctly, or "unhealthy" if not.
 * - `details`: An object with cache statistics, process memory usage, or error details if an error occurred.
 */
export function checkCacheHealth(): {
  status: 'healthy' | 'unhealthy'
  details: any
} {
  try {
    const testKey = 'health-check'
    setCache(testKey, 'test')
    const value = getCache(testKey)
    deleteCache(testKey)

    const stats = getCacheStats()
    
    return {
      status: value === 'test' ? 'healthy' : 'unhealthy',
      details: {
        ...stats,
        memoryUsage: process.memoryUsage(),
      },
    }
  } catch (error) {
    logger().error('Cache health check error:', { error })
    return {
      status: 'unhealthy',
      details: { error: error instanceof Error ? error.message : String(error) },
    }
  }
}
