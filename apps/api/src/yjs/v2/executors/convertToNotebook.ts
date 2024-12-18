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
    DateInputBlock
} from '@briefer/editor'
import * as Y from 'yjs'
import { join, dirname } from 'path'
import { promises as fs } from 'fs'
import { OssClient } from '../../../utils/oss.js'
/**
 * Converts a yjsDocument to a Jupyter Notebook format.
 * @param yjsDocState The Y.js document state buffer.
 * @returns A Jupyter Notebook object.
 */
export function convertYjsDocumentToNotebook(yjsDocState: Buffer): any {
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, yjsDocState)

    const blocks = getBlocks(ydoc)
    const layout = getLayout(ydoc)
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
        const blockType = currentBlock.getAttribute('type');
        const cellMetadata = {};
        const cellId = currentBlock.getAttribute('id') || null;

        switch (blockType) {
            case 'PYTHON': {
                const { source } = getPythonAttributes(currentBlock as Y.XmlElement<PythonBlock>);
                notebookCells.push({
                    id: cellId,
                    cell_type: 'code',
                    source: source?.toJSON() ?? '',
                    metadata: {},
                    execution_count: null,
                    outputs: [],
                });
                break;
            }
            case 'RICH_TEXT': {
                const { content, variables } = getRichTextAttributes(currentBlock as Y.XmlElement<RichTextBlock>);
                notebookCells.push({
                    id: cellId,
                    cell_type: 'rich_text',
                    source: content?.toJSON() ?? '',
                    metadata: { variables },
                });
                break;
            }
            case 'SQL':
                const sqlBlock = getSQLAttributes(currentBlock as Y.XmlElement<SQLBlock>, blocks)
                notebookCells.push({
                    id: cellId,
                    cell_type: 'sql',
                    source: sqlBlock.source?.toJSON() ?? '',
                    metadata: { "variable": sqlBlock.dataframeName },
                    execution_count: null,
                    outputs: [],
                });
                break;
            case 'INPUT':
                const inputBlock = getInputAttributes(currentBlock as Y.XmlElement<InputBlock>, blocks)
                notebookCells.push({
                    id: cellId,
                    cell_type: 'code',
                    source: inputBlock['variable'].value + ' = ' + inputBlock['value'].value + '\n',
                    metadata: {},
                    execution_count: null,
                    outputs: [],
                });
                break;
            case 'DROPDOWN_INPUT':
                break;
            case 'DATE_INPUT': {
                const dateInputBlock = getDateInputAttributes(currentBlock as Y.XmlElement<DateInputBlock>, blocks);
                const date_obj = dateInputBlock['value']
                const dateType = dateInputBlock['dateType']
                let date_str = ''
                if (dateType == 'date') {
                    date_str = date_obj.year + '-' + date_obj.month + '-' + date_obj.day
                } else {
                    date_str = date_obj.year + '-' + date_obj.month + '-' + date_obj.day + ' ' + date_obj.hours + ':' + date_obj.minutes + ':' + date_obj.seconds
                }

                notebookCells.push({
                    id: cellId,
                    cell_type: 'code',
                    source: dateInputBlock['variable'] + ' = ' + date_str + '\n',
                    metadata: {},
                    execution_count: null,
                    outputs: [],
                });
                break;
            }
            default: {
                // Handle unsupported or unknown block types gracefully
                notebookCells.push({
                    cell_type: 'raw',
                    source: `Unsupported block type: ${blockType}`,
                    metadata: { id: cellId },
                });
                break;
            }
        }
    }

    return {
        nbformat: 4,
        nbformat_minor: 4,
        metadata: {},
        cells: notebookCells,
    }
}

export function cutNotebook(notebook: any, targetId: string) {
    const run_cells = []
    for (const item of notebook.cells) {
        run_cells.push(item);
        if (item.id === targetId) {
            break;
        }
    }

    const cut_notebook = {
        nbformat: 4,
        nbformat_minor: 4,
        metadata: {},
        cells: run_cells
    }
    return cut_notebook
}


export async function saveNotebookToOSS(notebook: any, ossPath: string): Promise<boolean> {
    const rootDir = process.env['ROOT_DIR'] ?? '/opt/mindflow/';
    const tempPath = join(rootDir, `${ossPath}.ipynb`);

    try {
        // 创建目录（如果不存在）
        const dir = dirname(tempPath);
        await fs.mkdir(dir, { recursive: true });

        // Write notebook to temp file
        await fs.writeFile(tempPath, JSON.stringify(notebook, null, 2));

        const ossClient = new OssClient()
        ossClient.uploadFile(ossPath, tempPath)

        return true;
    } catch {
        return false;
    } finally {
        // Clean up temp file
        await fs.unlink(tempPath).catch(() => { });
    }
}