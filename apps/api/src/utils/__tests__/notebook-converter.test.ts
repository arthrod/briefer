// Create mock functions
const mockExec = jest.fn();
const mockExecAsync = jest.fn();
const mockWriteFile = jest.fn();
const mockWriteFileAsync = jest.fn();
const mockUnlink = jest.fn();
const mockUnlinkAsync = jest.fn();
const mockExistSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockRmdirSync = jest.fn();
const mockMkdtempSync = jest.fn();
const mockTmpdir = jest.fn(() => '/tmp');

// Setup mocks before importing the module
jest.doMock('child_process', () => ({
    exec: mockExec
}));

jest.doMock('os', () => ({
    tmpdir: mockTmpdir
}));

jest.doMock('fs', () => ({
    existsSync: mockExistSync,
    mkdirSync: mockMkdirSync,
    writeFile: mockWriteFile,
    readFileSync: mockReadFileSync,
    rmdirSync: mockRmdirSync,
    mkdtempSync: mockMkdtempSync,
    unlink: mockUnlink
}));

jest.doMock('util', () => ({
    ...jest.requireActual('util'),
    promisify: (fn: any) => {
        if (fn === mockExec) return mockExecAsync;
        if (fn === mockWriteFile) return mockWriteFileAsync;
        if (fn === mockUnlink) return mockUnlinkAsync;
        return fn;
    }
}));

// Import the module after setting up mocks
import { NotebookConverter } from '../notebook-converter';

describe('NotebookConverter', () => {
    let converter: NotebookConverter;
    
    beforeEach(() => {
        converter = new NotebookConverter();
        // Clear all mocks before each test
        jest.clearAllMocks();
        
        // Setup default mock implementations
        mockExistSync.mockReturnValue(true);
        mockMkdtempSync.mockReturnValue('/tmp/test-dir');
        mockReadFileSync.mockReturnValue(Buffer.from('mock pdf content'));
        
        // Setup default async mock implementations
        mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
        mockWriteFileAsync.mockResolvedValue(undefined);
        mockUnlinkAsync.mockResolvedValue(undefined);
    });

    describe('convertFile', () => {
        it('should successfully convert notebook to PDF', async () => {
            // Mock successful execution
            mockExecAsync.mockResolvedValue({ stdout: '', stderr: 'Writing 5 pages' });

            await expect(converter.convertFile('input.ipynb', 'output.pdf'))
                .resolves.toBeUndefined();

            // Verify exec was called with correct command
            expect(mockExecAsync).toHaveBeenCalledWith(
                'jupyter nbconvert --to pdf "input.ipynb" --output "output.pdf"'
            );
        }, 10000);

        it('should create output directory if it does not exist', async () => {
            // Mock directory does not exist
            mockExistSync
                .mockReturnValueOnce(true)  // input file exists
                .mockReturnValueOnce(false); // output directory doesn't exist

            mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

            await converter.convertFile('input.ipynb', 'output.pdf');

            expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
        }, 10000);

        it('should throw error if input file does not exist', async () => {
            // Mock input file does not exist
            mockExistSync.mockReturnValue(false);

            await expect(converter.convertFile('nonexistent.ipynb', 'output.pdf'))
                .rejects.toThrow('Input file not found');
        });

        it('should throw error if conversion fails', async () => {
            // Mock conversion failure
            mockExecAsync.mockRejectedValue(new Error('Conversion failed'));

            await expect(converter.convertFile('input.ipynb', 'output.pdf'))
                .rejects.toThrow('Failed to convert notebook');
        });
    });

    describe('convertBuffer', () => {
        const mockBuffer = Buffer.from('mock notebook content');

        beforeEach(() => {
            // Mock file existence checks for cleanup
            mockExistSync
                .mockReturnValueOnce(true)  // tempInputPath exists
                .mockReturnValueOnce(true)  // tempOutputPath exists
                .mockReturnValueOnce(true); // tempDir exists
        });

        it('should successfully convert buffer to PDF', async () => {
            // Mock successful conversion
            mockExecAsync.mockResolvedValue({ stdout: '', stderr: 'Writing 5 pages' });

            const result = await converter.convertBuffer(mockBuffer);

            expect(result).toBeInstanceOf(Buffer);
            expect(mockWriteFileAsync).toHaveBeenCalledWith(
                expect.stringContaining('temp.ipynb'),
                mockBuffer
            );
            expect(mockReadFileSync).toHaveBeenCalled();
        }, 10000);

        it('should clean up temporary files after successful conversion', async () => {
            // Mock successful conversion
            mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

            await converter.convertBuffer(mockBuffer);

            // Verify cleanup
            expect(mockUnlinkAsync).toHaveBeenCalledTimes(2); // Should be called for both input and output files
            expect(mockRmdirSync).toHaveBeenCalledWith('/tmp/test-dir');
        }, 10000);

        it('should clean up temporary files even if conversion fails', async () => {
            // Mock conversion failure
            mockExecAsync.mockRejectedValue(new Error('Conversion failed'));

            await expect(converter.convertBuffer(mockBuffer))
                .rejects.toThrow('Failed to convert notebook buffer');

            // Verify cleanup was still attempted
            expect(mockUnlinkAsync).toHaveBeenCalled();
            expect(mockRmdirSync).toHaveBeenCalled();
        }, 10000);
    });
});
