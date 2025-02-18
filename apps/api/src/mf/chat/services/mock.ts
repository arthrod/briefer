import { UserWorkspaceRole } from "@briefer/database";

/**
 * Generates and returns a mock session object for testing purposes.
 *
 * The returned object includes:
 * - A `user` object that provides hardcoded test user details such as:
 *   - `id`: Test user identifier
 *   - `status`: User status (set to 1)
 *   - `name` and `loginName`: The test user's name
 *   - `email`: The test user's email address
 *   - `picture`, `phone`, and `nickname`: Currently empty strings
 *   - `createdAt` and `updatedAt`: Set to the current date at the time of function invocation
 *   - `isDeleted`: Indicates if the user is deleted (set to false)
 * - A `userWorkspaces` object with a default workspace that contains:
 *   - `workspaceId`: Identifier for the workspace
 *   - `userId`: The test user's identifier
 *   - `createdAt` and `updatedAt`: Set to the current date at the time of function invocation
 *   - `inviterId`: Currently set to null
 *   - `role`: The user's role in the workspace, set to admin
 *
 * @returns The mock session object containing user and workspace information.
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
