import {
  cutNotebook,
  convertYjsDocumentToNotebook,
  saveNotebookToOSS,
} from './convertToNotebook.js'
import { prisma } from '@briefer/database'
import * as Y from 'yjs'
import { PythonBlock, Block, YBlock, YBlockGroup } from '@briefer/editor'
import { join } from 'path'
import { getYDocForUpdate } from '../index.js'

/**
 * Prepares the specified notebook cell for execution.
 *
 * This asynchronous function converts a Yjs document (represented by `blocks` and `layout`) into a standard notebook format.
 * It validates that a valid `currentBlockId` is provided, extracts the relevant cell from the notebook, and performs the following:
 * - Retrieves the chat document relation for the given `documentId` from the database.
 * - Constructs an OSS (Object Storage Service) path and saves the extracted notebook segment.
 * - Retrieves the user workspace associated with the provided `workspaceId`.
 * - Generates and returns a Python code string that includes instructions for executing the cell.
 *
 * @param documentId - The identifier of the Yjs document containing the notebook structure.
 * @param workspaceId - The identifier of the user workspace.
 * @param currentBlockId - The identifier of the notebook cell to be executed.
 * @param blocks - A Yjs Map containing the notebook blocks.
 * @param layout - A Yjs Array representing the layout of notebook block groups.
 *
 * @returns A Python code string that contains instructions and logic to execute the specified notebook cell.
 *
 * @throws Error if:
 * - `currentBlockId` is not provided.
 * - No chat document relation matching the provided `documentId` is found.
 * - No user workspace associated with the provided `workspaceId` is found.
 */
export async function run_cell_pre(
  documentId: string,
  workspaceId: string,
  currentBlockId: string,
  blocks: Y.Map<YBlock>,
  layout: Y.Array<YBlockGroup>
) {
  const notebook = convertYjsDocumentToNotebook(blocks, layout)
  if (!currentBlockId) {
    throw new Error('block id is null!')
  }
  const run_notebook = cutNotebook(notebook, currentBlockId)

  const relation = await prisma().chatDocumentRelation.findFirst({
    where: { documentId: documentId },
  })
  if (!relation) {
    throw new Error('未找到指定关联对话')
  }
  const chatId = relation.chatId
  const ossPath = join('chat/', chatId, '/', currentBlockId)
  const notebookUrl = await saveNotebookToOSS(run_notebook, ossPath)
  const userWorkspace = await prisma().userWorkspace.findFirst({
    where: { workspaceId: workspaceId },
  })
  if (!userWorkspace) {
    throw new Error('未找到指定用户')
  }
  const code = run_cell_request_code(chatId, currentBlockId, userWorkspace.userId)
  return code
}

/**
 * Generates a Python script for executing a notebook cell.
 *
 * This function constructs and returns a multi-line Python code string that includes
 * necessary configurations for HTTP requests and Redis connections. The generated script
 * defines helper functions for job creation, success notification, and status polling:
 *
 * - `create_job()`: Sends a POST request to create a job for running the notebook cell.
 * - `push_success(job_id)`: Sends a POST request to notify the system of a successful job creation.
 * - `get_job_status(job_id)`: Polls the job status and, upon completion, retrieves and displays image outputs from Redis.
 *
 * The script dynamically incorporates environment variables (MANAGER_URL, REDIS_HOST, REDIS_PORT, REDIS_PWD)
 * and constructs Redis keys and API endpoints based on the supplied `chatId` and `cellId`.
 *
 * @param chatId - The unique identifier for the chat or experiment.
 * @param cellId - The identifier for the notebook cell to execute.
 * @param userId - The user identifier used in HTTP request headers for authorization.
 * @returns A string containing the complete Python code to execute the specified notebook cell.
 *
 * @example
 * const pythonCode = run_cell_request_code("chat123", "cell456", "user789");
 * // The returned Python code can be executed in a Python environment to run the notebook cell.
 */
