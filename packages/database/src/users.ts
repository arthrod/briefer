import prisma, { recoverFromNotFound } from './index.js'
import { User, UserWorkspaceRole } from '@prisma/client'

export type ApiUser = Omit<User, 'passwordDigest' | 'confirmedAt'>

export type WorkspaceUser = ApiUser & {
  workspaceId: string
  role: UserWorkspaceRole
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  loginName: true,
  phone: true,
  nickname: true,
  status: true,
  picture: true,
  createdAt: true,
  updatedAt: true,
}

export async function createUser(
  email: string,
  name: string | null,
  passwordDigest?: string
): Promise<ApiUser> {
  return prisma().user.create({
    data: {
      name: name ?? email,
      email,
      passwordDigest,
      status: 1,
    },
    select: userSelect,
  })
}

export async function addUserByAPI(
  name: string,
  passwordDigest: string,
  phone: string | null = null,    // 改为 null 作为默认值
  nickname: string | null = null,  // 改为 null 作为默认值
  email: string,                  // 移除可选标记，使其成为必需参数
): Promise<ApiUser> {
  return prisma().user.create({
    data: {
      name,
      loginName: name,
      email,
      passwordDigest,
      phone,
      nickname,
      status: 1,
    },
    select: userSelect,
  })
}

export async function getUserById(id: string): Promise<ApiUser | null> {
  const user = await prisma().user.findUnique({
    where: {
      id,
    },
    select: userSelect,
  })

  return user
}

export async function getUserByEmail(email: string): Promise<ApiUser | null> {
  const user = await prisma().user.findFirst({
    where: {
      email,
    },
    select: userSelect,
  })

  return user
}

export async function listWorkspaceUsers(
  workspaceId: string
): Promise<WorkspaceUser[]> {
  const users = await prisma().userWorkspace.findMany({
    where: { workspaceId },
    select: {
      user: {
        select: userSelect,
      },
      role: true,
    },
  })

  return users.map((userWorkspace: { user: ApiUser; role: UserWorkspaceRole }) => ({
    ...userWorkspace.user,
    role: userWorkspace.role,
    workspaceId,
  }))
}

export async function addUserToWorkspace(
  userId: string,
  workspaceId: string,
  role: UserWorkspaceRole
): Promise<WorkspaceUser | null> {
  const userWorkspace = await prisma().userWorkspace.create({
    data: {
      userId,
      workspaceId,
      role,
    },
    select: {
      user: {
        select: userSelect,
      },
    },
  })

  return {
    ...userWorkspace.user,
    role,
    workspaceId,
  }
}

export async function deleteUserFromWorkspace(
  userId: string,
  workspaceId: string
): Promise<WorkspaceUser | null> {
  const userWorkspace = await prisma().userWorkspace.delete({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
    select: {
      user: {
        select: userSelect,
      },
      role: true,
    },
  })

  return {
    ...userWorkspace.user,
    workspaceId,
    role: userWorkspace.role,
  }
}

export async function confirmUser(userId: string): Promise<ApiUser | null> {
  const user = await recoverFromNotFound(
    prisma().user.update({
      where: { id: userId, confirmedAt: null },
      data: {
        confirmedAt: new Date(),
      },
      select: userSelect,
    })
  ) as ApiUser | null

  return user
}
