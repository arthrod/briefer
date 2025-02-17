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
 *
 * This function constructs the cache key by combining the prefix (either provided or the default one)
 * and the key, separated by a colon.
 *
 * @param key - The unique key to be appended to the prefix.
 * @param prefix - An optional prefix for the cache key; if not provided, the default prefix is used.
 * @returns The generated cache key in the format "prefix:key".
 */
export function generateCacheKey(key: string, prefix?: string): string {
  const finalPrefix = prefix || defaultOptions.prefix
  return `${finalPrefix}:${key}`
}

/**
 * Express middleware to cache JSON responses.
 *
 * This middleware checks if there is a cached response for the incoming request based on the request URL.
 * If a cached response exists, it immediately returns that response. Otherwise, it overrides the default
 * res.json method to cache the response body (for the specified duration, in seconds) before sending it,
 * then proceeds to the next middleware.
 *
 * @param duration - The time-to-live for the cached response, specified in seconds.
 *
 * @returns An Express middleware function.
 *
 * @example
 * // Apply the cache middleware with a TTL of 60 seconds
 * app.get('/api/items', cacheMiddleware(60), (req, res) => {
 *   res.json({ items: ['item1', 'item2'] });
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
 * Stores a value in the cache with a specific key and configuration options.
 *
 * This function merges the provided cache options with the default options to determine the TTL
 * (time-to-live) and key prefix. It then constructs a cache key using the merged options, and
 * attempts to store the value in the cache. On success, it logs a debug message with the cache key
 * and TTL. If an error occurs during the caching process, the error is caught and logged.
 *
 * @param key - The identifier for the cache entry.
 * @param value - The value to be stored in the cache.
 * @param options - Optional cache configuration, including TTL and key prefix.
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
 * Retrieves a cached value based on the provided key and optional prefix.
 *
 * This function constructs a full cache key using the given key and an optional
 * prefix, then attempts to retrieve the cached value associated with that key.
 * It logs whether the cache lookup resulted in a hit or a miss. If an error occurs
 * during retrieval, the error is logged and the function returns null.
 *
 * @param key - The unique identifier used to retrieve the cache entry.
 * @param prefix - An optional prefix to prepend to the key when generating the cache key.
 * @returns The cached value of type T if found; otherwise, null.
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
 * Deletes a specific cache entry.
 *
 * This function generates the effective cache key by combining the provided key with an optional prefix,
 * then removes the corresponding entry from the cache. It logs a debug message indicating the cache key that was deleted.
 *
 * @param key - The base key for the cache entry to be deleted.
 * @param prefix - An optional prefix for the cache key to avoid naming collisions.
 */
export function deleteCache(key: string, prefix?: string): void {
  const cacheKey = generateCacheKey(key, prefix)
  cache.del(cacheKey)
  logger().debug('Cache delete:', { key: cacheKey })
}

/**
 * Clears all cache entries.
 *
 * This function removes every entry from the in-memory cache and logs a debug message indicating that the cache has been cleared.
 *
 * @remarks
 * Use this function to reset the cache state, ensuring that any stale or outdated data is purged.
 */
export function clearCache(): void {
  cache.clear()
  logger().debug('Cache cleared')
}

/**
 * Batch sets cache entries.
 *
 * Iterates over an array of key-value pair items and stores each entry in the cache using the `setCache` function.
 * This function applies the same caching options to all entries.
 *
 * @param items - An array of objects, each containing:
 *   - `key`: A string representing the cache key.
 *   - `value`: The value to be cached (of generic type T).
 * @param options - Optional cache configuration options, such as TTL and key prefix.
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
 * This function iterates over each key in the provided array and retrieves its corresponding value from the cache
 * by invoking the `getCache` function. If a key is not found in the cache, the corresponding value in the returned
 * array will be `null`.
 *
 * @param keys - An array of cache keys to retrieve.
 * @param prefix - An optional prefix to use when constructing the full cache key.
 * @returns An array where each element is the cached value for the corresponding key, or `null` if not found.
 */
export function getBulkCache<T>(keys: string[], prefix?: string): Array<T | null> {
  return keys.map(key => getCache<T>(key, prefix))
}

/**
 * Deletes multiple cache entries.
 *
 * Iterates over an array of keys and deletes each corresponding cache entry using the optional prefix.
 *
 * @param keys - An array of cache keys to be removed.
 * @param prefix - An optional prefix to be applied to each key during deletion.
 */
export function deleteBulkCache(keys: string[], prefix?: string): void {
  keys.forEach(key => deleteCache(key, prefix))
}

