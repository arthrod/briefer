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
  isDeleted: true,
}

export async function createUser(
  email: string,
  name: string | null,
  passwordDigest?: string
): Promise<ApiUser> {
  return prisma().user.create({
    data: {
      name: name ?? email,
      loginName: name ?? email,
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
  phone: string | null = null,
  nickname: string | null = null,
  email: string
): Promise<ApiUser> {
  return prisma().$transaction(async (tx) => {
    // 1. 创建用户
    const user = await tx.user.create({
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

    // 2. 创建 WorkspaceSecrets
    const secrets = await tx.workspaceSecrets.create({
      data: {
        openAiApiKey: null,
      },
    })

    // 3. 创建 Workspace
    const workspace = await tx.workspace.create({
      data: {
        name: `${name}'s Workspace`,
        ownerId: user.id,
        secretsId: secrets.id,
        plan: 'free',
        onboardingStep: 'intro',
        assistantModel: 'gpt-4o',
      },
    })

    // 4. 创建 UserWorkspace 关联
    await tx.userWorkspace.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        role: 'admin',
      },
    })

    // 5. 返回完整的用户信息，包括工作区信息
    return {
      ...user,
      workspaces: [
        {
          id: workspace.id,
          name: workspace.name,
          role: 'admin',
          plan: workspace.plan,
          onboardingStep: workspace.onboardingStep,
          assistantModel: workspace.assistantModel,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        },
      ],
    }
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
      isDeleted: false
    },
    select: userSelect,
  })

  return user
}

export async function listWorkspaceUsers(workspaceId: string): Promise<WorkspaceUser[]> {
  const users = await prisma().userWorkspace.findMany({
    where: {
      workspaceId,
      user: {
        isDeleted: false
      }
    },
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
  const user = (await recoverFromNotFound(
    prisma().user.update({
      where: { id: userId, confirmedAt: null },
      data: {
        confirmedAt: new Date(),
      },
      select: userSelect,
    })
  )) as ApiUser | null

  return user
}
