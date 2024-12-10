import { UserWorkspaceRole } from "@briefer/database";

export function getMockSession() {
  const userId = 'test-user-id-123';
  return {
    user: {
      id: userId,
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
    userWorkspaces: {
      default: {
        workspaceId: '54f713cb-ba98-41f2-a3a1-7779762e33ac',
        userId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        inviterId: null,
        role: UserWorkspaceRole.admin,
      },
    },
  }
}
