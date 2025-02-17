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
 * Converts a Y.js document, represented by a map of blocks and an array of layout groups, into a Jupyter Notebook format.
 *
 * This function iterates over the provided layout to determine the order of blocks and constructs notebook cells based on each
 * block's type. Supported block types include:
 * - **PYTHON**: Creates a code cell with Python source code.
 * - **RICH_TEXT**: Creates a rich text cell or markdown cell depending on whether variables are present.
 * - **SQL**: Creates an SQL cell with associated metadata.
 * - **INPUT**: Creates a code cell for input assignments.
 * - **DATE_INPUT**: Formats a date input into a string and creates a corresponding code cell.
 * For any unsupported or unknown block type, a raw cell with an error message is generated.
 *
 * @param blocks - A Y.js Map containing blocks keyed by their identifiers.
 * @param layout - A Y.js Array representing groups of blocks (layout) that determines the ordering of cells.
 * @returns An object representing the Jupyter Notebook, including nbformat metadata and the assembled list of cells.
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
 * Cuts the given notebook at the specified target cell.
 *
 * This function iterates through the cells of the notebook and collects them sequentially
 * until it encounters a cell with an ID matching the provided targetId. The resulting
 * notebook includes all cells up to and including the target cell. If the target cell is
 * not found, all cells from the original notebook are included.
 *
 * @param notebook - The original Jupyter Notebook object containing an array of cells.
 * @param targetId - The ID of the cell at which to stop including further cells.
 *
 * @returns A new notebook object following the Jupyter Notebook format that contains the
 *          cells up to and including the cell with the matching targetId.
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
 * Asynchronously saves a notebook to an Object Storage Service (OSS) by first writing it to a temporary file.
 *
 * This function constructs a temporary file path using the `ROOT_DIR` environment variable (defaulting to '/opt/mindflow/')
 * and the provided `ossPath` with an `.ipynb` extension. It ensures the target directory exists, writes the notebook as a
 * formatted JSON file, and uploads it to OSS using an `OssClient` instance. Regardless of whether the upload succeeds or fails,
 * the temporary file is deleted.
 *
 * @param notebook - The notebook object to save (will be serialized to JSON).
 * @param ossPath - The target OSS path or key where the notebook should be uploaded.
 * @returns A promise that resolves to `true` if the notebook was successfully saved to OSS, or `false` if an error occurred.
 *
 * @remarks
 * All errors encountered during directory creation, file writing, or uploading are caught, leading the function to return `false`.
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
