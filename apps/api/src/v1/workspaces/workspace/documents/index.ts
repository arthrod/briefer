import { prisma, getDocument, listDocuments, ApiDocument, toApiDocument } from '@briefer/database'
import { NextFunction, Router, Request, Response } from 'express'
import { getParam } from '../../../../utils/express.js'
import documentRouter from './document/index.js'
import { validate } from 'uuid'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { uuidSchema } from '@briefer/types'
import { IOServer } from '../../../../websocket/index.js'
import { upsertDocument } from '../../../../document-tree.js'
import { canUpdateWorkspace } from '../../../../auth/token.js'

/**
 * Creates and returns an Express router configured with document management routes for a workspace.
 *
 * This router handles document creation/updating via a POST request to the '/' endpoint and retrieval of
 * documents via a GET request to the same endpoint. The POST route uses Zod to validate the request body and
 * starts a transaction to create or update a document, returning a 201 status code upon successful creation.
 * If validation fails or an error occurs during the transaction, appropriate HTTP status codes (400 or 500) are sent.
 *
 * The router also sets up a middleware, `belongsToWorkspace`, which verifies that the document exists and belongs
 * to the specified workspace by validating both the workspace and document UUIDs. If the check fails, the request is
 * terminated with a 400, 403, or 404 response. Validated requests are then forwarded to nested document routes.
 *
 * @param socketServer - An instance of the WebSocket server used for real-time communication.
 * @returns An Express router configured with routes for creating, updating, retrieving, and managing documents.
 *
 * @example
 * const router = documentsRouter(socketServer);
 * app.use('/workspaces/:workspaceId/documents', router);
 */
export default function documentsRouter(socketServer: IOServer) {
  const router = Router({ mergeParams: true })

  router.post('/', canUpdateWorkspace, async (req: any, res: Response<ApiDocument>) => {
    const payload = z
      .object({
        id: z.string().optional(),
        parentId: uuidSchema.nullable().optional().default(null),
        version: z.number().optional(),
      })
      .safeParse(req.body)
    if (!payload.success) {
      res.status(400).end()
      return
    }

    const data = payload.data

    const workspaceId = getParam(req, 'workspaceId')

    let status = 500
    try {
      const document = await prisma().$transaction(
        async (tx) => {
          const result = await upsertDocument(
            data.id ?? uuidv4(),
            '',
            workspaceId,
            data.parentId,
            -1,
            data.version ?? 1,
            tx
          )

          if (!result) {
            throw new Error('Failed to create document')
          }

          if (result.created) {
            res.status(201)
          }

          return result.document
        },
        {
          maxWait: 11000,
          timeout: 10000,
        }
      )

      res.json(await toApiDocument(document))
    } catch (err) {
      if (status !== 500) {
        res.status(status).end()
        return
      }

      req.log.error({ err, workspaceId }, 'Failed to create document')
      res.status(500).end()
    }
  })

  router.get('/', async (req, res: Response<ApiDocument[]>) => {
    const workspaceId = getParam(req, 'workspaceId')
    const docs = await listDocuments(workspaceId)
    res.json(docs)
  })

  async function belongsToWorkspace(req: Request, res: Response, next: NextFunction) {
    const workspaceId = getParam(req, 'workspaceId')
    const documentId = getParam(req, 'documentId')

    if (!validate(documentId) || !validate(workspaceId)) {
      res.status(400).end()
      return
    }

    const document = await getDocument(documentId)
    if (!document) {
      res.status(404).end()
      return
    }

    if (document.workspaceId !== workspaceId) {
      res.status(403).end()
      return
    }

    next()
  }

  router.use('/:documentId', belongsToWorkspace, documentRouter(socketServer))

  return router
}
