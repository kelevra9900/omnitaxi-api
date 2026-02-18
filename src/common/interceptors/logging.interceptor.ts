import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { Logger } from '@nestjs/common';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const { method, url, ip } = req;
    const userAgent = req.get('user-agent') ?? '-';
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = http.getResponse<Response>();
          this.logger.log(`Incoming Request: ${method} ${url}`);
          const statusCode = res.statusCode;
          const duration = Date.now() - start;
          this.logger.log(`${method} ${url} ${statusCode} ${duration}ms - ${ip} "${userAgent}"`);
        },
        error: (err) => {
          this.logger.log(`Request => ${JSON.stringify(req.headers.authorization)}`);
          const duration = Date.now() - start;
          const statusCode = (err as Error & { status?: number }).status ?? 500;
          this.logger.warn(
            `${method} ${url} ${statusCode} ${duration}ms - ${ip} "${userAgent}" - ${(err as Error).message}`,
          );
        },
      }),
    );
  }
}
