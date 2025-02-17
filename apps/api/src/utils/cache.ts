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
 * Generates a cache key by combining the provided key with a prefix.
 *
 * If no prefix is provided, the function uses the default prefix from `defaultOptions`.
 *
 * @param key - The unique identifier to be appended to the prefix.
 * @param prefix - An optional prefix to use; if not provided, the default prefix is used.
 * @returns The generated cache key in the format "prefix:key".
 *
 * @example
 * ```typescript
 * // Assuming defaultOptions.prefix is "app"
 * generateCacheKey("user123"); // returns "app:user123"
 * generateCacheKey("user123", "custom"); // returns "custom:user123"
 * ```
 */
export function generateCacheKey(key: string, prefix?: string): string {
  const finalPrefix = prefix || defaultOptions.prefix
  return `${finalPrefix}:${key}`
}

/**
 * Express middleware for caching JSON responses.
 *
 * This middleware checks if a response for a request is already cached 
 * using the request URL as the cache key. If a cached response is found,
 * it returns the cached data immediately. Otherwise, it intercepts the 
 * response's JSON method to cache the response body for the specified duration.
 *
 * @param duration - The time in seconds for which the response should be cached.
 *
 * @returns A middleware function for Express that handles caching of JSON responses.
 *
 * @example
 * // Use the middleware in an Express route to cache responses for 60 seconds
 * app.get('/api/data', cacheMiddleware(60), (req, res) => {
 *   res.json({ data: 'sample data' });
 * });
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
 * This function stores the provided value in the cache using a generated key. It merges the given
 * options with the default cache settings to determine the time-to-live (TTL) and key prefix, and uses
 * these to create a complete cache key via the `generateCacheKey` utility. The value is then cached
 * and a debug message is logged. In case of an error during caching, the error is caught and logged.
 *
 * @param key - The base key used for caching.
 * @param value - The value to be cached.
 * @param options - Optional cache configuration (e.g., TTL and key prefix).
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
 * Retrieves a value from the cache using a specified key and optional prefix.
 *
 * This function first generates a cache key by combining the provided key with an optional prefix. It then attempts to retrieve the corresponding value from the cache. A debug log is recorded for both cache hits and misses. In the event of an error during the retrieval process, the error is logged and the function returns null.
 *
 * @param key - The key used to identify the cached value.
 * @param prefix - An optional string to prepend to the key for namespacing.
 * @returns The cached value if found; otherwise, null.
 *
 * @example
 * const userData = getCache<User>('user123', 'app_');
 * if (userData) {
 *   // Use the cached user data
 * }
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
 * Deletes a cache entry for the specified key.
 *
 * This function generates the full cache key by combining the provided key and an optional prefix,
 * then removes the associated entry from the cache. It logs the cache deletion operation for debugging purposes.
 *
 * @param key - The identifier of the cache entry to delete.
 * @param prefix - (Optional) A prefix to be applied when generating the full cache key.
 */
export function deleteCache(key: string, prefix?: string): void {
  const cacheKey = generateCacheKey(key, prefix)
  cache.del(cacheKey)
  logger().debug('Cache delete:', { key: cacheKey })
}

/**
 * Clears all entries from the cache.
 *
 * This function calls the underlying cache's clear method to remove every cached item and logs a debug message
 * indicating that the cache has been cleared. It does not return any value.
 */
export function clearCache(): void {
  cache.clear()
  logger().debug('Cache cleared')
}

/**
 * Bulk sets multiple cache entries.
 *
 * Iterates over an array of key-value pairs and sets each cache entry using the provided options.
 * Internally, it delegates to the `setCache` function for each item.
 *
 * @param items - An array of objects, each containing a `key` (the cache identifier) and a `value` (the data to be cached).
 * @param options - Optional cache configuration (e.g., TTL and key prefix). Defaults to an empty object.
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
 * Retrieves multiple cache values for the given array of keys.
 *
 * This function iterates over the provided keys, using the `getCache` function to fetch the cached value for each key.
 * An optional prefix can be specified, which will be applied to each key before retrieval.
 *
 * @param keys - The array of keys to retrieve cached values for.
 * @param prefix - An optional prefix to apply to each key.
 * @returns An array where each element is the cached value associated with the corresponding key, or `null` if not found.
 */
export function getBulkCache<T>(keys: string[], prefix?: string): Array<T | null> {
  return keys.map(key => getCache<T>(key, prefix))
}

/**
 * Deletes multiple cache entries.
 *
 * Iterates over each key in the provided array and removes the corresponding cache entry using the specified prefix, if available.
 *
 * @param keys - The list of cache keys to delete.
 * @param prefix - An optional prefix applied to each key.
 */
export function deleteBulkCache(keys: string[], prefix?: string): void {
  keys.forEach(key => deleteCache(key, prefix))
}

