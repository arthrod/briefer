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
import { z } from 'zod'
import rateLimit from 'express-rate-limit'

const uploadRouter = Router()

// 配置常量
const USE_TEST_AUTH = true // 测试模式开关，true 时使用测试数据，false 时使用正常认证
const fileSizeLimit = 1024 * 1024 * 1024 // 1GB

// 速率限制器配置
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 50 // 限制每个IP 15分钟内最多50次上传
})

// 测试用户数据
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
    },
    userWorkspaces: {}
  }
}

// 认证中间件
const authMiddleware = USE_TEST_AUTH
  ? ((req: Request, res: Response, next: NextFunction) => {
    req.session = getMockSession();
    next();
  })
  : authenticationMiddleware;

// 日期格式化
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 文件存储配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join('/opt/mindflow/upload/files', formatDate(new Date()))
    fs.mkdirSync(uploadDir, { recursive: true })
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const fileId = uuidv4()
    cb(null, fileId)
  }
})

// Multer配置
const upload = multer({
  storage: storage,
  limits: {
    fileSize: fileSizeLimit
  }
})

// 文件大小检查中间件
const checkFileSize = (req: Request, res: Response, next: NextFunction) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > fileSizeLimit) {
    Logger.warn('文件大小超出限制', {
      size: contentLength,
      limit: fileSizeLimit,
      userId: req.session?.user?.id
    })
    return sendResponse(res, fail(ErrorCode.FILE_TOO_LARGE, '文件大小不能超过1GB'))
  }
  next();
};


// 文件上传接口
uploadRouter.post(
  '/file', 
  uploadLimiter,
  checkFileSize, 
  authMiddleware, 
  upload.single('file'), 
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        Logger.warn('未选择上传文件', {
          userId: req.session?.user?.id
        })
        return sendResponse(res, fail(ErrorCode.PARAM_ERROR, '请选择要上传的文件'))
      }

      const fileId = req.file.filename
      const filePath = req.file.path
      const fileName = req.file.originalname
      const fileSize = req.file.size

      Logger.info('开始上传文件', {
        fileId,
        fileName,
        fileSize,
        filePath,
        userId: req.session.user.id
      })

      // 保存文件信息到数据库
      await prisma().userFile.create({
        data: {
          fileId,
          fileName,
          fileSize: BigInt(fileSize),
          filePath,
          createdUserId: req.session.user.id
        }
      })

      Logger.info('文件上传成功', {
        fileId,
        fileName,
        userId: req.session.user.id
      })

      return sendResponse(res, success({ id: fileId }, '上传成功'))

    } catch (err) {
      Logger.error('文件上传失败', {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        userId: req.session?.user?.id
      })
      return sendResponse(res, handleError(err, '文件上传失败'))
    }
  }
)

// 错误处理中间件
uploadRouter.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      Logger.warn('文件大小超出限制', {
        error: err.message,
        userId: req.session?.user?.id
      })
      return sendResponse(res, fail(ErrorCode.FILE_TOO_LARGE, '文件大小不能超过1GB'))
    }
  }
  
  Logger.error('文件上传发生未知错误', {
    error: err,
    errorMessage: err instanceof Error ? err.message : '未知错误',
    errorStack: err instanceof Error ? err.stack : undefined,
    userId: req.session?.user?.id
  })
  
  return sendResponse(res, fail(ErrorCode.SERVER_ERROR, '服务器内部错误'))
})

export default uploadRouter 