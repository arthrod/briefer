import { Router } from 'express'
import { z } from 'zod'
import { prisma, addUserByAPI } from '@briefer/database'
import { hashPassword } from '../../password.js'
import { logger } from '../../logger.js'
import { sessionFromCookies, authenticationMiddleware } from '../../auth/token.js'

const userRouter = Router({ mergeParams: true })

const userSchema = z.object({
  name: z.string().min(1, "用户名不能为空"),
  password: z.string().min(6, "密码长度至少6位"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  email: z.string().email("请输入有效的邮箱").optional(),
  nickname: z.string().optional()
})

// 创建用户
userRouter.post('/add', async (req, res) => {
  try {
    const result = userSchema.safeParse(req.body)
    if (!result.success) {
      logger().error({
        msg: 'Invalid user input',
        data: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          })),
          requestBody: req.body,
          timestamp: new Date().toISOString()
        }
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: null
      })
    }

    const { name, password, phone, email, nickname } = result.data

    logger().info({ msg: 'Attempting to create user', data: result.data })

    const existingUser = await prisma().user.findFirst({
      where: { name }
    })

    if (existingUser) {
      logger().warn({
        msg: 'Username already exists',
        data: {
          existingUsername: name,
          requestedData: {
            phone,
            email,
            nickname
          },
          timestamp: new Date().toISOString()
        }
      })

      return res.status(400).json({
        code: 500,
        msg: '用户名已存在',
        data: null
      })
    }

    const passwordDigest = await hashPassword(password)

    const user = await addUserByAPI(
      name,
      passwordDigest,
      phone,
      nickname ?? '',
      email ?? ''
    )

    logger().info({
      msg: 'User created successfully',
      data: {
        userId: user.id,
        username: user.name,
        phone: user.phone,
        email: user.email,
        nickname: user.nickname,
        createdAt: user.createdAt,
        timestamp: new Date().toISOString()
      }
    })

    return res.json({
      code: 0,
      data: {
        uid: user.id
      },
      msg: '创建成功'
    })

  } catch (err) {
    logger().error({
      msg: 'Failed to create user',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestBody: req.body
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: null
    })
  }
})


// 定义请求参数验证schema
const userEditSchema = z.object({
  uid: z.string().min(1, "用户ID不能为空"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号").optional(),
  email: z.string().email("请输入有效的邮箱").optional(),
  nickname: z.string().optional()
})

// 更新用户信息
userRouter.post('/edit', async (req, res) => {
  try {
    // 验证请求参数
    const result = userEditSchema.safeParse(req.body)
    if (!result.success) {
      logger().error({
        msg: 'Invalid user edit input',
        data: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          })),
          requestBody: req.body
        }
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: {}
      })
    }

    const { uid, phone, email, nickname } = result.data

    logger().info({ msg: 'Attempting to update user info', data: result.data })

    // 更新用户信息
    const updatedUser = await prisma().user.update({
      where: { id: uid },
      data: {
        phone: phone ?? undefined,
        email: email ?? undefined,
        nickname: nickname ?? undefined
      }
    })

    logger().info({
      msg: 'User info updated successfully',
      data: {
        userId: updatedUser.id,
        email: updatedUser.email,
        nickname: updatedUser.nickname
      }
    })

    return res.json({
      code: 0,
      data: {},
      msg: '更新成功'
    })

  } catch (err) {
    logger().error({
      msg: 'Failed to update user info',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestBody: req.body
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: {}
    })
  }
})

// 删除用户
userRouter.post('/delete', async (req, res) => {
  try {
    const deleteSchema = z.object({
      uid: z.string().min(1, "用户ID不能为空"),
    })

    const result = deleteSchema.safeParse(req.body)
    if (!result.success) {
      logger().error({
        msg: 'Invalid delete user input',
        data: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          })),
          requestBody: req.body,
          timestamp: new Date().toISOString()
        }
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: {}
      })
    }

    const { uid } = result.data

    logger().info({ msg: 'Attempting to delete user', data: { uid } })

    const user = await prisma().user.findUnique({
      where: { id: uid }
    })

    if (!user) {
      logger().warn({
        msg: 'User not found for deletion',
        data: {
          uid,
          timestamp: new Date().toISOString()
        }
      })
      return res.status(404).json({
        code: 404,
        msg: '用户不存在',
        data: {}
      })
    }

    // 检查用户是否已登录
    // TODO： 需要根据用户登录流程做清理操作
    const session = await sessionFromCookies(req.cookies)
    const isLoggedInUser = session?.user.id === uid

    // 更新用户名添加删除标记
    const deletedUsername = `${user.name}_deleted*!~!*`

    await prisma().$transaction(async (tx) => {
      // 更新用户名
      await tx.user.update({
        where: { id: uid },
        data: {
          name: deletedUsername,
          // 清除用户的密码，防止重新登录
          passwordDigest: null
        }
      })
    })

    logger().info({
      msg: 'User marked as deleted successfully',
      data: {
        userId: uid,
        originalUsername: user.name,
        deletedUsername,
        wasLoggedIn: isLoggedInUser,
        timestamp: new Date().toISOString()
      }
    })

    // 如果是当前登录用户才清除当前请求的cookie
    if (isLoggedInUser) {
      res.clearCookie('token')
    }

    return res.json({
      code: 0,
      data: {},
      msg: '删除成功'
    })

  } catch (err) {
    logger().error({
      msg: 'Failed to delete user',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestBody: req.body,
        timestamp: new Date().toISOString()
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: {}
    })
  }
})

