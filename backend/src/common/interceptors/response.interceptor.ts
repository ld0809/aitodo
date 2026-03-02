import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, { code: number; message: string; data: T }> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<{ code: number; message: string; data: T }> {
    return next.handle().pipe(
      map((data: T) => ({
        code: 0,
        message: 'ok',
        data,
      })),
    );
  }
}
