export declare const FLOW_STATUSES: readonly ['draft', 'published', 'archived'];
export declare const PROVIDER_TYPES: readonly ['anthropic', 'openai', 'xai', 'gemini', 'mistral'];
export declare const API_ROUTES: {
  readonly AUTH: {
    readonly REGISTER: '/api/auth/register';
    readonly LOGIN: '/api/auth/login';
    readonly REFRESH: '/api/auth/refresh';
    readonly LOGOUT: '/api/auth/logout';
  };
  readonly FLOWS: {
    readonly BASE: '/api/flows';
    readonly BY_ID: (id: string) => string;
  };
};
export declare const PAGINATION_DEFAULTS: {
  readonly PAGE: 1;
  readonly LIMIT: 20;
  readonly MAX_LIMIT: 100;
};
//# sourceMappingURL=constants.d.ts.map
