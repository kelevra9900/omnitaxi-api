import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestWithUser extends Request {
  user: {
    id: string;
    email: string;
    name: string;
    role: string[];
    isActive: boolean;
  };
}
export const GetUserId = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  const user = request;
  return user.user.id;
});
