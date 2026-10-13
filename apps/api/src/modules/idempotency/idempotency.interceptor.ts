import { CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from "@nestjs/common";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { from, mergeMap, Observable, of, catchError, throwError } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service";
import type { JwtPayload } from "../identity/jwt-payload";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Makes a mutating request safe to retry. A client (notably the offline queue)
 * sends `Idempotency-Key`; the first request runs and its response is stored,
 * and any repeat returns that stored response instead of running again. The key
 * is scoped to user, method and path, so reusing one elsewhere can't replay a
 * different endpoint's answer. Failed requests release the key so they can be retried.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const header = req.header("idempotency-key");
    if (!header || !MUTATING.has(req.method)) return next.handle();

    const key = `${req.user?.sub ?? "anon"}:${req.method}:${req.path}:${header}`;
    const statusCode: number =
      Reflect.getMetadata(HTTP_CODE_METADATA, context.getHandler()) ?? (req.method === "POST" ? 201 : 200);

    return from(this.claim(key)).pipe(
      mergeMap((existing) => {
        if (existing) {
          if (existing.statusCode === null) throw new ConflictException("A request with this Idempotency-Key is still in progress");
          return of(existing.responseBody ?? undefined);
        }
        return next.handle().pipe(
          mergeMap(async (body) => {
            if (body instanceof StreamableFile) await this.release(key);
            else await this.store(key, statusCode, body);
            return body;
          }),
          catchError((err) => from(this.release(key)).pipe(mergeMap(() => throwError(() => err)))),
        );
      }),
    );
  }

  /** Inserts the key; returns the existing record if another request already claimed it. */
  private async claim(key: string) {
    try {
      await this.prisma.idempotencyKey.create({ data: { key } });
      return null;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return this.prisma.idempotencyKey.findUnique({ where: { key } });
      }
      throw err;
    }
  }

  private async store(key: string, statusCode: number, body: unknown): Promise<void> {
    const json = body === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue);
    await this.prisma.idempotencyKey.update({ where: { key }, data: { statusCode, responseBody: json } });
  }

  private async release(key: string): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({ where: { key } });
  }
}
