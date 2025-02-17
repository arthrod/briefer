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
 * Prepares a notebook cell for execution by converting a Yjs document into a notebook format and generating Python execution code.
 *
 * This function performs the following steps:
 * - Converts the provided Yjs document (blocks and layout) to a notebook structure.
 * - Validates that a current block identifier is provided; otherwise, throws an error.
 * - Extracts the relevant section of the notebook corresponding to the current block.
 * - Retrieves the chat-document relation from the database using the documentId. An error is thrown if not found.
 * - Constructs an OSS path to save the notebook and saves the extracted notebook section.
 * - Fetches the user workspace information from the database using workspaceId. An error is thrown if not found.
 * - Generates and returns a Python script using the chatId, currentBlockId, and userId which executes the notebook cell.
 *
 * @param documentId - The unique identifier for the Yjs document.
 * @param workspaceId - The unique identifier for the user's workspace.
 * @param currentBlockId - The identifier of the current block to run. Must be provided.
 * @param blocks - A Yjs Map representing the notebook blocks.
 * @param layout - A Yjs Array representing the notebook layout groups.
 *
 * @returns A string containing the Python code to execute the notebook cell.
 *
 * @throws Error if currentBlockId is falsy.
 * @throws Error if no chat-document relation is found for the given documentId.
 * @throws Error if the user workspace associated with workspaceId cannot be found.
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
 * This function constructs a multi-line Python code string that configures HTTP and Redis connections
 * using environment variables and the provided identifiers. The script defines helper functions to:
 * - Create a job by sending a POST request to initiate cell execution.
 * - Push a success status for the created job.
 * - Poll for the job status and retrieve execution outputs from Redis.
 *
 * The generated script handles HTTP request errors, Redis connection issues, and includes logic to decode
 * and display image outputs if available. It leverages environment variables (MANAGER_URL, REDIS_HOST, REDIS_PORT,
 * and REDIS_PWD) to configure external service connections.
 *
 * @param chatId - The chat (or experiment) identifier used in API requests and for forming Redis keys.
 * @param cellId - The unique identifier of the notebook cell to be executed.
 * @param userId - The user identifier included in the HTTP request headers.
 * @returns A multi-line Python script string that can be executed to run the specified notebook cell.
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
