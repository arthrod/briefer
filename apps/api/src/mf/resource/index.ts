import { Router, Request, Response, NextFunction } from 'express'
import axios from 'axios'
import { logger } from '../../logger.js'


const router = Router({ mergeParams: true })

// 从环境变量获取URL
const HUB_URL = process.env['HUB_URL'] || 'http://localhost:8040'
const handleError = (err: unknown, req: Request, res: Response, operation: string) => {
    logger().error({
      msg: `Failed to ${operation}`,
      data: {
        error: err,
        errorMessage: err instanceof Error ? err.message : '未知错误',
        errorStack: err instanceof Error ? err.stack : undefined,
        requestData: req.body || req.query,
        userId: req.session?.user?.id,
      },
    })
  
    return res.status(500).json({
      code: 500,
      msg: '服务器内部错误',
      data: null,
    })
  }
// 创建start接口
router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 从请求体获取参数
    
    const chatId=req.body.chatId
    const reqData = {
        "identity": chatId,         // 定义为chatId键值对
        "imageId": process.env['imageId'],
        "specsId": process.env['specsId'],
        "gitUser": process.env['gitUser'],
        "gitAuth": process.env['gitAuth'],
        "endpointUrl": process.env['endpointUrl'],
        "accessKey": process.env['accessKey'],
        "secretKey": process.env['secretKey'],
        
      };
    
    // 发送POST请求到目标URL，并传入参数
    const response = await axios.post(`${HUB_URL}/ide/hub/start`, reqData, {
        headers: {
          'Content-Type': 'application/json'  // 显式指定发送JSON格式
        }
      });
    
    // 解析响应数据并检查状态码
    const responseData = response.data
    if (responseData.code === 0) {
        return res.json({
            code: 0,
            data: {
                status: responseData.data.status,
            },
            msg: '成功',
        })
    } else {
        return res.json({
            code: -1,
            data: {
            },
            msg: '启动失败',
        })
    }
  } catch (error) {
    return handleError(error, req, res, '启动失败')
  }
})

// 创建stop接口
router.post('/stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 从请求体获取参数
    const chatId = req.body.chatId
    const reqData = {
        "identity": chatId,         // 定义为chatId键值对
        
      };
    
    // 发送停止请求到目标URL，并传入参数
    const response = await axios.post(`${HUB_URL}/ide/hub/stop`, reqData, {
        headers: {
          'Content-Type': 'application/json'  // 显式指定发送JSON格式
        }
      });
    
    // 解析响应数据并检查状态码
    const responseData = response.data
    if (responseData.code === 0) {
        return res.json({
            code: 0,
            data: {
            },
            msg: '成功',
        })
    } else {
        return res.json({
            code: -1,
            data: {
            },
            msg: '停止失败',
        })
    }
  } catch (error) {
    return handleError(error, req, res, '停止失败')
  }
})


export default router