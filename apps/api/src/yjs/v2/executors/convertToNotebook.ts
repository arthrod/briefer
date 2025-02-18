import {
  PythonBlock,
  YBlock,
  getPythonAttributes,
  getBlocks,
  getLayout,
  getSQLAttributes,
  getRichTextAttributes,
  getSQLSource,
  getDateInputAttributes,
  makeDateInputBlock,
  makeInputBlock,
  getInputAttributes,
  RichTextBlock,
  SQLBlock,
  InputBlock,
  DateInputBlock,
  YBlockGroup,
} from '@briefer/editor'
import * as Y from 'yjs'
import { join, dirname } from 'path'
import fs from 'fs'
import { promises as fsPromises } from 'fs'
import { OssClient } from '../../../utils/oss.js'
/**
 * Converts a Y.js document represented by blocks and layout into a Jupyter Notebook format.
 *
 * This function processes the document by iterating over layout groups to order and extract blocks,
 * then transforms each block into its corresponding Jupyter Notebook cell. Supported block types include:
 * - PYTHON: Extracts Python source code and creates a code cell.
 * - RICH_TEXT: Extracts markdown content (and optional variables) to create either a rich text or markdown cell.
 * - SQL: Extracts SQL attributes to create a SQL cell.
 * - INPUT: Creates a code cell with variable assignment.
 * - DATE_INPUT: Formats date input into a string and creates a code cell.
 * Unsupported block types are handled gracefully by creating a raw cell with an appropriate error message.
 *
 * The returned notebook object conforms to nbformat version 4 and includes standard metadata such as
 * kernel specifications and language information.
 *
 * @param blocks - A Y.js map linking block IDs to their corresponding block data.
 * @param layout - A Y.js array representing layout groups that determine the ordering of blocks.
 * @returns A Jupyter Notebook object containing the constructed notebook cells and metadata.
 */

export function convertYjsDocumentToNotebook(
  blocks: Y.Map<YBlock>,
  layout: Y.Array<YBlockGroup>
): any {
  const notebookCells = []

  const orderedBlocks: YBlock[] = []
  for (const group of layout) {
    const tabs = group.getAttribute('tabs')
    if (!tabs) continue

    for (const tab of tabs) {
      const id = tab.getAttribute('id')
      if (!id) continue

      const block = blocks.get(id)
      if (block) {
        orderedBlocks.push(block)
      }
    }
  }
  /**
     *  RichText = 'RICH_TEXT',
    SQL = 'SQL',
    Python = 'PYTHON',
    Visualization = 'VISUALIZATION',
    Input = 'INPUT',
    DropdownInput = 'DROPDOWN_INPUT',
    DateInput = 'DATE_INPUT',
    FileUpload = 'FILE_UPLOAD',
    DashboardHeader = 'DASHBOARD_HEADER',
    Writeback = 'WRITEBACK',
    PivotTable = 'PIVOT_TABLE',
     */
  for (const currentBlock of orderedBlocks) {
    const blockType = currentBlock.getAttribute('type')
    const cellMetadata = {}
    const cellId = currentBlock.getAttribute('id') || null

    switch (blockType) {
      case 'PYTHON': {
        const { source } = getPythonAttributes(currentBlock as Y.XmlElement<PythonBlock>)
        notebookCells.push({
          id: cellId,
          cell_type: 'code',
          source: source?.toJSON() ?? '',
          metadata: { id: cellId },
          execution_count: null,
          outputs: [],
        })
        break
      }
      case 'RICH_TEXT': {
        const { markdown, variables } = getRichTextAttributes(
          currentBlock as Y.XmlElement<RichTextBlock>
        )
        let cell_type = 'rich_text'
        let metadata = {}
        if (Array.isArray(variables) && variables.length === 0) {
          cell_type = 'markdown'
          metadata = { id: cellId }
        } else {
          metadata = { variables, id: cellId }
        }
        notebookCells.push({
          id: cellId,
          cell_type: cell_type,
          source: markdown,
          metadata: metadata,
        })
        break
      }
      case 'SQL':
        const sqlBlock = getSQLAttributes(currentBlock as Y.XmlElement<SQLBlock>, blocks)
        notebookCells.push({
          id: cellId,
          cell_type: 'sql',
          source: sqlBlock.source?.toJSON() ?? '',
          metadata: {
            language: 'sql',
            variable: sqlBlock.dataframeName.value,
            id: cellId
          },
          execution_count: null,
          outputs: [],
        })
        break
      case 'INPUT':
        const inputBlock = getInputAttributes(currentBlock as Y.XmlElement<InputBlock>, blocks)
        notebookCells.push({
          id: cellId,
          cell_type: 'code',
          source: inputBlock['variable'].value + ' = \'' + inputBlock['value'].value + '\'\n',
          metadata: { id: cellId },
          execution_count: null,
          outputs: [],
        })
        break
      case 'DROPDOWN_INPUT':
        break
      case 'DATE_INPUT': {
        const dateInputBlock = getDateInputAttributes(
          currentBlock as Y.XmlElement<DateInputBlock>,
          blocks
        )
        const date_obj = dateInputBlock['value']
        const dateType = dateInputBlock['dateType']
        let date_str = ''
        if (dateType == 'date') {
          date_str = date_obj.year + '-' + date_obj.month + '-' + date_obj.day
        } else {
          date_str =
            date_obj.year +
            '-' +
            date_obj.month +
            '-' +
            date_obj.day +
            ' ' +
            date_obj.hours +
            ':' +
            date_obj.minutes +
            ':' +
            date_obj.seconds
        }

        notebookCells.push({
          id: cellId,
          cell_type: 'code',
          source: dateInputBlock['variable'] + ' = \'' + date_str + '\'\n',
          metadata: { id: cellId },
          execution_count: null,
          outputs: [],
        })
        break
      }
      default: {
        // Handle unsupported or unknown block types gracefully
        notebookCells.push({
          cell_type: 'raw',
          source: `Unsupported block type: ${blockType}`,
          metadata: { id: cellId },
        })
        break
      }
    }
  }

  return {
    nbformat: 4,
    nbformat_minor: 4,
    metadata: {
      kernelspec: {
        display_name: "",
        name: "python3"
      },
      language_info: {
        codemirror_mode: {
          name: "ipython",
          version: 3
        },
        file_extension: ".py",
        mimetype: "text/x-python",
        name: "python",
        nbconvert_exporter: "python",
        pygments_lexer: "ipython3",
        version: "3.7.11"
      },
      lastTop: 2428.800048828125
    },
    cells: notebookCells,
  }
}