/**
 * Retrieves cache keys that contain the specified pattern.
 *
 * This function filters the list of cache keys, returning only those that include the provided pattern.
 * If an error occurs during the retrieval process, it logs the error and returns an empty array.
 *
 * @param pattern - The substring to search for within cache keys.
 * @returns An array of matching cache keys, or an empty array if an error is encountered.
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
 * This function returns an object containing the current state of the cache, including the total number of items stored,
 * as well as the counts for cache hits and misses.
 *
 * @returns An object with the cache statistics:
 *   - size: The number of items currently stored in the cache.
 *   - hits: The number of successful cache retrievals.
 *   - misses: The number of unsuccessful cache retrieval attempts.
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
 * Determines whether a cache entry exists for the given key.
 *
 * This function creates a cache key by combining the provided key with an optional prefix
 * using the `generateCacheKey` function, and then checks if an entry with that key exists in the cache.
 *
 * @param key - The base key to look up in the cache.
 * @param prefix - (Optional) A prefix to be combined with the key to form the complete cache key.
 * @returns True if a cache entry exists for the generated key; otherwise, false.
 */
export function hasCache(key: string, prefix?: string): boolean {
  const cacheKey = generateCacheKey(key, prefix)
  return cache.get(cacheKey) !== null
}

/**
 * Updates an existing cache entry by applying an updater function to its current value.
 *
 * This function retrieves the current cache value for the specified key using the provided options.
 * It then calls the updater function with the current value (or null if the cache entry does not exist)
 * to compute a new value, which is subsequently stored in the cache.
 *
 * @param key - The key identifying the cache entry to update.
 * @param updater - A function that takes the current value (or null) and returns the updated value.
 * @param options - Optional cache configuration parameters such as TTL and key prefix.
 *
 * @example
 * updateCache('user:123', (currentValue) => {
 *   // If the cache entry exists, update its state; otherwise, initialize it.
 *   return currentValue ? { ...currentValue, active: true } : { active: true };
 * });
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
 * Retrieves a cached value for the specified key or sets it by invoking the provided asynchronous getter function.
 *
 * The function first attempts to obtain a value from the cache. If a non-null cached value exists (using an optional prefix specified in the options), it returns this value immediately. If no cached value is found, it calls the provided getter function to asynchronously fetch the value, then stores the returned value in the cache with the provided options before returning it.
 *
 * @param key - The cache key used to retrieve or set the cache entry.
 * @param getter - An asynchronous function that fetches the value if it is not present in the cache.
 * @param options - Optional cache configuration, such as TTL and key prefix. Defaults to an empty object.
 *
 * @returns A Promise that resolves to the value retrieved from the cache or fetched via the getter function.
 *
 * @throws Will throw an error if the getter function fails, after logging the error.
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
 * Decorator to cache the result of an asynchronous method.
 *
 * When applied, this decorator intercepts calls to the decorated method by generating a cache key composed of the method name and a JSON stringified version of its arguments.
 * It then attempts to retrieve the cached result using the `getOrSetCache` function. If a cached value exists, it returns that value immediately.
 * Otherwise, it invokes the original method, caches its result using the provided cache options, and returns the newly computed value.
 *
 * @param options - Optional cache configuration settings (e.g., TTL, key prefix) that control caching behavior.
 *
 * @example
 * ```typescript
 * class ExampleService {
 *   @Cacheable({ ttl: 60000, prefix: 'example' })
 *   async fetchData(param: string): Promise<Data> {
 *     // Perform expensive data fetching operation
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
 * Preloads cache entries for a list of keys.
 *
 * This asynchronous function warms up the cache by concurrently retrieving values
 * for each key using the provided getter function and storing them in the cache with
 * the specified options. It logs the completion of the warmup operation or any errors
 * encountered during the process.
 *
 * @param keys - An array of keys to preload into the cache.
 * @param getter - An async function that takes a key and returns a Promise resolving to the value for that key.
 * @param options - Optional cache configuration options such as TTL and prefix.
 * @throws Propagates any error encountered during the cache warmup process.
 *
 * @example
 * ```typescript
 * await warmupCache(['user:1', 'user:2'], async (key) => {
 *   // Fetch data for the given key, for example from a database.
 *   return getUserData(key);
 * });
 * ```
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
 * Checks the health of the cache by performing a set, get, and delete cycle on a test key.
 *
 * This function attempts to store a test value in the cache, retrieve it, and then remove it. It then retrieves
 * the current cache statistics and memory usage. If the test value is successfully retrieved, the cache is deemed
 * "healthy"; otherwise, it is "unhealthy". Any errors encountered during these operations are logged, and the
 * function returns an "unhealthy" status along with error details.
 *
 * @returns An object containing:
 * - `status`: A string indicating the health of the cache, either 'healthy' or 'unhealthy'.
 * - `details`: An object including cache statistics and, if the cache is healthy, the current process memory usage.
 *
 * @example
 * const health = checkCacheHealth();
 * if (health.status === 'healthy') {
 *   console.log('Cache is healthy', health.details);
 * } else {
 *   console.error('Cache health check failed:', health.details);
 * }
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
