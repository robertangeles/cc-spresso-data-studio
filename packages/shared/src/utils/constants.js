export const FLOW_STATUSES = ['draft', 'published', 'archived'];
export const PROVIDER_TYPES = ['anthropic', 'openai', 'xai', 'gemini', 'mistral'];
export const API_ROUTES = {
    AUTH: {
        REGISTER: '/api/auth/register',
        LOGIN: '/api/auth/login',
        REFRESH: '/api/auth/refresh',
        LOGOUT: '/api/auth/logout',
    },
    FLOWS: {
        BASE: '/api/flows',
        BY_ID: (id) => `/api/flows/${id}`,
    },
};
export const PAGINATION_DEFAULTS = {
    PAGE: 1,
    LIMIT: 20,
    MAX_LIMIT: 100,
};
//# sourceMappingURL=constants.js.map