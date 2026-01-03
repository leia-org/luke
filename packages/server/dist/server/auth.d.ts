import type { IncomingMessage } from 'http';
import type { AuthConfig } from '../types.js';
export declare function authenticate<TUser>(req: IncomingMessage, authConfig: AuthConfig<TUser>): Promise<TUser | null>;
//# sourceMappingURL=auth.d.ts.map