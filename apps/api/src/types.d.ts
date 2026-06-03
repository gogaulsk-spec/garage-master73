declare module "pg" {
  export interface QueryResult<T = any> {
    rows: T[];
    rowCount: number | null;
  }
  export interface PoolClient {
    query<T = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    release(): void;
  }
  export class Pool {
    constructor(config?: Record<string, unknown>);
    connect(): Promise<PoolClient>;
    query<T = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    end(): Promise<void>;
  }
}
