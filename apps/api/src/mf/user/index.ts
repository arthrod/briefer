import { Router } from 'express'
import { z } from 'zod'
import { prisma, addUserByAPI } from '@briefer/database'
import { hashPassword } from '../../password.js'
import { Logger } from '../../utils/logger.js'
import { ErrorCode } from '../../constants/errorcode.js'
import { success, fail, handleZodError, handleError, sendResponse } from '../../utils/response.js'
import { sessionFromCookies, authenticationMiddleware } from '../../auth/token.js'

const userRouter = Router({ mergeParams: true })

const DEFAULT_EMAIL_DOMAIN = 'mindflow.ai'

const emptyStringToUndefined = (value: unknown) => 
  value === '' || value === null ? undefined : value

// Schema 定义
const userSchema = z.object({
  name: z.string().min(1, "用户名不能为空"),
  password: z.string().min(6, "密码长度至少6位"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
  email: z.preprocess(
    emptyStringToUndefined,
    z.string().email("请输入有效的邮箱").optional()
  ),
  nickname: z.string().optional()
})

const userEditSchema = z.object({
  uid: z.string().min(1, "用户ID不能为空"),
  phone: z.preprocess(
    emptyStringToUndefined,
    z.union([
      z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号"),
      z.null()
    ]).optional()
  ),
  email: z.preprocess(
    emptyStringToUndefined,
    z.union([
      z.string().email("请输入有效的邮箱"),
      z.null()
    ]).optional()
  ),
  nickname: z.string().optional().nullable()
})

const uidSchema = z.object({
  uid: z.string().min(1, "用户ID不能为空")
})

const resetPwdSchema = z.object({
  uid: z.string().min(1, "用户ID不能为空"),
  pwd: z.string().min(6, "密码长度至少6位")
})

// 创建用户
userRouter.post('/add', async (req, res) => {
  try {
    const result = userSchema.safeParse(req.body)
    if (!result.success) {
      return sendResponse(res, handleZodError(result.error))
    }

    const { name, password, phone, email, nickname } = result.data
    Logger.info('尝试创建用户', { name, email, phone })

    const existingUser = await prisma().user.findFirst({ 
      where: { 
        name,
        isDeleted: false 
      } 
    })
    if (existingUser) {
      Logger.warn('用户名已存在', { name })
      return sendResponse(res, fail(ErrorCode.USER_EXISTS, '用户名已存在'))
    }

    const passwordDigest = await hashPassword(password)
    const defaultEmail = `${name}@${DEFAULT_EMAIL_DOMAIN}`
    const user = await addUserByAPI(name, passwordDigest, phone, nickname ?? '', email ?? defaultEmail)

    Logger.info('用户创建成功', { userId: user.id })
    return sendResponse(res, success({ uid: user.id }, '创建成功'))
  } catch (err) {
    return sendResponse(res, handleError(err, '创建用户失败'))
  }
})

// 更新用户信息
userRouter.post('/edit', async (req, res) => {
  try {
    const result = userEditSchema.safeParse(req.body)
    if (!result.success) {
      return sendResponse(res, handleZodError(result.error))
    }

    const { uid, phone, email, nickname } = result.data
    Logger.info('尝试更新用户信息', { uid, phone, email, nickname })

    const updateData: any = {}
    if (phone !== undefined) updateData.phone = phone
    if (email !== undefined) updateData.email = email
    if (nickname !== undefined) updateData.nickname = nickname

    const updatedUser = await prisma().user.update({
      where: { 
        id: uid,
        isDeleted: false 
      },
      data: updateData
    })

    Logger.info('用户信息更新成功', { userId: updatedUser.id })
    return sendResponse(res, success({}, '更新成功'))
  } catch (err) {
    return sendResponse(res, handleError(err, '更新用户信息失败'))
  }
})

// 删除用户
userRouter.post('/delete', async (req, res) => {
  try {
    const result = uidSchema.safeParse(req.body)
    if (!result.success) {
      return sendResponse(res, handleZodError(result.error))
    }

    const { uid } = result.data
    Logger.info('尝试删除用户', { uid })

    const user = await prisma().user.findUnique({ where: { id: uid } })
    if (!user) {
      Logger.warn('用户不存在', { uid })
      return sendResponse(res, fail(ErrorCode.USER_NOT_EXISTS, '用户不存在'))
    }

    const session = await sessionFromCookies(req.cookies)
    const isLoggedInUser = session?.user.id === uid

    await prisma().user.update({
      where: { id: uid },
      data: {
        isDeleted: true,
        passwordDigest: null
      }
    })

    Logger.info('用户删除成功', {
      userId: uid,
      username: user.name,
      wasLoggedIn: isLoggedInUser
    })

    if (isLoggedInUser) {
      res.clearCookie('token')
    }

    return sendResponse(res, success({}, '删除成功'))
  } catch (err) {
    return sendResponse(res, handleError(err, '删除用户失败'))
  }
})

// 禁用用户
userRouter.post('/disable', async (req, res) => {
  try {
    const result = uidSchema.safeParse(req.body)
    if (!result.success) {
      return sendResponse(res, handleZodError(result.error))
    }

    const { uid } = result.data
    Logger.info('尝试禁用用户', { uid })

    const user = await prisma().user.findUnique({ 
      where: { 
        id: uid,
        isDeleted: false 
      } 
    })
    if (!user) {
      Logger.warn('用户不存在', { uid })
      return sendResponse(res, fail(ErrorCode.USER_NOT_EXISTS, '用户不存在'))
    }

    await prisma().user.update({
      where: { id: uid },
      data: { status: 0 }
    })

    const session = await sessionFromCookies(req.cookies)
    if (session?.user.id === uid) {
      res.clearCookie('token')
    }

    Logger.info('用户禁用成功', { userId: uid, username: user.name })
    return sendResponse(res, success({}, '禁用成功'))
  } catch (err) {
    return sendResponse(res, handleError(err, '禁用用户失败'))
  }
})

// 启用用户
userRouter.post('/enable', async (req, res) => {
  try {
    const result = uidSchema.safeParse(req.body)
    if (!result.success) {
      return sendResponse(res, handleZodError(result.error))
    }

    const { uid } = result.data
    Logger.info('尝试启用用户', { uid })

    const user = await prisma().user.findUnique({ 
      where: { 
        id: uid,
        isDeleted: false 
      } 
    })
    if (!user) {
      Logger.warn('用户不存在', { uid })
      return sendResponse(res, fail(ErrorCode.USER_NOT_EXISTS, '用户不存在'))
    }

    await prisma().user.update({
      where: { id: uid },
      data: { status: 1 }
    })

    Logger.info('用户启用成功', { userId: uid, username: user.name })
    return sendResponse(res, success({}, '启用成功'))
  } catch (err) {
    return sendResponse(res, handleError(err, '启用用户失败'))
  }
})

// 重置密码
userRouter.post('/pwd/reset', async (req, res) => {
  try {
    const result = resetPwdSchema.safeParse(req.body)
    if (!result.success) {
      return sendResponse(res, handleZodError(result.error))
    }

    const { uid, pwd } = result.data
    Logger.info('尝试重置用户密码', { uid })

    const user = await prisma().user.findUnique({ 
      where: { 
        id: uid,
        isDeleted: false 
      } 
    })
    if (!user) {
      Logger.warn('用户不存在', { uid })
      return sendResponse(res, fail(ErrorCode.USER_NOT_EXISTS, '用户不存在'))
    }

    const passwordDigest = await hashPassword(pwd)
    await prisma().user.update({
      where: { id: uid },
      data: { passwordDigest }
    })

    Logger.info('用户密码重置成功', { userId: uid })
    return sendResponse(res, success({}, '密码重置成功'))
  } catch (err) {
    return sendResponse(res, handleError(err, '重置密码失败'))
  }
})

// 获取用户信息
userRouter.get('/profile', authenticationMiddleware, async (req, res) => {
  try {
    Logger.info('尝试获取用户信息', { userId: req.session.user.id })

    const user = await prisma().user.findUnique({
      where: { 
        id: req.session.user.id,
        isDeleted: false 
      }
    })

    if (!user) {
      Logger.warn('用户不存在', { userId: req.session.user.id })
      return sendResponse(res, fail(ErrorCode.USER_NOT_EXISTS, '用户不存在'))
    }

    Logger.info('获取用户信息成功', {
      userId: user.id,
      username: user.loginName || user.name
    })

    return sendResponse(res, success({
      username: user.loginName || user.name,
      role: '数据分析师',
      nickname: user.nickname || '',
      phone: user.phone || '',
      email: user.email || ''
    }, '获取成功'))
  } catch (err) {
    return sendResponse(res, handleError(err, '获取用户信息失败'))
  }
})

export default userRouter