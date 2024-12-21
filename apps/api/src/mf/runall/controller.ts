import { Request, Response } from 'express'
import { CONFIG } from './constants.js'
import { fetchWithTimeout } from '../chat/utils/fetch.js'
import { sendResponse, success, fail, handleError } from '../../utils/response.js'
import { sessionFromCookies } from '../../auth/token.js'
import { prisma, YjsDocument } from '@briefer/database'
import { getYDocForUpdate, WSSharedDocV2 } from '../../yjs/v2/index.js'
import path, { join } from 'path'
import fs from 'fs'
import { IOServer } from '../../websocket/index.js'
import { DocumentPersistor } from '../../yjs/v2/persistors.js'
import { convertYjsDocumentToNotebook, saveNotebookToOSS } from '../../yjs/v2/executors/convertToNotebook.js'
import { ErrorCode } from '../../constants/errorcode.js'
import { fileURLToPath } from 'url'
import { NotebookConverter } from '../../utils/notebook-converter.js'
import AdmZip from 'adm-zip'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { mkdir, mkdtemp } from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class RunAllController {
  private socketServer: IOServer
  constructor(socketServer: IOServer) {
    this.socketServer = socketServer
  }
  async getRunAllList(req: Request, res: Response) {
    if (CONFIG.IS_MOCK) {
      return sendResponse(
        res,
        success({
          list: [
            {
              id: 1,
              name: '能源统计月度分析报告20241020164408',
              documentId: 'string',
              jobId: 'string',
              runStatus: 1,
              approveStatus: 4,
              startTime: '2024/10/28 18:49:09',
              duration: 'string',
              des: 'string',
              version: 'string',
              reason: 'string',
            },
            // ,
            // {
            //   id: 2,
            //   name: '能源统计月度分析报告20241020164408',
            //   documentId: 'string',
            //   jobId: 'string',
            //   runStatus: Math.floor(Math.random() * 6) + 1,
            //   approveStatus: Math.floor(Math.random() * 5) + 1,
            //   startTime: '2024/10/28 18:49:09',
            //   duration: 'string',
            //   des: 'string',
            //   version: 'string',
            //   reason: 'string',
            // },
            // {
            //   id: 3,
            //   name: '能源统计月度分析报告20241020164408',
            //   documentId: 'string',
            //   jobId: 'string',
            //   runStatus: Math.floor(Math.random() * 6) + 1,
            //   approveStatus: Math.floor(Math.random() * 5) + 1,
            //   startTime: '2024/10/28 18:49:09',
            //   duration: 'string',
            //   des: 'string',
            //   version: 'string',
            //   reason: 'string',
            // },
            // {
            //   id: 4,
            //   name: '能源统计月度分析报告20241020164408',
            //   documentId: 'string',
            //   jobId: 'string',
            //   runStatus: Math.floor(Math.random() * 6) + 1,
            //   approveStatus: Math.floor(Math.random() * 5) + 1,
            //   startTime: '2024/10/28 18:49:09',
            //   duration: 'string',
            //   des: 'string',
            //   version: 'string',
            //   reason: 'string',
            // },
            // {
            //   id: 5,
            //   name: '能源统计月度分析报告20241020164408',
            //   documentId: 'string',
            //   jobId: 'string',
            //   runStatus: Math.floor(Math.random() * 6) + 1,
            //   approveStatus: Math.floor(Math.random() * 5) + 1,
            //   startTime: '2024/10/28 18:49:09',
            //   duration: 'string',
            //   des: 'string',
            //   version: 'string',
            //   reason: 'string',
            // },
            // {
            //   id: 6,
            //   name: '能源统计月度分析报告20241020164408',
            //   documentId: 'string',
            //   jobId: 'string',
            //   runStatus: Math.floor(Math.random() * 6) + 1,
            //   approveStatus: Math.floor(Math.random() * 5) + 1,
            //   startTime: '2024/10/28 18:49:09',
            //   duration: 'string',
            //   des: 'string',
            //   version: 'string',
            //   reason: 'string',
            // },
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
            'mf-nodejs-user-id': req.session.user.id,
          },
          body: JSON.stringify({
            identity: reqJson.chatId,
            page: reqJson.pageNum,
            pageSize: reqJson.pageSize,
            sValue: reqJson.keyword,
          }),
        },
        5000
      )
      const result: any = await jobsRes.json()
      if (result && result.code === 0) {
        sendResponse(
          res,
          success({
            list: result.data.rows,
          })
        )
      } else {
        sendResponse(res, fail(result ? result.code : -1, result ? result.msg : ''))
      }
    } catch (e) {
      sendResponse(res, handleError(500, '获取全量运行列表失败'))
    }
  }

  async createRunAll(req: Request, res: Response) {
    const reqJson = req.body
    try {
      const jobsRes = await fetchWithTimeout(
        `${CONFIG.MANAGER_URL}${CONFIG.ENDPOINTS.RUN}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mf-nodejs-user-id': req.session.user.id,
          },
          body: JSON.stringify({
            experimentId: reqJson.chatId,
            versionName: reqJson.name,
          }),
        },
        5000
      )
      const result: any = await jobsRes.json()
      if (result && result.code === 0) {
        // 在查询到 yDoc 后开启一个线程进行处理
        const yDoc = await this.getYDoc(reqJson.chatId, req);

        // 在后台启动异步上传任务
        (async () => {
          await this.uploadCode(yDoc, reqJson.chatId, req.session.user.id, result.data.jobId);  // 确保 yDoc 是获取到的文档对象
        })();

      }
      sendResponse(res, success({ result }))
    } catch (e) {
      sendResponse(res, handleError(500, '创建全量运行记录失败'))
    }
  }

  async queryStatus(req: Request, res: Response) {
    if (CONFIG.IS_MOCK) {
      return sendResponse(
        res,
        success({
          list: [
            {
              id: 1,
              name: '能源统计月度分析报告20241020164408',
              documentId: 'string',
              jobId: 'string',
              runStatus: 1,
              approveStatus: 4,
              startTime: '2024/10/28 18:49:09',
              endTime: '2024/10/28 18:49:09',
              duration: 'string',
              des: 'string',
              version: 'string',
              reason: 'string',
            },
            // ,
            // {
            //   id: 2,
            //   name: '能源统计月度分析报告20241020164408',
            //   documentId: 'string',
            //   jobId: 'string',
            //   runStatus: Math.floor(Math.random() * 6) + 1,
            //   approveStatus: Math.floor(Math.random() * 5) + 1,
            //   startTime: '2024/10/28 18:49:09',
            //   endTime: '2024/10/28 18:49:09',
            //   duration: 'string',
            //   des: 'string',
            //   version: 'string',
            //   reason: 'string',
            // },
            // {
            //   id: 3,
            //   name: '能源统计月度分析报告20241020164408',
            //   documentId: 'string',
            //   jobId: 'string',
            //   runStatus: Math.floor(Math.random() * 6) + 1,
            //   approveStatus: Math.floor(Math.random() * 5) + 1,
            //   startTime: '2024/10/28 18:49:09',
            //   endTime: '2024/10/28 18:49:09',
            //   duration: 'string',
            //   des: 'string',
            //   version: 'string',
            //   reason: 'string',
            // },
            // {
            //   id: 4,
            //   name: '能源统计月度分析报告20241020164408',
            //   documentId: 'string',
            //   jobId: 'string',
            //   runStatus: Math.floor(Math.random() * 6) + 1,
            //   approveStatus: Math.floor(Math.random() * 5) + 1,
            //   startTime: '2024/10/28 18:49:09',
            //   endTime: '2024/10/28 18:49:09',
            //   duration: 'string',
            //   des: 'string',
            //   version: 'string',
            //   reason: 'string',
            // },
            // {
            //   id: 5,
            //   name: '能源统计月度分析报告20241020164408',
            //   documentId: 'string',
            //   jobId: 'string',
            //   runStatus: Math.floor(Math.random() * 6) + 1,
            //   approveStatus: Math.floor(Math.random() * 5) + 1,
            //   startTime: '2024/10/28 18:49:09',
            //   endTime: '2024/10/28 18:49:09',
            //   duration: 'string',
            //   des: 'string',
            //   version: 'string',
            //   reason: 'string',
            // },
            // {
            //   id: 6,
            //   name: '能源统计月度分析报告20241020164408',
            //   documentId: 'string',
            //   jobId: 'string',
            //   runStatus: Math.floor(Math.random() * 6) + 1,
            //   approveStatus: Math.floor(Math.random() * 5) + 1,
            //   startTime: '2024/10/28 18:49:09',
            //   endTime: '2024/10/28 18:49:09',
            //   duration: 'string',
            //   des: 'string',
            //   version: 'string',
            //   reason: 'string',
            // },
          ],
        })
      )
    }
    const reqJson = req.body
    try {
      const jobsRes = await fetchWithTimeout(
        `${CONFIG.MANAGER_URL}${CONFIG.ENDPOINTS.STATUS}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mf-nodejs-user-id': req.session.user.id,
          },
          body: JSON.stringify({
            ids: reqJson.ids,
          }),
        },
        5000
      )
      const result: any = await jobsRes.json()
      if (result && result.code === 0) {
        sendResponse(
          res,
          success({
            list: result.data.list,
          })
        )
      } else {
        sendResponse(res, fail(result ? result.code : -1, result ? result.msg : ''))
      }
    } catch (e) {
      sendResponse(res, handleError(500, '获取全量运行记录状态失败'))
    }
  }

  async approve(req: Request, res: Response) {
    const reqJson = req.body
    try {
      const jobsRes = await fetchWithTimeout(
        `${CONFIG.MANAGER_URL}${CONFIG.ENDPOINTS.APPROVE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'mf-nodejs-user-id': req.session.user.id,
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
      sendResponse(res, handleError(500, '申请下载失败'))
    }
  }

  async stop(req: Request, res: Response) { }

  async download(req: Request, res: Response) {
    try {
      const { id } = req.query
      if (!id) {
        return res.status(400).json(fail(ErrorCode.PARAM_ERROR, '参数不正确，缺少下载全量记录的id'))
      }

      // 获取文件的 URL
      const fileStreamRes = await fetch(
        `${CONFIG.MANAGER_URL}${CONFIG.ENDPOINTS.DOWNLOAD}?id=${id}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/octet-stream',
            'mf-nodejs-user-id': req.session.user.id,
          },
        }
      )

      // // 使用本地zip文件
      // const testZipPath1 = path.join(__dirname, '../../test-files/dian.zip')
      // if (!fs.existsSync(testZipPath1)) {
      //   return res.status(500).json(fail(ErrorCode.SERVER_ERROR, '测试文件不存在'))
      // }

      // // 读取zip文件并创建流
      // const zipFileStream = fs.createReadStream(testZipPath1)
      // const fileStreamRes = {
      //   ok: true,
      //   status: 200,
      //   statusText: 'OK',
      //   headers: new Map([['content-disposition', `attachment; filename="test-${id}.zip"`]]),
      //   body: new ReadableStream({
      //     start(controller) {
      //       zipFileStream.on('data', (chunk) => {
      //         controller.enqueue(chunk)
      //       })
      //       zipFileStream.on('end', () => {
      //         controller.close()
      //       })
      //       zipFileStream.on('error', (error) => {
      //         controller.error(error)
      //       })
      //     }
      //   }),
      //   // 实现 arrayBuffer 方法
      //   arrayBuffer: async () => {
      //     return new Promise<ArrayBuffer>((resolve, reject) => {
      //       const chunks: Buffer[] = [];
      //       zipFileStream.on('data', (chunk: Buffer) => {
      //         if (Buffer.isBuffer(chunk)) {
      //           chunks.push(chunk);
      //         } else {
      //           chunks.push(Buffer.from(chunk));
      //         }
      //       });
      //       zipFileStream.on('end', () => {
      //         const buffer = Buffer.concat(chunks);
      //         resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      //       });
      //       zipFileStream.on('error', reject);
      //     });
      //   }
      // }

      // 检查文件是否成功获取
      if (!fileStreamRes.ok) {
        console.error('Failed to fetch file:', fileStreamRes.statusText)
        return res.status(fileStreamRes.status).json(fail(ErrorCode.SERVER_ERROR, '获取文件失败'))
      }

      // 获取文件名
      const contentDisposition = fileStreamRes.headers.get('content-disposition')
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `download-${id}.zip`

      // 创建临时目录
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notebook-conversion-'))
      console.log('Created directories:', {
        tempDir,
        extractDir: path.join(tempDir, 'extracted'),
        pdfDir: path.join(tempDir, 'pdf')
      })

      try {
        // 创建目录结构
        const extractDir = path.join(tempDir, 'extracted')
        const pdfDir = path.join(tempDir, 'pdf')
        fs.mkdirSync(extractDir, { recursive: true })
        fs.mkdirSync(pdfDir, { recursive: true })

        // 保存文件流到临时文件
        const tempZipPath = path.join(tempDir, 'input.zip')
        const writeStream = fs.createWriteStream(tempZipPath)
        const arrayBuffer = await fileStreamRes.arrayBuffer()
        writeStream.write(Buffer.from(arrayBuffer))
        writeStream.end()

        // 等待文件写入完成
        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve)
          writeStream.on('error', reject)
        })

        // 解压文件
        await this.unzip(tempZipPath, extractDir)

        // 查找并处理所有 ipynb 文件
        const ipynbFiles = this.findIpynbFiles(extractDir)
        console.log('Found ipynb files:', ipynbFiles)

        // 处理每个 ipynb 文件
        for (const inputPath of ipynbFiles) {
          console.log('Converting file:', {
            inputPath,
            pdfPath: path.join(pdfDir, path.relative(extractDir, inputPath).replace('.ipynb', '.pdf')),
            originalPath: path.relative(extractDir, inputPath),
          })

          try {
            // 先转换 ipynb 文件内容
            const notebookContent = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
            const convertedContent = this.convertNotebookContent(notebookContent, inputPath)
            fs.writeFileSync(inputPath, JSON.stringify(convertedContent, null, 2))

            // 获取原始路径，并基于此创建PDF路径
            const relativePath = path.relative(extractDir, inputPath)
            const pdfPath = path.join(pdfDir, relativePath.replace('.ipynb', '.pdf'))

            // 确保输出目录存在
            fs.mkdirSync(path.dirname(pdfPath), { recursive: true })

            console.log('PDF conversion paths:', {
              inputPath,
              relativePath,
              pdfPath,
              pdfDir
            })

            // 转换为 PDF
            const converter = new NotebookConverter()
            await converter.convertFile(inputPath, pdfPath)
          } catch (error) {
            console.error('Error processing notebook file:', inputPath, error)
          }
        }

        // 创建输出 zip 文件
        const outputZipPath = path.join(tempDir, 'output.zip')
        await this.zipDirectory(pdfDir, outputZipPath)
        const stats = fs.statSync(outputZipPath)
        console.log('Created output zip:', outputZipPath, 'Size:', stats.size)

        // 发送文件
        res.setHeader('Content-Type', 'application/zip')
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        fs.createReadStream(outputZipPath).pipe(res)

        // 清理临时文件
        res.on('finish', () => {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true })
          } catch (error) {
            console.error('Error cleaning up temp directory:', error)
          }
        })
      } catch (error) {
        // 清理临时文件
        try {
          fs.rmSync(tempDir, { recursive: true, force: true })
        } catch (cleanupError) {
          console.error('Error cleaning up temp directory:', cleanupError)
        }
        throw error
      }
    } catch (error) {
      console.error('Error in download:', error)
      return res.status(500).json(fail(ErrorCode.SERVER_ERROR, '下载文件失败'))
    }
  }

  // 转换 ipynb 文件内容，将 outputs 内容转换到 source
  private convertNotebookContent(notebookContent: any, inputPath: string) {
    if (!notebookContent.cells) return notebookContent;

    // 创建图片目录
    const notebookDir = path.dirname(inputPath);
    const imagesDir = path.join(notebookDir, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });

    // 过滤掉 sql 类型的 cell
    notebookContent.cells = notebookContent.cells
      .filter((cell: any) => cell.cell_type !== 'sql')
      .map((cell: any, cellIndex: number) => {
        // 处理 markdown/rich_text 类型的 cell
        if (cell.cell_type === 'markdown' || cell.cell_type === 'rich_text') {
          // 如果有 outputs 且包含 markdown 数据，使用它
          if (cell.outputs?.length > 0) {
            const output = cell.outputs[0];
            if (output?.data?.['text/markdown']) {
              cell.source = output.data['text/markdown'];
            }
          }

          // 确保 source 是字符串数组
          if (typeof cell.source === 'string') {
            cell.source = [cell.source];
          } else if (Array.isArray(cell.source)) {
            cell.source = cell.source.map((item: any) =>
              typeof item === 'string' ? item : String(item)
            );
          } else if (!cell.source) {
            cell.source = [];
          }

          // 处理 source 中的 base64 图片
          cell.source = cell.source.map((source: string) => {
            return source.replace(
              /!\[([^\]]*)\]\((data:image\/([^;]+);base64,([^)]+))\)/g,
              (match: string, altText: string, dataUrl: string, imageType: string, base64Data: string) => {
                try {
                  // 清理 base64 数据
                  base64Data = base64Data.replace(/[\s\n]/g, '');
                  if (base64Data.length < 10) {
                    console.warn('Skipping invalid base64 image data');
                    return match;
                  }

                  const imageFileName = `image_${cellIndex}_${Date.now()}.${imageType}`;
                  const imagePath = path.join(imagesDir, imageFileName);

                  try {
                    // 解码并保存图片
                    const imageBuffer = Buffer.from(base64Data, 'base64');
                    fs.writeFileSync(imagePath, imageBuffer);

                    // 检查文件是否有效
                    const stats = fs.statSync(imagePath);
                    if (stats.size === 0) {
                      console.warn('Generated empty image file, skipping');
                      fs.unlinkSync(imagePath);
                      return match;
                    }

                    // 返回 LaTeX 格式的图片引用
                    return `\\begin{figure}[H]
                            \\centering
                            \\includegraphics[max width=\\textwidth, max height=0.7\\textheight]{images/${imageFileName}}
                            ${altText ? `\\caption{${altText}}` : ''}
                            \\end{figure}`;
                  } catch (error) {
                    console.error('Error saving image:', error);
                    return match;
                  }
                } catch (error) {
                  console.error('Error processing base64 image:', error);
                  return match;
                }
              }
            );
          });

          cell.cell_type = 'markdown';
          return cell;
        }

        // 处理 code 类型的 cell
        if (cell.cell_type === 'code') {
          // 如果没有 outputs，直接返回
          if (!cell.outputs || cell.outputs.length === 0) return cell;

          // 处理文本输出
          const textOutput = cell.outputs.find((o: any) => o.name === 'stdout');
          if (textOutput?.text) {
            cell.source = Array.isArray(textOutput.text) ? textOutput.text : [textOutput.text];
          }

          // 处理图片输出
          const imageOutputs = cell.outputs.filter((o: any) =>
            o.data && (
              o.data['image/png'] ||
              o.data['image/jpeg'] ||
              o.data['image/jpg'] ||
              o.data['image/gif']
            )
          );

          if (imageOutputs.length > 0) {
            // 创建一个新的 markdown cell 来显示图片
            const imageCell = {
              cell_type: 'markdown',
              metadata: {},
              source: imageOutputs.map((output: any) => {
                try {
                  // 获取图片数据和类型
                  const imageType = Object.keys(output.data).find(key => key.startsWith('image/'))?.split('/')[1];
                  if (!imageType) return '';

                  const base64Data = output.data[`image/${imageType}`];
                  if (!base64Data || base64Data.length < 10) {
                    console.warn('Invalid base64 image data');
                    return '';
                  }

                  const imageFileName = `image_${cellIndex}_${Date.now()}.${imageType}`;
                  const imagePath = path.join(imagesDir, imageFileName);

                  try {
                    // 解码并保存图片
                    const imageBuffer = Buffer.from(base64Data, 'base64');
                    fs.writeFileSync(imagePath, imageBuffer);

                    // 检查文件是否有效
                    const stats = fs.statSync(imagePath);
                    if (stats.size === 0) {
                      console.warn('Generated empty image file, skipping');
                      fs.unlinkSync(imagePath);
                      return '';
                    }

                    // 返回 LaTeX 格式的图片引用
                    return `\\begin{figure}[H]
                            \\centering
                            \\includegraphics[max width=\\textwidth, max height=0.7\\textheight]{images/${imageFileName}}
                            \\end{figure}`;
                  } catch (error) {
                    console.error('Error saving image:', error);
                    return '';
                  }
                } catch (error) {
                  console.error('Error processing base64 image:', error);
                  return '';
                }
              }).filter(Boolean)  // 移除空字符串
            };

            // 只有当有有效的图片时才返回新的 markdown cell
            if (imageCell.source.length > 0) {
              // 移除原始 cell 中的图片输出，只保留文本输出
              cell.outputs = cell.outputs.filter((o: any) => o.name === 'stdout');
              return [imageCell]; // 只返回 imageCell
            }
          }

          return cell;
        }

        return cell;
      });

    // 展平数组，因为 map 可能返回数组（当处理包含图片的 code cell 时）
    notebookContent.cells = notebookContent.cells.flat();

    // 确保所有 cell 的 source 都是字符串数组
    notebookContent.cells = notebookContent.cells.map((cell: any) => {
      if (Array.isArray(cell.source)) {
        // 如果 source 是数组，确保其中的每个元素都是字符串
        cell.source = cell.source.map((item: any) =>
          typeof item === 'string' ? item : String(item)
        );
      } else if (cell.source) {
        // 如果 source 不是数组，将其转换为字符串数组
        cell.source = [String(cell.source)];
      } else {
        // 如果 source 不存在，设置为空数组
        cell.source = [];
      }
      return cell;
    });

    return notebookContent;
  }

  // 递归查找所有ipynb文件
  private findIpynbFiles(dir: string): string[] {
    const files: string[] = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.name === '__MACOSX') {
        console.log('Skipping __MACOSX directory:', path.join(dir, entry.name))
        continue
      }

      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...this.findIpynbFiles(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.ipynb')) {
        console.log('Found notebook file:', fullPath)
        files.push(fullPath)
      }
    }

    return files
  }

  async getYDoc(chatId: string, req: Request): Promise<WSSharedDocV2> {
    const userId = req.session!.user.id

    const chatDocumentRelation = await prisma().chatDocumentRelation.findFirst({
      where: { chatId: chatId }
    })
    if (!chatDocumentRelation) {
      throw new Error('未查询到对话关联报告文档!')
    }
    const documentId = chatDocumentRelation.documentId
    const { yDoc } = await getYDocForUpdate(
      [documentId, 'null'].join('-'),
      this.socketServer,
      documentId,
      req.session?.userWorkspaces[0]?.workspaceId || '',
      (doc: WSSharedDocV2) => ({
        yDoc: doc,
      }),
      new DocumentPersistor(documentId)
    )
    return yDoc

  }



  async uploadCode(yDoc: WSSharedDocV2, chatId: string, userId: string, jobId: string) {

    const notebook = convertYjsDocumentToNotebook(yDoc.blocks, yDoc.layout)
    const ossPath = join('chat/', chatId, '/', uuidv4())
    const result = await saveNotebookToOSS(notebook, ossPath)
    if (result) {
      try {
        const jobsRes = await fetchWithTimeout(
          `${CONFIG.MANAGER_URL}${CONFIG.ENDPOINTS.PUSH_SUCCESS}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'mf-nodejs-user-id': userId,
            },
            body: JSON.stringify({
              jobId: jobId,
              notebookPath: ossPath,
            }),
          },
          5000
        )
      } catch (e) {
        console.log('创建全量运行记录失败')
      }
    }

  }

  private async unzip(zipPath: string, extractDir: string) {
    const zip = new AdmZip(zipPath)
    const entries = zip.getEntries()
    for (const entry of entries) {
      if (!entry.entryName.startsWith('__MACOSX/')) {
        const extractPath = path.join(extractDir, entry.entryName)
        // 确保目标目录存在
        fs.mkdirSync(path.dirname(extractPath), { recursive: true })
        // 解压文件
        zip.extractEntryTo(entry, path.dirname(extractPath), false, true)
      }
    }
  }

  private async zipDirectory(sourceDir: string, outputZipPath: string) {
    const zip = new AdmZip()
    const files = await this.getFiles(sourceDir)

    // 记录已添加的文件路径，用于去重
    const addedPaths = new Set<string>()

    for (const file of files) {
      // 获取相对于源目录的路径
      const relativePath = path.relative(sourceDir, file)

      // 跳过不在子目录中的文件
      if (!relativePath.includes(path.sep)) {
        console.log('Skipping file not in subdirectory:', relativePath)
        continue
      }

      // 跳过已添加的路径
      if (addedPaths.has(relativePath)) {
        console.log('Skipping duplicate file:', relativePath)
        continue
      }

      console.log('Adding file to zip:', {
        file,
        relativePath,
        targetPath: path.dirname(relativePath),
        size: fs.statSync(file).size
      })

      // 添加文件到zip
      zip.addLocalFile(file, path.dirname(relativePath))
      addedPaths.add(relativePath)
    }

    zip.writeZip(outputZipPath)
    console.log('Zip file created:', {
      path: outputZipPath,
      size: fs.statSync(outputZipPath).size,
      files: Array.from(addedPaths)
    })
  }

  private async getFiles(dir: string): Promise<string[]> {
    const files: string[] = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...await this.getFiles(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.pdf')) { // 只添加 PDF 文件
        files.push(fullPath)
      }
    }

    return files
  }

}
