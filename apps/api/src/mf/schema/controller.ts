import { Request, Response } from 'express'
import { handleError, sendResponse, success } from '../../utils/response.js'
import { fetchWithTimeout } from '../chat/utils/fetch.js'
import { CONFIG } from './constants.js'

export class SchemaController {
  async getSchemaList(req: Request, res: Response) {
    if (CONFIG.IS_MOCK) {
      return sendResponse(
        res,
        success({
          list: [
            {
              id: 1,
              name: '用电表信息表',
              tableName: 'TB_WIC_XYDET',
              dataSource: 'string',
              rowNum: 150000,
              colNum: 400,
              des: '这是一段关于数据表的描述，超过1行就不展示了这是一段关于数据表的描述，超过1行就不展示了'
            }
          ],
        })
      )
    }
    const reqJson = req.body
    try {
      const jobsRes = await fetchWithTimeout(
        `${CONFIG.MANAGER_URL}${CONFIG.ENDPOINTS.LIST}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
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
      sendResponse(res, handleError(500, '获取数据目录失败'))
    }
  }

  async getTableColumns(req: Request, res: Response) {
    if (CONFIG.IS_MOCK) {
      return sendResponse(
        res,
        success({
          list: [
            {
              id: 1,
              name: 'id',
              type: 'bigint',
              comment: '主键ID',
              isPrimary: true
            },
            {
              id: 2,
              name: 'meter_no',
              type: 'varchar(50)',
              comment: '电表编号',
              isPrimary: false
            },
            {
              id: 3,
              name: 'created_at',
              type: 'timestamp',
              comment: '创建时间',
              isPrimary: false
            }
          ]
        })
      )
    }

    const { tableId } = req.body
    if (!tableId) {
      return sendResponse(res, handleError(400, '缺少必要参数: tableId'))
    }

    try {
      const columnsRes = await fetchWithTimeout(
        `${CONFIG.MANAGER_URL}${CONFIG.ENDPOINTS.COLUMNS}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tableId
          }),
        },
        5000
      )
      const result = await columnsRes.json()
      sendResponse(res, success(result))
    } catch (e) {
      sendResponse(res, handleError(500, '获取表字段信息失败'))
    }
  }
}

export const schemaController = new SchemaController()
