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
 * Converts a Y.js document into a Jupyter Notebook object.
 *
 * This function processes the document by iterating over the provided layout groups to determine
 * the order of blocks. For each group, it extracts tabs and retrieves the corresponding block from the
 * blocks map using the tab's id. Depending on the block type, the function constructs a notebook cell:
 * 
 * - **PYTHON**: Creates a code cell from Python block attributes.
 * - **RICH_TEXT**: Creates either a rich text cell or a markdown cell based on the presence of variables.
 * - **SQL**: Creates a SQL cell with metadata including the variable name.
 * - **INPUT**: Creates a code cell that assigns a variable a specific input value.
 * - **DATE_INPUT**: Creates a code cell that assigns a variable a formatted date string.
 *
 * For any unsupported or unknown block types, a raw cell is generated that indicates the unsupported type.
 *
 * @param blocks - A map of blocks (YBlock objects) representing the content of the Y.js document.
 * @param layout - An array of layout groups (YBlockGroup objects) that define the block order.
 * @returns A Jupyter Notebook object compliant with nbformat 4, including metadata and the generated cells.
 *
 * @example
 * const notebook = convertYjsDocumentToNotebook(blocks, layout);
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
 * Cuts the notebook to include all cells up to and including the cell with the specified target ID.
 *
 * This function iterates through the `cells` array of the provided notebook and collects each cell until a cell
 * with an `id` matching the `targetId` is encountered. It then constructs and returns a new notebook object with
 * the original notebook's metadata and the collected cells.
 *
 * @param notebook - The original notebook object containing a `cells` array.
 * @param targetId - The ID of the cell at which the notebook should be cut, inclusive.
 * @returns A new notebook object with the collected cells up to and including the target cell.
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
 * Saves a Jupyter Notebook to an Object Storage Service (OSS) by writing it to a temporary file and uploading it.
 *
 * The function serializes the provided notebook object to JSON and writes it to a temporary file constructed
 * from the provided OSS path and the `ROOT_DIR` environment variable (defaulting to `/opt/mindflow/` if unset).
 * It then uploads the file content using an `OssClient`. If the target directory does not exist, it is created recursively.
 * Regardless of the outcome, the temporary file is removed after the upload attempt.
 *
 * @param notebook - The notebook object to be saved, typically following the Jupyter Notebook format.
 * @param ossPath - The destination path in OSS where the notebook file should be stored.
 * 
 * @returns A promise that resolves to `true` if the notebook is successfully saved and uploaded; otherwise, `false`.
 *
 * @example
 * const notebook = { cells: [...], metadata: { ... } };
 * const success = await saveNotebookToOSS(notebook, 'notebooks/my_notebook');
 * if (success) {
 *   console.log('Notebook uploaded successfully.');
 * } else {
 *   console.error('Failed to upload notebook.');
 * }
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
