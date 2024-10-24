import { Router } from 'express'
import { getWorkspacesForUser } from '@briefer/database'
import { validate } from 'uuid'
import { IOServer } from '../../websocket/index.js'
import { getChatList } from '@briefer/database'
export default function chatRouter() {
  const router = Router({ mergeParams: true })

  router.use('/list', async (req, res) => {
    res.json(getChatList())
  })

//   router.use(
//     '/:workspaceId',
//     async (req, res, next) => {
//       const workspaceId = req.params['workspaceId']?.toString()

//       if (!workspaceId) {
//         throw new Error('Expected to find workspaceId in query params')
//       }

//       if (!validate(workspaceId)) {
//         res.status(404).end()
//         return
//       }

//       const isAuthorized = req.session.userWorkspaces[workspaceId] !== undefined
//       if (!isAuthorized) {
//         res.status(403).end()
//         return
//       }

//       next()
//     },
//     workspaceRouter(socketServer)
//   )

  return router
}
