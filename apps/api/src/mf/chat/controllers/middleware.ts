import { Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { getMockSession } from '../services/mock.js'
import { authenticationMiddleware } from '../../../auth/token.js'
import { CONFIG } from '../config/constants.js'

// Rate Limits
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
})

export const createChatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20
})

export const completionsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10
})

export const summarizeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10
})

// Authentication Middleware
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (CONFIG.USE_TEST_AUTH) {
    req.session = getMockSession()
    return next()
  }
  return authenticationMiddleware(req, res, next)
}
