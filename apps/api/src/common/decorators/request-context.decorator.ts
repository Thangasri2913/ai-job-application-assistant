import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Per-request metadata passed to services that record audit events. */
export interface RequestContext {
  requestId?: string;
}

export const ReqContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext => {
    const request = context.switchToHttp().getRequest<Request & { id?: string | number }>();
    return { requestId: request.id === undefined ? undefined : String(request.id) };
  },
);
