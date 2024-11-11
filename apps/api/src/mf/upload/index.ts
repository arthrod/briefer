import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import { prisma } from '@briefer/database'
import { logger } from '../../logger.js'
import { authenticationMiddleware } from '../../auth/token.js'

const uploadRouter = Router()

// 添加测试模式开关
const USE_TEST_AUTH = false;  // 改为 false 时使用正常认证，true 时使用测试数据

// 添加测试用户数据辅助函数
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

// 创建通用的认证中间件
const authMiddleware = USE_TEST_AUTH
  ? ((req: Request, res: Response, next: NextFunction) => {
    req.session = getMockSession();
    next();
  })
  : authenticationMiddleware;

// 创建日期格式化函数
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 配置文件上传限制
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join('/opt/mindflow/upload/files', formatDate(new Date()))
    // 确保目录存在
    fs.mkdirSync(uploadDir, { recursive: true })
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const fileId = uuidv4()
    cb(null, fileId)
  }
})

const fileSizeLimit = 1024 * 1024 * 1024; // 1GB
const upload = multer({
  storage: storage,
  limits: {
    fileSize: fileSizeLimit, // 1GB
  }
})

// 添加文件大小检查中间件

const checkFileSize = (req: any, res: any, next: any) => {
  const contentLength = parseInt(req.headers['content-length'], 10);
  if (contentLength > fileSizeLimit) {
    return res.status(400).json({
      code: 400,
      msg: '文件大小不能超过1GB',
      data: null
    });
  }
  next();
};

// 文件上传接口
uploadRouter.post('/file', checkFileSize, authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      logger().error('No file uploaded')
      return res.status(400).json({
        code: 400,
        msg: '请选择要上传的文件',
        data: null
      })
    }

    const fileId = req.file.filename
    const filePath = req.file.path
    const fileName = req.file.originalname
    const fileSize = req.file.size

    logger().info({
      msg: 'Uploading file',
      data: {
        fileId,
        fileName,
        fileSize,
        filePath,
        userId: req.session.user.id
      }
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

    logger().info({
      msg: 'File uploaded successfully',
      data: {
        fileId,
        fileName,
        userId: req.session.user.id
      }
    })

    return res.json({
      code: 0,
      data: {
        id: fileId
      },
      msg: '上传成功'
    })

  } catch (err) {
    logger().error({
      msg: 'Failed to upload file',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        userId: req.session.user.id
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '文件上传失败',
      data: null
    })
  }
})

// 处理文件大小超限错误
uploadRouter.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        code: 400,
        msg: '文件大小不能超过1GB',
        data: null
      })
    }
  }
  next(err)
})

export default uploadRouter 