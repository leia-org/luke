import { type Server as HttpServer } from 'http';
import type { LukeServerConfig } from '../types.js';
export declare function createLukeServer<TUser, TSession>(config: LukeServerConfig<TUser, TSession>): LukeServerInstance;
export interface LukeServerInstance {
    listen(port: number, callback?: () => void): void;
    close(): Promise<void>;
    readonly httpServer: HttpServer;
}
//# sourceMappingURL=ws-server.d.ts.map