/**
 * Creates a new notebook containing cells up to a specified target cell.
 *
 * This function iterates over the cells of the provided notebook and collects them until a cell with the matching `targetId` is encountered.
 * The returned notebook preserves the notebook format (nbformat 4) and includes a fixed metadata configuration.
 *
 * @param notebook - The original notebook object containing an array of cells.
 * @param targetId - The identifier of the cell at which to cut the notebook. Cells are included up to and including this cell.
 * @returns A new notebook object containing cells from the beginning up to the specified target cell.
 */
export function cutNotebook(notebook: any, targetId: string) {
  const run_cells = []
  for (const item of notebook.cells) {
    run_cells.push(item)
    if (item.id === targetId) {
      break
    }
  }

  const cut_notebook = {
    nbformat: 4,
    nbformat_minor: 4,
    metadata: {
      kernelspec: {
        display_name: "",
        name: "python3"
      },
      language_info: {
        codemirror_mode: {
          name: "ipython",
          version: 3
        },
        file_extension: ".py",
        mimetype: "text/x-python",
        name: "python",
        nbconvert_exporter: "python",
        pygments_lexer: "ipython3",
        version: "3.7.11"
      },
      lastTop: 2428.800048828125
    },
    cells: run_cells,
  }
  return cut_notebook
}

/**
 * Asynchronously saves a Jupyter Notebook to an OSS (Object Storage Service) path.
 *
 * This function writes the provided notebook object as a formatted JSON file to a temporary file,
 * whose path is constructed based on the OSS path and the root directory specified by the
 * `ROOT_DIR` environment variable (defaults to `/opt/mindflow/` if not set). It ensures that the
 * destination directory exists and then uploads the file to OSS using an OssClient. The temporary
 * file is deleted after the upload process, regardless of success. The function returns a promise
 * that resolves to `true` if the notebook is successfully saved and uploaded, or `false` if any error
 * occurs during the process.
 *
 * @param notebook - The Jupyter Notebook object to be saved, typically following the standard notebook format.
 * @param ossPath - The target OSS path (filename without extension) where the notebook will be saved.
 * @returns A promise that resolves to a boolean indicating whether the notebook was successfully saved and uploaded.
 */
export async function saveNotebookToOSS(notebook: any, ossPath: string): Promise<boolean> {
  const rootDir = process.env['ROOT_DIR'] ?? '/opt/mindflow/'
  const tempPath = join(rootDir, `${ossPath}.ipynb`)

  try {
    // 创建目录（如果不存在）
    const dir = dirname(tempPath)
    await fsPromises.mkdir(dir, { recursive: true })

    // Write notebook to temp file
    await fsPromises.writeFile(tempPath, JSON.stringify(notebook, null, 2))

    const ossClient = new OssClient()
    const fileContent = fs.readFileSync(tempPath)
    ossClient.uploadFile(ossPath, fileContent)

    return true
  } catch {
    return false
  } finally {
    // Clean up temp file
    await fsPromises.unlink(tempPath).catch(() => { })
  }
}
