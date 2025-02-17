import { UserWorkspaceRole } from "@briefer/database";

/**
 * Generates a mock session object for testing purposes.
 *
 * This function returns a hard-coded session object that mimics a user session, including user details and associated workspace information.
 * The user object contains attributes such as id, status, name, loginName, email, picture, phone, nickname, createdAt, updatedAt, and isDeleted.
 * The userWorkspaces object comprises a default workspace with its own attributes including workspaceId, userId, createdAt, updatedAt, inviterId, and role,
 * where the role is set to admin.
 *
 * @returns A mock session object containing a user and their associated workspace details.
 */
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
