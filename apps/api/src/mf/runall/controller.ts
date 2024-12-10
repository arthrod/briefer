import { Request, Response } from 'express'
import { CONFIG } from './constants.js'
import { fetchWithTimeout } from '../chat/utils/fetch.js'
import { sendResponse, success, fail, handleError } from '../../utils/response.js'
export class RunAllController {
  async getRunAllList(req: Request, res: Response) {
    const reqJson = req.body
    try {
      const jobsRes = await fetchWithTimeout(
        `${CONFIG.RUN_ALL_URL}${CONFIG.ENDPOINTS.LIST}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            identity: reqJson.documentId,
            page: reqJson.pageNum,
            pageSize: reqJson.pageSize,
            sValue: reqJson.keyword,
          }),
        },
        5000
      )
      const result = await jobsRes.json()
      sendResponse(res, success({ result }))
    } catch (e) {
      sendResponse(res, handleError(500, '获取全量运行列表失败'))
    }
  }
  async createRunAll(req: Request, res: Response) {

  }
  async queryStatus(req: Request, res: Response) {

  }
  async approve(req: Request, res: Response) {
    const reqJson = req.body
    try {
      const jobsRes = await fetchWithTimeout(
        `${CONFIG.RUN_ALL_URL}${CONFIG.ENDPOINTS.APPROVE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: reqJson.id,
          }),
        },
        5000
      )
      const result = await jobsRes.json()
      sendResponse(res, success({ result }))
    } catch (e) {
      sendResponse(res, handleError(500, '获取全量运行列表失败'))
    }
  }
  async stop(req: Request, res: Response) {

  }
}

export const runAllController = new RunAllController()
