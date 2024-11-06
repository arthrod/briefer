import {
  ApiUser,
  prisma,
  PrismaTransaction,
  UserWorkspaceRole,
  ApiWorkspace,
  createWorkspace as prismaCreateWorkspace,
} from '@briefer/database'
import { IOServer } from '../websocket/index.js'
import { WorkspaceCreateInput } from '@briefer/types'

export interface IWorkspaceCreator {
  createWorkspace(
    owner: ApiUser,
    input: WorkspaceCreateInput,
    socketServer: IOServer,
    tx?: PrismaTransaction
  ): Promise<{ workspace: ApiWorkspace }>
}

export class WorkspaceCreator implements IWorkspaceCreator {
  public async createWorkspace(
    owner: ApiUser,
    input: WorkspaceCreateInput,
    _socketServer: IOServer,
    tx?: PrismaTransaction
  ): Promise<{ workspace: ApiWorkspace }> {
    const run = async (tx: PrismaTransaction) => {
      const workspace = await prismaCreateWorkspace(input, owner['id'], tx)

      let userWorkspaceAssociations = [
        {
          userId: owner['id'],
          workspaceId: workspace.id,
          role: 'admin' as UserWorkspaceRole,
        },
      ]

      await tx["userWorkspace"].createMany({
        data: userWorkspaceAssociations,
        skipDuplicates: true,
      })

      return { workspace }
    }

    const workspace = tx ? await run(tx) : await prisma().$transaction(run)

    return workspace
  }
}

let instance: IWorkspaceCreator | null
export async function createWorkspace(
  owner: ApiUser,
  input: WorkspaceCreateInput,
  socketServer: IOServer,
  tx: PrismaTransaction
): Promise<ApiWorkspace> {
  if (instance) {
    return (await instance.createWorkspace(owner, input, socketServer, tx))
      .workspace
  }

  instance = new WorkspaceCreator()
  return (await instance.createWorkspace(owner, input, socketServer, tx))
    .workspace
}
