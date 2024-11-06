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
      logger().error('Invalid user input', { 
        errors: result.error.errors,
        requestBody: req.body
      })
      return res.status(400).json({
        code: 400,
        msg: '参数校验失败',
        data: null
      })
    }

    const { name, password, phone, email, nickname } = result.data
    
    logger().info('Attempting to create user', {
      name,
      phone,
      email,
      nickname
    })

    const existingUser = await prisma().user.findFirst({
      where: { name }
    })

    if (existingUser) {
      logger().warn('Username already exists', { 
        existingUsername: name 
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

    logger().info('User created successfully', { 
      userId: user['id'],
      username: user['name'],
      email: user['email']
    })

    return res.json({
      code: 0,
      data: {
        uid: user['id']
      },
      msg: '创建成功'
    })

  } catch (err) {
    logger().error('Failed to create user', { 
      error: err,
      errorMessage: err instanceof Error ? err.message : '未知错误',
      errorStack: err instanceof Error ? err.stack : undefined,
      requestBody: req.body
    })
    
    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: null
    })
  }
})

export default userRouter