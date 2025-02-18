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
 * Prepares a cell for execution by converting a Yjs document into a notebook, validating the necessary identifiers, saving the notebook to OSS, and generating the corresponding cell-request code.
 *
 * This function performs the following steps:
 * 1. Converts the provided Yjs blocks and layout into a notebook format.
 * 2. Ensures that a valid current block ID is provided; if not, an error is thrown.
 * 3. Cuts the notebook to isolate the relevant segment based on the current block ID.
 * 4. Retrieves the related chat document using the document ID from the database; if the relation is not found, an error is thrown.
 * 5. Constructs an OSS path using the chat ID and current block ID, then saves the notebook to OSS.
 * 6. Retrieves the user workspace using the workspace ID from the database; if the workspace is not found, an error is thrown.
 * 7. Generates and returns Python code for executing the cell using the chat ID, current block ID, and user ID.
 *
 * @param documentId - The unique identifier of the Yjs document.
 * @param workspaceId - The unique identifier of the user's workspace.
 * @param currentBlockId - The identifier of the current block to operate on; must not be null.
 * @param blocks - A Y.Map representing the document's blocks.
 * @param layout - A Y.Array representing the layout configuration of block groups.
 * @returns A string containing the generated Python code for cell execution.
 *
 * @throws Error - If `currentBlockId` is falsy.
 * @throws Error - If no chat document relation is found for the given `documentId`.
 * @throws Error - If no user workspace is found for the given `workspaceId`.
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
 * Generates a Python script that orchestrates the execution of a notebook cell.
 *
 * This function assembles and returns a multi-line Python script that configures HTTP and Redis connections
 * using environment variables and defines helper functions for submitting and monitoring a job for cell execution.
 * The generated script performs the following steps:
 * - Configures HTTP requests and Redis using parameters like the manager URL, Redis host/port, and password.
 * - Defines the `create_job` function to initiate a job via an HTTP POST request.
 * - Defines the `push_success` function to notify job success after creation.
 * - Defines the `get_job_status` function which polls the job status via HTTP, retrieves output data from Redis,
 *   deserializes it, and displays images in a Jupyter-like environment.
 *
 * The Python code is intended to be executed in contexts where the respective HTTP and Redis services are available
 * along with the necessary Python packages such as `requests`, `redis`, `javaobj-py3`, `IPython.display`, among others.
 *
 * @param chatId - The identifier for the chat or experiment context.
 * @param cellId - The identifier for the notebook cell that is to be executed.
 * @param userId - The user identifier for authentication in HTTP headers.
 * @returns A string containing the complete Python script for executing the specified cell.
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