/**
 * Retrieves cache keys that match a specified pattern.
 *
 * This function fetches all keys from the cache and filters them by checking if they include the provided substring pattern.
 * If an error occurs during the key retrieval or filtering, it logs the error along with the pattern and returns an empty array.
 *
 * @param pattern - The substring pattern to search for in cache keys.
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
 * Retrieves current cache statistics, including the total number of items,
 * cache hits, and cache misses.
 *
 * @returns An object containing:
 *   - `size`: The total number of items stored in the cache.
 *   - `hits`: The number of successful cache retrievals.
 *   - `misses`: The number of failed cache retrieval attempts.
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
 * Checks whether a cache entry exists for a given key.
 *
 * This function creates a cache key by combining the provided key with an optional prefix,
 * and then verifies if a corresponding cache entry exists by checking that the cache's value is not null.
 *
 * @param key - The base key used for the cache lookup.
 * @param prefix - An optional prefix to prepend to the key.
 * @returns True if the cache contains an entry for the generated key; otherwise, false.
 */
export function hasCache(key: string, prefix?: string): boolean {
  const cacheKey = generateCacheKey(key, prefix)
  return cache.get(cacheKey) !== null
}

/**
 * Updates the cache value for the specified key by applying an updater function.
 *
 * This function retrieves the existing cache value (or `null` if the key does not exist), uses
 * the provided updater function to generate a new value, and then stores the new value in the cache
 * using the specified options.
 *
 * @param key - The cache key to update.
 * @param updater - A function that takes the current cache value (or `null` if not present) and returns the new value.
 * @param options - Optional cache configuration options (e.g., TTL, prefix).
 *
 * @example
 * // Update a counter in the cache, initializing to 0 if absent.
 * updateCache("counter", (current) => (current ?? 0) + 1, { ttl: 60000 });
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
 * Retrieves a value from the cache or fetches and caches it using a provided getter if not already present.
 *
 * This function first attempts to retrieve a cached value associated with the given key (and optional prefix from the options). 
 * If the value is present, it is immediately returned. Otherwise, it calls the provided asynchronous getter function to fetch 
 * the value, caches this value using the specified options (e.g., TTL, prefix) via the setCache function, and then returns it.
 *
 * In the event that the getter function throws an error, the error is logged and rethrown.
 *
 * @param key - The unique key identifying the cache entry.
 * @param getter - An asynchronous function that retrieves the value if it is not found in the cache.
 * @param options - Optional cache configuration, such as time-to-live (TTL) and key prefix. Defaults to an empty object.
 * @returns A promise that resolves with the cached value or the value retrieved by the getter.
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
 * Decorator that caches the result of a method call.
 *
 * When applied, this decorator wraps the original method and caches its return value using a cache key
 * generated from the method name and its arguments (stringified via JSON). The cache is managed by the
 * `getOrSetCache` function, which retrieves the cached value if available or executes the original method,
 * caches its result, and then returns it.
 *
 * @param options - Optional cache configuration such as TTL (time-to-live) and key prefix.
 *
 * @example
 * ```typescript
 * class ExampleService {
 *   @Cacheable({ ttl: 60000 })
 *   async fetchData(id: number): Promise<Data> {
 *     // Perform an expensive asynchronous operation
 *     return await this.getDataFromSource(id);
 *   }
 * }
 * ```
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
 * Preloads the cache with values for the specified keys.
 *
 * This asynchronous function concurrently fetches the value for each provided key using the given getter function, and stores it in the cache with the provided options. It logs the number of keys processed upon successful completion and propagates any errors encountered during the warmup process.
 *
 * @param keys - An array of keys for which to preload the cache.
 * @param getter - An asynchronous function that retrieves the value corresponding to a given key.
 * @param options - Optional cache configuration options such as TTL and key prefix.
 *
 * @returns A promise that resolves when the cache warmup is complete.
 *
 * @throws Will throw an error if any part of the cache warmup process fails.
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
 * Performs a health check on the cache system.
 *
 * The function verifies the operational status of the cache by:
 *  - Setting a temporary test key ("health-check") with the value "test".
 *  - Retrieving the value to confirm it was stored correctly.
 *  - Deleting the test key after the check.
 *  - Gathering cache statistics and process memory usage.
 *
 * If the test value is retrieved as expected, the cache is considered "healthy"; otherwise, it is reported as "unhealthy".
 * In case of an error during any of these operations, the function logs the error and returns an "unhealthy" status along with error details.
 *
 * @returns An object with:
 *  - `status`: "healthy" if the cache passes the health check, "unhealthy" otherwise.
 *  - `details`: An object containing cache statistics (from getCacheStats) and process memory usage, or error information if an exception occurred.
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
