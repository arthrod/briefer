import { Router } from 'express'
import { z } from 'zod'
import { prisma, addUserByAPI } from '@briefer/database'
import { hashPassword } from '../../password.js'
import { logger } from '../../logger.js'

const userRouter = Router({ mergeParams: true })

const userSchema = z.object({
  name: z.string().min(1, "用户名不能为空"),
  password: z.string().min(6, "密码长度至少6位"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  email: z.string().email("请输入有效的邮箱").optional(),
  nickname: z.string().optional()
})

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
        userId: user['id'],
        username: user['name'],
        phone: user['phone'],
        email: user['email'],
        nickname: user['nickname'],
        createdAt: user['createdAt'],
        timestamp: new Date().toISOString()
      }
    })

    return res.json({
      code: 0,
      data: {
        uid: user['id']
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

export default userRouter