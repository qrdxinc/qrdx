import "server-only";

import { conversion, database as db, qrCode } from "@repo/database";
import { and, asc, count, desc, eq, gte, inArray, sql, sum } from "drizzle-orm";
import { scopeCodesWhere } from "@/app/(app)/dashboard/analytics/_lib/queries";
import type { ActiveScope } from "@/lib/scope";

// Conversions in the dashboard's analytics: the code page's card and the
// workspace's summary (./analytics-cards.tsx). Callers check the licence
// (and, for the workspace, the plan: ./access.ts) before asking.

export interface ConversionSummary {
  count: number;
  /** Revenue per currency (decimal strings) */
  revenue: { currency: string | null; total: string; count: number }[];
  names: { name: string; count: number }[];
}

/** Conversions of one code, or of every code of the workspace. */
export async function getConversionSummary(
  target: { qrCodeId: string } | { scope: ActiveScope },
  from: Date,
): Promise<ConversionSummary> {
  const where = and(
    "qrCodeId" in target
      ? eq(conversion.qrCodeId, target.qrCodeId)
      : inArray(
          conversion.qrCodeId,
          db
            .select({ id: qrCode.id })
            .from(qrCode)
            .where(scopeCodesWhere(target.scope)),
        ),
    gte(conversion.createdAt, from),
  );
  const [revenue, names] = await db.batch([
    db
      .select({
        currency: conversion.currency,
        total: sql<string>`coalesce(${sum(conversion.value)}, 0)::text`,
        count: count(),
      })
      .from(conversion)
      .where(where)
      .groupBy(conversion.currency)
      .orderBy(desc(count())),
    db
      .select({ name: conversion.name, count: count() })
      .from(conversion)
      .where(where)
      .groupBy(conversion.name)
      .orderBy(desc(count()), asc(conversion.name))
      .limit(10),
  ]);
  return {
    count: revenue.reduce((total, row) => total + row.count, 0),
    revenue,
    names,
  };
}
