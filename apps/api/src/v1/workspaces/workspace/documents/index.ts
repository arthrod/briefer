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
 * Initializes an Express router with routes for managing documents within a workspace.
 *
 * This router provides the following endpoints:
 * - POST '/' to create or update a document:
 *   - Validates the request body using a zod schema to ensure that the payload contains:
 *     - `id` (optional): A string identifier for the document.
 *     - `parentId` (optional): A nullable UUID that serves as the parent document's identifier.
 *     - `version` (optional): A number indicating the document version.
 *   - If the payload is invalid, it responds with a 400 status code.
 *   - Initiates a database transaction using Prisma to either insert or update the document.
 *   - Sends a 201 status code if a new document is created, or a 200 status code otherwise.
 *   - Logs any errors and returns a 500 status code in case of failure.
 *
 * - GET '/' to retrieve a list of documents for a workspace:
 *   - Extracts the `workspaceId` from the request parameters.
 *   - Retrieves documents using the `listDocuments` function and returns them as JSON.
 *
 * Additionally, a nested router is mounted on the '/:documentId' path with the `belongsToWorkspace`
 * middleware. This middleware:
 * - Extracts and validates `workspaceId` and `documentId` from the request.
 * - Ensures that the document exists and belongs to the specified workspace.
 * - Returns appropriate HTTP status codes (400 for invalid IDs, 404 if not found, 403 for unauthorized access)
 *   before proceeding to route handling.
 *
 * @param socketServer - An instance of IOServer for WebSocket communication.
 * @returns An Express router configured with endpoints and middleware for document management.
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
