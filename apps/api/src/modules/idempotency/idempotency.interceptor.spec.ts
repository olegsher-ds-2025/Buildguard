import { ConflictException, ExecutionContext, CallHandler } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { firstValueFrom, of, throwError } from "rxjs";
import { IdempotencyInterceptor } from "./idempotency.interceptor";
import type { PrismaService } from "../../prisma/prisma.service";

const duplicate = () => new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });

function makeInterceptor(opts: { claimError?: Error; existing?: object | null } = {}) {
  const prisma = {
    idempotencyKey: {
      create: jest.fn().mockImplementation(() => (opts.claimError ? Promise.reject(opts.claimError) : Promise.resolve({}))),
      findUnique: jest.fn().mockResolvedValue(opts.existing ?? null),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
  return { interceptor: new IdempotencyInterceptor(prisma), prisma };
}

const context = (method: string, key?: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ method, path: "/api/v1/x", user: { sub: "u1" }, header: () => key }) }),
    getHandler: () => () => undefined,
  }) as unknown as ExecutionContext;

const handler = (value: unknown): CallHandler => ({ handle: jest.fn().mockReturnValue(of(value)) });

describe("IdempotencyInterceptor", () => {
  it("passes requests without a key, and reads, straight through", async () => {
    const { interceptor, prisma } = makeInterceptor();
    expect(await firstValueFrom(await interceptor.intercept(context("POST"), handler("a")))).toBe("a");
    expect(await firstValueFrom(await interceptor.intercept(context("GET", "k"), handler("b")))).toBe("b");
    expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it("runs the first request and stores a scoped, JSON-safe response", async () => {
    const { interceptor, prisma } = makeInterceptor();
    const next = handler({ id: 1, amount: 5n });
    (BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
      return this.toString();
    };
    await firstValueFrom(await interceptor.intercept(context("POST", "abc"), next));
    expect((prisma.idempotencyKey.create as jest.Mock).mock.calls[0][0].data.key).toBe("u1:POST:/api/v1/x:abc");
    expect((prisma.idempotencyKey.update as jest.Mock).mock.calls[0][0].data).toMatchObject({ statusCode: 201, responseBody: { id: 1, amount: "5" } });
  });

  it("replays the stored response for a repeat without running the handler again", async () => {
    const { interceptor } = makeInterceptor({ claimError: duplicate(), existing: { statusCode: 201, responseBody: { id: 1 } } });
    const next = handler("new");
    expect(await firstValueFrom(await interceptor.intercept(context("POST", "abc"), next))).toEqual({ id: 1 });
    expect(next.handle).not.toHaveBeenCalled();
  });

  it("rejects a repeat while the first is still in progress", async () => {
    const { interceptor } = makeInterceptor({ claimError: duplicate(), existing: { statusCode: null, responseBody: null } });
    await expect(firstValueFrom(await interceptor.intercept(context("POST", "abc"), handler("x")))).rejects.toThrow(ConflictException);
  });

  it("releases the key when the request fails, so a retry can run", async () => {
    const { interceptor, prisma } = makeInterceptor();
    const failing: CallHandler = { handle: () => throwError(() => new Error("boom")) };
    await expect(firstValueFrom(await interceptor.intercept(context("POST", "abc"), failing))).rejects.toThrow("boom");
    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalled();
  });

  it("surfaces unexpected database errors rather than swallowing them", async () => {
    const { interceptor } = makeInterceptor({ claimError: new Error("db down") });
    await expect(firstValueFrom(await interceptor.intercept(context("POST", "abc"), handler("x")))).rejects.toThrow("db down");
  });
});
