import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

export class NotebookConverter {
    /**
     * Convert a Jupyter notebook file to PDF format
     * @param inputPath Path to the input .ipynb file
     * @param outputPath Path where the output PDF will be saved
     * @throws Error if conversion fails
     */
    public async convertFile(inputPath: string, outputPath: string): Promise<void> {
        try {
            // Verify input file exists
            if (!fs.existsSync(inputPath)) {
                throw new Error(`Input file not found: ${inputPath}`);
            }

            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Convert notebook to PDF using nbconvert with options for cleaner output
            const { stdout, stderr } = await execAsync(`jupyter nbconvert --to pdf "${inputPath}" --no-input --output "${outputPath}"`);

            // Log conversion output for debugging
            if (stdout) console.log('Conversion output:', stdout);
            if (stderr) console.log('Conversion stderr:', stderr);

            if (stderr && !stderr.includes('Writing')) {
                throw new Error(`Conversion error: ${stderr}`);
            }

            console.log('Conversion successful, output file exists:', outputPath);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Conversion error:', errorMessage);
            throw new Error(`Failed to convert notebook: ${errorMessage}`);
        }
    }

    /**
     * Convert a Jupyter notebook object to PDF
     * @param notebook The notebook object to convert
     * @returns Buffer containing the PDF file content
     * @throws Error if conversion fails
     */
    public async convert(notebook: any): Promise<Buffer> {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notebook-conversion-'));
        const tempInputPath = path.join(tempDir, 'temp.ipynb');
        const tempOutputPath = path.join(tempDir, 'temp.pdf');
        const tempImagesDir = path.join(tempDir, 'images');

        try {
            // Create images directory
            if (!fs.existsSync(tempImagesDir)) {
                fs.mkdirSync(tempImagesDir);
            }

            // Process notebook cells to ensure proper format
            const processedNotebook = {
                nbformat: notebook.nbformat,
                nbformat_minor: notebook.nbformat_minor,
                metadata: notebook.metadata,
                cells: notebook.cells.map((cell: any, index: number) => {
                    // Convert cell types
                    if (cell.cell_type === 'rich_text') {
                        cell.cell_type = 'markdown';
                    } else if (cell.cell_type === 'sql') {
                        cell.cell_type = 'code';
                    }

                    // Process source content
                    let source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;

                    // Handle base64 images in markdown cells
                    if (cell.cell_type === 'markdown') {
                        // Extract and save base64 images
                        source = source.replace(/!\[([^\]]*)\]\((data:image\/([^;]+);base64,([^)]+))\)/g,
                            (match: string, altText: string, dataUrl: string, imageType: string, base64Data: string) => {
                                try {
                                    const imageFileName = `image_${index}_${Date.now()}.${imageType}`;
                                    const imagePath = path.join(tempImagesDir, imageFileName);

                                    // Decode and save the image
                                    const imageBuffer = Buffer.from(base64Data, 'base64');
                                    fs.writeFileSync(imagePath, imageBuffer);

                                    // Return LaTeX compatible image reference
                                    return `\\begin{figure}[H]
                                            \\centering
                                            \\includegraphics[width=\\textwidth]{${path.join('images', imageFileName)}}
                                            ${altText ? `\\caption{${altText}}` : ''}
                                            \\end{figure}`;
                                } catch (error) {
                                    console.error('Error saving image:', error);
                                    return match; // Keep original if failed
                                }
                            }
                        );
                    }

                    // 创建一个新的 cell 对象，只包含标准属性
                    const standardCell: any = {
                        cell_type: cell.cell_type,
                        source: Array.isArray(cell.source) ? cell.source : [source],
                        metadata: {
                            ...cell.metadata,
                            trusted: true
                        }
                    };

                    // 对于代码单元格，添加必要的属性
                    if (cell.cell_type === 'code') {
                        standardCell.execution_count = null;
                        standardCell.outputs = [];
                    }

                    return standardCell;
                })
            };

            // Write the notebook object to a temporary file
            await writeFileAsync(tempInputPath, JSON.stringify(processedNotebook, null, 2));

            // Convert the temporary file
            await this.convertFile(tempInputPath, tempOutputPath);

            // Read the resulting PDF
            const pdfBuffer = fs.readFileSync(tempOutputPath);

            return pdfBuffer;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to convert notebook: ${errorMessage}`);
        } finally {
            // Clean up temporary files
            try {
                if (fs.existsSync(tempInputPath)) await unlinkAsync(tempInputPath);
                if (fs.existsSync(tempOutputPath)) await unlinkAsync(tempOutputPath);
                // Clean up image files
                if (fs.existsSync(tempImagesDir)) {
                    const files = fs.readdirSync(tempImagesDir);
                    for (const file of files) {
                        await unlinkAsync(path.join(tempImagesDir, file));
                    }
                    fs.rmdirSync(tempImagesDir);
                }
                if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Error cleaning up temporary files:', errorMessage);
            }
        }
    }
}
