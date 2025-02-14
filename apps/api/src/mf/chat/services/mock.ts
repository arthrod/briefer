import { UserWorkspaceRole } from "@briefer/database";

/**
 * Generates a mock session object for testing purposes.
 *
 * This function constructs a mock user session object containing predefined user details and workspace information.
 * The returned object includes:
 * - A `user` object with a static user ID, status, name, login name, email, empty fields for picture, phone, and nickname,
 *   and timestamps for creation and update.
 * - A `userWorkspaces` object with a `default` workspace that contains a hardcoded workspace ID, the same user ID,
 *   timestamps, a null inviter ID, and an admin role.
 *
 * @returns A mock session object with user details and a default user workspace for testing.
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
