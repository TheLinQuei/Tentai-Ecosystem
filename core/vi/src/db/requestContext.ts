/**
 * Request Context Storage
 * Uses AsyncLocalStorage to carry userId + sessionId through async call chain
 * Eliminates the need to thread context through deep brain calls
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  userId: string;
  sessionId: string;
}

let requestContextStore = new AsyncLocalStorage<RequestContext>();

export function setRequestContext(context: RequestContext): void {
  requestContextStore.enterWith(context);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStore.getStore();
}

export function resetRequestContext(): void {
  requestContextStore.disable();
  requestContextStore = new AsyncLocalStorage<RequestContext>();
}

/**
 * Wrapper for Fastify request handlers to set context
 */
export function withRequestContext(handler: (context: RequestContext) => Promise<any>) {
  return async (req: any) => {
    const context: RequestContext = {
      userId: req.user?.id || req.body?.userId || 'system',
      sessionId: req.body?.sessionId || req.query?.sessionId || 'system',
    };
    return new Promise((resolve, reject) => {
      requestContextStore.run(context, () => {
        handler(context).then(resolve).catch(reject);
      });
    });
  };
}
