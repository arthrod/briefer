export const CONFIG = {
    RUN_ALL_URL: process.env['RUN_ALL_URL'],
    IS_MOCK: true,
    ENDPOINTS: {
        LIST: '/api/nodejs/experiment/run-all/jobs',
        STATUS: '/api/nodejs/experiment/run-all/job-status',
        APPROVE: '/api/nodejs/experiment/run-all/export-approve',
        DOWNLOAD: '/api/nodejs/experiment/run-all/result-download'
    }
}