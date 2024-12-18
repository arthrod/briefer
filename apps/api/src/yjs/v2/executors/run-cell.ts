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

export function run_cell_request_code(chatId: string, cellId: string, userId: string) {
  const code = `
import time
import requests
import redis

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
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, password=REDIS_PASSWORD, db=0)
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
        'mf-nodejs-user-id': '76576439-5212-4d59-9cf9-14a688bdeff9'
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
                list = result['data']
                if len(list) > 0:
                    status = list[0]['runStatus']
                    if status == 2:
                        print('运行成功')
                        outputs = redis_client.get(KEY)
                        if not outputs:
                            return outputs
                    elif status == 3:
                        is_running = False
        except requests.exceptions.RequestException as e:
            print("HTTP 请求失败:", e)
            raise Exception('获取状态失败')


job_id = create_job()
if job_id is False:
    print(123)
else:
    push_success(job_id)
    get_job_status(job_id)

    `
  return code
}
