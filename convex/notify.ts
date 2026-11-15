import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { dateInZone, localHour } from "./lib";

/** A family app should feel like a letter, not a feed: at most two a day per person. */
export const DAILY_LIMIT = 2;
const DEFAULT_FROM_HOUR = 8;
const QUIET_FROM_HOUR = 22;

type Notice = { memberIds: Id<"members">[]; kind: string; title: string; body: string; url: string };

/**
 * Every notification names a person or an event and deep links to the exact thing it mentions.
 * There is deliberately no "you haven't posted" reminder anywhere in Dumpling.
 */
export async function notify(ctx: MutationCtx, notice: Notice) {
  if (notice.memberIds.length === 0) return;
  await ctx.scheduler.runAfter(0, internal.notify.send, notice);
}

export const reserve = internalMutation({
  args: { memberIds: v.array(v.id("members")), kind: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const now = Date.now();
    const tokens: string[] = [];
    for (const memberId of args.memberIds) {
      const member = await ctx.db.get("members", memberId);
      if (!member?.pushToken || member.leftAt) continue;
      const table = await ctx.db.get("tables", member.tableId);
      if (!table) continue;
      const hour = localHour(now, table.timeZone);
      if (hour < (member.notifyFrom ?? DEFAULT_FROM_HOUR) || hour >= QUIET_FROM_HOUR) continue;
      const date = dateInZone(now, table.timeZone);
      const sent = await ctx.db
        .query("notifications")
        .withIndex("by_memberId_and_date", (q) => q.eq("memberId", memberId).eq("date", date))
        .take(DAILY_LIMIT + 1);
      if (sent.length >= DAILY_LIMIT || sent.some((n) => n.kind === args.kind)) continue;
      await ctx.db.insert("notifications", { memberId, date, kind: args.kind, createdAt: now });
      tokens.push(member.pushToken);
    }
    return tokens;
  },
});

export const send = internalAction({
  args: { memberIds: v.array(v.id("members")), kind: v.string(), title: v.string(), body: v.string(), url: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tokens: string[] = await ctx.runMutation(internal.notify.reserve, { memberIds: args.memberIds, kind: args.kind });
    if (tokens.length === 0) return null;
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(tokens.map((to) => ({ to, title: args.title, body: args.body, sound: "default", data: { url: args.url } }))),
    });
    if (!response.ok) console.error(`Push send failed with status ${response.status}`);
    return null;
  },
});