// 禁用用户
userRouter.post('/disable', async (req, res) => {
  try {
    const disableSchema = z.object({
      uid: z.string().min(1, "用户ID不能为空"),
    })

    const result = disableSchema.safeParse(req.body)
    if (!result.success) {
      logger().error({
        msg: 'Invalid disable user input',
        data: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          })),
          requestBody: req.body,
          timestamp: new Date().toISOString()
        }
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: {}
      })
    }

    const { uid } = result.data

    logger().info({ msg: 'Attempting to disable user', data: { uid } })

    const user = await prisma().user.findUnique({
      where: { id: uid }
    })

    if (!user) {
      logger().warn({
        msg: 'User not found for disable',
        data: {
          uid,
          timestamp: new Date().toISOString()
        }
      })
      return res.status(404).json({
        code: 404,
        msg: '用户不存在',
        data: {}
      })
    }

    // 更新用户状态为禁用
    await prisma().user.update({
      where: { id: uid },
      data: {
        status: 0
      }
    })

    // 清除用户的会话信息
    const session = await sessionFromCookies(req.cookies)
    if (session?.user.id === uid) {
      res.clearCookie('token')
    }

    logger().info({
      msg: 'User disabled successfully',
      data: {
        userId: uid,
        username: user.name,
        timestamp: new Date().toISOString()
      }
    })

    return res.json({
      code: 0,
      data: {},
      msg: '禁用成功'
    })

  } catch (err) {
    logger().error({
      msg: 'Failed to disable user',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestBody: req.body,
        timestamp: new Date().toISOString()
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: {}
    })
  }
})

// 启用用户
userRouter.post('/enable', async (req, res) => {
  try {
    const enableSchema = z.object({
      uid: z.string().min(1, "用户ID不能为空"),
    })

    const result = enableSchema.safeParse(req.body)
    if (!result.success) {
      logger().error({
        msg: 'Invalid enable user input',
        data: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          })),
          requestBody: req.body,
          timestamp: new Date().toISOString()
        }
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: {}
      })
    }

    const { uid } = result.data

    logger().info({ msg: 'Attempting to enable user', data: { uid } })

    const user = await prisma().user.findUnique({
      where: { id: uid }
    })

    if (!user) {
      logger().warn({
        msg: 'User not found for enable',
        data: {
          uid,
          timestamp: new Date().toISOString()
        }
      })
      return res.status(404).json({
        code: 404,
        msg: '用户不存在',
        data: {}
      })
    }

    // 更新用户状态为启用
    await prisma().user.update({
      where: { id: uid },
      data: {
        status: 1
      }
    })

    logger().info({
      msg: 'User enabled successfully',
      data: {
        userId: uid,
        username: user.name,
        timestamp: new Date().toISOString()
      }
    })

    return res.json({
      code: 0,
      data: {},
      msg: '启用成功'
    })

  } catch (err) {
    logger().error({
      msg: 'Failed to enable user',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestBody: req.body,
        timestamp: new Date().toISOString()
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: {}
    })
  }
})

// 重置密码
userRouter.post('/pwd/reset', async (req, res) => {
  try {
    const resetSchema = z.object({
      uid: z.string().min(1, "用户ID不能为空"),
      pwd: z.string().min(6, "密码长度至少6位"),
    })

    const result = resetSchema.safeParse(req.body)
    if (!result.success) {
      logger().error({
        msg: 'Invalid password reset input',
        data: {
          errors: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          })),
          requestBody: req.body,
          timestamp: new Date().toISOString()
        }
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: {}
      })
    }

    const { uid, pwd } = result.data

    logger().info({ msg: 'Attempting to reset user password', data: { uid } })

    const user = await prisma().user.findUnique({
      where: { id: uid }
    })

    if (!user) {
      logger().warn({
        msg: 'User not found for password reset',
        data: {
          uid,
          timestamp: new Date().toISOString()
        }
      })
      return res.status(404).json({
        code: 404,
        msg: '用户不存在',
        data: {}
      })
    }

    const passwordDigest = await hashPassword(pwd)

    await prisma().user.update({
      where: { id: uid },
      data: {
        passwordDigest
      }
    })

    logger().info({
      msg: 'User password reset successfully',
      data: {
        userId: uid,
        timestamp: new Date().toISOString()
      }
    })

    return res.json({
      code: 0,
      data: {},
      msg: '密码重置成功'
    })

  } catch (err) {
    logger().error({
      msg: 'Failed to reset user password',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestBody: req.body,
        timestamp: new Date().toISOString()
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: {}
    })
  }
})

// 获取用户信息
userRouter.get('/profile', authenticationMiddleware, async (req, res) => {
  try {
    logger().info({ 
      msg: 'Attempting to get user profile',
      data: {
        userId: req.session.user.id,
        timestamp: new Date().toISOString()
      }
    })

    const user = await prisma().user.findUnique({
      where: { id: req.session.user.id }
    })

    if (!user) {
      logger().warn({
        msg: 'User not found when getting profile',
        data: {
          userId: req.session.user.id,
          timestamp: new Date().toISOString()
        }
      })
      return res.status(404).json({
        code: 404,
        msg: '用户不存在',
        data: null
      })
    }

    logger().info({
      msg: 'User profile retrieved successfully',
      data: {
        userId: user.id,
        username: user.loginName || user.name,
        email: user.email,
        timestamp: new Date().toISOString()
      }
    })

    return res.json({
      code: 0,
      data: {
        username: user.loginName || user.name,
        role: '数据分析师',
        nickname: user.nickname || '',
        phone: user.phone || '',
        email: user.email || ''
      },
      msg: '获取成功'
    })

  } catch (err) {
    logger().error({
      msg: 'Failed to get user profile',
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        userId: req.session.user.id,
        timestamp: new Date().toISOString()
      }
    })

    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: null
    })
  }
})

export default userRouter