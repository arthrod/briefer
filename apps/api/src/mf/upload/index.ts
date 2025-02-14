import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import { prisma } from '@briefer/database'
import { Logger } from '../../utils/logger.js'
import { success, fail, handleError, sendResponse } from '../../utils/response.js'
import { ErrorCode } from '../../constants/errorcode.js'
import { authenticationMiddleware } from '../../auth/token.js'
import rateLimit from 'express-rate-limit'

const uploadRouter = Router()

// 配置常量
const USE_TEST_AUTH = false // 测试模式开关，true 时使用测试数据，false 时使用正常认证
const fileSizeLimit = 1024 * 1024 * 1024 // 1GB

// 速率限制器配置
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 50, // 限制每个IP 15分钟内最多50次上传
})

/**
 * Returns a mock session object for testing purposes.
 *
 * This function simulates an authenticated user session by returning a sample object that includes test user details
 * such as a fixed user ID, status, name, login name, email, and timestamps for when the user was created and last updated.
 * It also provides an empty `userWorkspaces` object. This is useful for bypassing actual authentication in development
 * or testing environments.
 *
 * @returns A mock session object with a `user` property containing test user data and an empty `userWorkspaces` property.
 */
function getMockSession() {
  return {
    user: {
      id: 'test-user-id-123',
      status: 1,
      name: 'Test User',
      loginName: 'Test User',
      email: 'test@example.com',
      picture: '',
      phone: '',
      nickname: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    },
    userWorkspaces: {},
  }
}

// 认证中间件
const authMiddleware = USE_TEST_AUTH
  ? (req: Request, res: Response, next: NextFunction) => {
      req.session = getMockSession()
      next()
    }
  : authenticationMiddleware

/**
 * Formats a Date object into a string using the "YYYY-MM-DD" format.
 *
 * This function extracts the year, month, and day from the given Date object,
 * ensuring that both the month and day values are two digits (padding with a leading zero when needed).
 *
 * @param date - The Date object to format.
 * @returns The formatted date string in the "YYYY-MM-DD" format.
 */
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 文件存储配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 默认目录
    const defaultDir = path.join('/opt/mindflow/upload/files', formatDate(new Date()));
    // 用户目录（隐藏目录）
    const fallbackDir = path.join(process.env['HOME'] || '', '.mindflow/upload/files', formatDate(new Date()));

    // 尝试创建默认目录
    try {
      fs.mkdirSync(defaultDir, { recursive: true });
      cb(null, defaultDir);
    } catch (error: unknown) {
      // 如果没有权限，使用用户目录
      if (error instanceof Error && 'code' in error && error.code === 'EACCES') {
        Logger.error('创建上传目录失败：没有权限，使用用户目录', {
          defaultDir,
          error,
          userId: req.session?.user?.id,
        });
        // 确保用户目录存在
        try {
          fs.mkdirSync(fallbackDir, { recursive: true });
          cb(null, fallbackDir);
        } catch (fallbackError: unknown) {
          Logger.error('创建用户上传目录失败', {
            fallbackDir,
            error: fallbackError,
            userId: req.session?.user?.id,
          });
          cb(Object.assign(new Error('没有权限创建上传目录'), { code: ErrorCode.FORBIDDEN }), fallbackDir);
        }
      } else {
        // 其他错误
        Logger.error('创建上传目录失败', {
          defaultDir,
          error,
          userId: req.session?.user?.id,
        });
        cb(Object.assign(new Error('创建上传目录失败'), { code: ErrorCode.SERVER_ERROR }), defaultDir);
      }
    }
  },
  filename: function (req, file, cb) {
    const fileId = uuidv4();
    cb(null, fileId);
  },
});


// Multer配置
const upload = multer({
  storage: storage,
  limits: {
    fileSize: fileSizeLimit,
  },
})

// 文件大小检查中间件
const checkFileSize = (req: Request, res: Response, next: NextFunction) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10)
  if (contentLength > fileSizeLimit) {
    Logger.warn('文件大小超出限制', {
      size: contentLength,
      limit: fileSizeLimit,
      userId: req.session?.user?.id,
    })
    return sendResponse(res, fail(ErrorCode.FILE_TOO_LARGE, '文件大小不能超过1GB'))
  }
  next()
}

// 文件上传接口
uploadRouter.post(
  '/file',
  uploadLimiter,
  checkFileSize,
  authMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, function(err) {
      if (err) {
        Logger.error('文件上传失败', {
          error: err,
          errorMessage: err.message,
          errorCode: err.code,
          userId: req.session?.user?.id,
        })
        return sendResponse(res, fail(err.code || ErrorCode.SERVER_ERROR, err.message || '文件上传失败'))
      }
      if (!req.file) {
        Logger.warn('未选择上传文件', {
          userId: req.session?.user?.id,
        })
        return sendResponse(res, fail(ErrorCode.PARAM_ERROR, '请选择要上传的文件'))
      }
      next()
    })
  },
  async (req: Request, res: Response) => {
    try {
      // 由于前面的中间件已经确保了文件存在，这里断言 file 一定存在
      const file = req.file as Express.Multer.File
      const fileId = file.filename
      const filePath = file.path
      const fileName = decodeURIComponent(file.originalname)
      const fileSize = file.size

      Logger.info('开始上传文件', {
        fileId,
        fileName,
        fileSize,
        filePath,
        userId: req.session.user.id,
      })

      // 保存文件信息到数据库
      await prisma().userFile.create({
        data: {
          fileId,
          fileName,
          fileSize: BigInt(fileSize),
          filePath,
          createdUserId: req.session.user.id,
        },
      })

      Logger.info('文件上传成功', {
        fileId,
        fileName,
        userId: req.session.user.id,
      })

      return sendResponse(res, success({ id: fileId }, '上传成功'))
    } catch (err: unknown) {
      if (err instanceof Error) {
        const errorCode = (err as any).code || ErrorCode.SERVER_ERROR
        Logger.error('文件上传失败', {
          error: err,
          errorMessage: err.message,
          errorStack: err.stack,
          userId: req.session?.user?.id,
        })
        return sendResponse(res, fail(errorCode, err.message))
      } else {
        Logger.error('文件上传发生未知错误', {
          error: err,
          userId: req.session?.user?.id,
        })
        return sendResponse(res, fail(ErrorCode.SERVER_ERROR, '服务器内部错误'))
      }
    }
  }
)

// 错误处理中间件
uploadRouter.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      Logger.warn('文件大小超出限制', {
        error: err.message,
        userId: req.session?.user?.id,
      })
      return sendResponse(res, fail(ErrorCode.FILE_TOO_LARGE, '文件大小不能超过1GB'))
    }
  }

  Logger.error('文件上传发生未知错误', {
    error: err,
    errorMessage: err instanceof Error ? err.message : '未知错误',
    errorStack: err instanceof Error ? err.stack : undefined,
    userId: req.session?.user?.id,
  })

  return sendResponse(res, fail(ErrorCode.SERVER_ERROR, '服务器内部错误'))
})

export default uploadRouter