export function run_cell_request_code(chatId: string, cellId: string, userId: string) {
  const code = `
import time
import requests
import redis
import json
import javaobj.v2 as javaobj  # 使用 javaobj-py3 库
import base64
from IPython.display import display, Image
from io import BytesIO

# HTTP 请求的目标 URL 和 Redis 服务器配置
HTTP_URL = "${process.env['MANAGER_URL']}" # 替换为实际的 HTTP 请求 URL
REDIS_HOST = "${process.env['REDIS_HOST']}"  # Redis 服务器地址
REDIS_PORT = ${process.env['REDIS_PORT']}         # Redis 端口
REDIS_KEY = "EXP_RUN_CELL_RESULT:${chatId}:${cellId}"  # Redis 中的状态存储 Key
REDIS_PASSWORD="${process.env['REDIS_PWD']}"
try:
    redis_client
except NameError:
    redis_client = None
if not redis_client:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        db=0
    )
# 轮询间隔时间（秒）
POLL_INTERVAL = 5

def create_job():

    request_data = {
        "experimentId":'${chatId}',
        "versionName":"${Date.now()}",
        "remark":'',
        "cellId":'${cellId}'
    }

    headers = {
        'mf-nodejs-user-id': '${userId}'
    }
    """
    发送 HTTP 请求并返回响应数据。
    """
    try:
        response = requests.post(HTTP_URL + '/api/nodejs/run-all/create-version', headers=headers,
                                 json=request_data)  # 发送 POST 请求
        response.raise_for_status()  # 检查 HTTP 状态码是否为 200
        result = response.json()
        if result['code'] == 0:
            return result['data']['jobId']
        else:
            raise Exception(result['msg'])
    except requests.exceptions.RequestException as e:
        print("HTTP 请求失败:", e)
        raise Exception('创建失败')

def push_success(job_id: str):
    request_data = {
        "jobId": job_id,
        "notebookPath": 'chat/${chatId}/${cellId}'
    }
    headers = {
        'mf-nodejs-user-id': '${userId}'
    }
    try:
        response = requests.post(HTTP_URL + '/api/nodejs/run-all/push-success', headers=headers,
                                 json=request_data)  # 发送 POST 请求
        response.raise_for_status()  # 检查 HTTP 状态码是否为 200
        result = response.json()
        if result['code'] == 0:
            return result['data']['jobId']
        else:
            raise Exception(result['msg'])
    except requests.exceptions.RequestException as e:
        print("HTTP 请求失败:", e)
        raise Exception('推送失败')
    
def get_job_status(job_id: str):
    request_data = {
        "ids": [job_id]
    }
    headers = {
        'mf-nodejs-user-id': '${userId}'
    }
    is_running = True
    while is_running:
        try:
            response = requests.post(HTTP_URL + '/api/nodejs/experiment/run-all/job-status', headers=headers,
                                     json=request_data)  # 发送 POST 请求
            response.raise_for_status()  # 检查 HTTP 状态码是否为 200
            result = response.json()
            if result['code'] == 0:
                list = result['data']['list']
                if len(list) > 0:
                    status = list[0]['runStatus']
                    if status == 2:
                         # 测试连接
                        redis_client.ping()

                        # 获取 Redis 数据
                        outputs = redis_client.get(REDIS_KEY)
                        
                        if outputs:
                            obj = javaobj.loads(outputs)
                            if hasattr(obj, 'outputs'):
                                outputs_value = obj.outputs  # 假设 obj.outputs 是你需要的字段
                                for index, value in enumerate(outputs_value):
                                    str_value=str(value)
                                    value_obj=json.loads(str_value)
                                    img_data = value_obj['data']['image/png']
                                    img_bytes = base64.b64decode(img_data)

                                    # 将字节数据转换为图像
                                    img = Image(data=img_bytes)

                                    # 显示图像
                                    display(img)
                            else:
                                print("No 'outputs' field found in the deserialized object.")

                            return outputs
                        else:
                            return
                    elif status == 3:
                        is_running = False
            time.sleep(5)
        except requests.exceptions.RequestException as e:
            raise Exception('获取状态失败')


job_id = create_job()
if job_id is False:
    raise Exception('创建全量运行记录失败')
else:
    push_success(job_id)
    get_job_status(job_id)

    `
  return code
}
