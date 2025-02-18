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
 * Creates and configures an Express router for handling document-related operations within a workspace.
 *
 * This router sets up endpoints for:
 * - Creating or updating a document via POST '/' where the request body is validated with a Zod schema.
 *   A database transaction is used to upsert the document with Prisma. If a new document is created,
 *   the response is marked with a 201 status code.
 * - Retrieving a list of documents via GET '/' for the specified workspace.
 *
 * It also defines a middleware, `belongsToWorkspace`, that:
 * - Validates the workspaceId and documentId using a UUID schema.
 * - Ensures the document exists and belongs to the provided workspace (responding with 400, 404, or 403 on failure).
 *
 * Additionally, routes containing a documentId are delegated to a nested router, which receives the provided
 * IOServer instance for WebSocket communication.
 *
 * @param socketServer - The IOServer instance used for WebSocket communications in nested document routes.
 * @returns The configured Express router handling workspace document operations.
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
