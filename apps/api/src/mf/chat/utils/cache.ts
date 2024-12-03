import { Request, Response, NextFunction } from 'express'
import cache from 'memory-cache'
import { logger } from '../../../logger.js'
import { CONFIG } from '../config/constants.js'

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

// 生成缓存键
export function generateCacheKey(key: string, prefix?: string): string {
  const finalPrefix = prefix || defaultOptions.prefix
  return `${finalPrefix}:${key}`
}

// 缓存中间件
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

// 设置缓存
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

// 获取缓存
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

// 删除缓存
export function deleteCache(key: string, prefix?: string): void {
  const cacheKey = generateCacheKey(key, prefix)
  cache.del(cacheKey)
  logger().debug('Cache delete:', { key: cacheKey })
}

// 清除所有缓存
export function clearCache(): void {
  cache.clear()
  logger().debug('Cache cleared')
}

// 批量设置缓存
export function setBulkCache<T>(
  items: Array<{ key: string; value: T }>,
  options: CacheOptions = {}
): void {
  items.forEach(item => {
    setCache(item.key, item.value, options)
  })
}

// 批量获取缓存
export function getBulkCache<T>(keys: string[], prefix?: string): Array<T | null> {
  return keys.map(key => getCache<T>(key, prefix))
}

// 批量删除缓存
export function deleteBulkCache(keys: string[], prefix?: string): void {
  keys.forEach(key => deleteCache(key, prefix))
}

// 获取缓存键模式
export function getCacheKeys(pattern: string): string[] {
  try {
    return cache.keys()
      .filter(key => key.includes(pattern))
  } catch (error) {
    logger().error('Get cache keys error:', { error, pattern })
    return []
  }
}

// 缓存统计信息
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

// 检查缓存是否存在
export function hasCache(key: string, prefix?: string): boolean {
  const cacheKey = generateCacheKey(key, prefix)
  return cache.get(cacheKey) !== null
}

// 更新缓存
export function updateCache<T>(
  key: string,
  updater: (oldValue: T | null) => T,
  options: CacheOptions = {}
): void {
  const oldValue = getCache<T>(key, options.prefix)
  const newValue = updater(oldValue)
  setCache(key, newValue, options)
}

// 获取或设置缓存
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

// 缓存装饰器
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

// 缓存预热
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

// 缓存健康检查
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
