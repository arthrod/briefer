export const CONFIG = {
    MANAGER_URL: process.env['MANAGER_URL'],
    IS_MOCK: false,
    ENDPOINTS: {
        LIST: '/api/nodejs/experiment/run-all/jobs',
        STATUS: '/api/nodejs/experiment/run-all/job-status',
        APPROVE: '/api/nodejs/experiment/run-all/export-approve',
        DOWNLOAD: '/api/nodejs/experiment/run-all/result-download',
        RUN: '/api/nodejs/run-all/create-version'
    }
}