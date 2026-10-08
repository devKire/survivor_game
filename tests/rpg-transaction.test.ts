import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client";
import { db } from "../src/server/db";
import {
  isRpgSerializationFailure,
  rpgTransaction,
} from "../src/server/rpg/transaction";

vi.mock("../src/server/db", () => ({ db: vi.fn() }));
const transact = vi.fn();
const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("internal", {
    code,
    clientVersion: "7.10.0",
    meta,
  });
beforeEach(() => {
  vi.stubEnv("RPG_ENABLED", "true");
  vi.mocked(db).mockReturnValue({
    $transaction: transact,
  } as unknown as ReturnType<typeof db>);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it("recognizes Prisma and adapter PostgreSQL aborts, never connection/ambiguous commit failures", () => {
  const driver = {
    name: "DriverAdapterError",
    cause: { kind: "TransactionWriteConflict", originalCode: "40001" },
  };
  for (const error of [
    prismaError("P2034"),
    prismaError("P2010", { code: "40P01" }),
    prismaError("P2010", { driverAdapterError: driver }),
    driver,
  ])
    expect(isRpgSerializationFailure(error)).toBe(true);
  for (const error of [
    prismaError("P2002"),
    prismaError("P2003"),
    prismaError("P2028"),
    prismaError("P2010", { code: "08006" }),
    new Error("40001"),
    { code: "P2034" },
  ])
    expect(isRpgSerializationFailure(error)).toBe(false);
});

it("retries at most three whole transactions then gives safe retry feedback", async () => {
  transact.mockRejectedValue(prismaError("P2034"));
  await expect(rpgTransaction(vi.fn())).rejects.toThrow("mesmo pedido");
  expect(transact).toHaveBeenCalledTimes(3);
});

it("returns a subsequent success but never retries an unknown error", async () => {
  transact
    .mockRejectedValueOnce(prismaError("P2034"))
    .mockResolvedValueOnce("committed");
  expect(await rpgTransaction(vi.fn())).toBe("committed");
  expect(transact).toHaveBeenCalledTimes(2);
  transact
    .mockClear()
    .mockRejectedValue(new Error("connection lost while committing"));
  await expect(rpgTransaction(vi.fn())).rejects.toThrow("connection lost");
  expect(transact).toHaveBeenCalledTimes(1);
});
