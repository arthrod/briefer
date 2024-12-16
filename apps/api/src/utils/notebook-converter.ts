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

            // Convert notebook to PDF using nbconvert
            const { stderr } = await execAsync(`jupyter nbconvert --to pdf "${inputPath}" --output "${outputPath}"`);

            if (stderr && !stderr.includes('Writing')) {
                throw new Error(`Conversion error: ${stderr}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to convert notebook: ${errorMessage}`);
        }
    }

    /**
     * Convert a Jupyter notebook from a buffer to PDF
     * @param notebookBuffer Buffer containing the .ipynb file content
     * @returns Buffer containing the PDF file content
     * @throws Error if conversion fails
     */
    public async convertBuffer(notebookBuffer: Buffer): Promise<Buffer> {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notebook-conversion-'));
        const tempInputPath = path.join(tempDir, 'temp.ipynb');
        const tempOutputPath = path.join(tempDir, 'temp.pdf');

        try {
            // Write the buffer to a temporary file
            await writeFileAsync(tempInputPath, notebookBuffer);

            // Convert the temporary file
            await this.convertFile(tempInputPath, tempOutputPath);

            // Read the resulting PDF
            const pdfBuffer = fs.readFileSync(tempOutputPath);

            return pdfBuffer;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to convert notebook buffer: ${errorMessage}`);
        } finally {
            // Clean up temporary files
            try {
                if (fs.existsSync(tempInputPath)) await unlinkAsync(tempInputPath);
                if (fs.existsSync(tempOutputPath)) await unlinkAsync(tempOutputPath);
                if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Error cleaning up temporary files:', errorMessage);
            }
        }
    }
}
