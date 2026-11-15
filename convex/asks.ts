import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { dateInZone, isDate, requireMember, sessionArgs, weekOfFor } from "./lib";

export const ASK_MAX_LENGTH = 140;

export const status = query({
  args: { ...sessionArgs, date: v.string() },
  returns: v.object({ askedThisWeek: v.boolean() }),
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx, args);
    if (!isDate(args.date)) return { askedThisWeek: false };
    const asked = await ctx.db
      .query("askQueue")
      .withIndex("by_authorId_and_weekOf", (q) => q.eq("authorId", member._id).eq("weekOf", weekOfFor(args.date)))
      .first();
    return { askedThisWeek: asked !== null };
  },
});

export const submit = mutation({
  args: { ...sessionArgs, text: v.string(), addressedTo: v.optional(v.id("members")) },
  returns: v.id("askQueue"),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const text = args.text.trim().replace(/\s+/g, " ");
    if (text.length < 3 || text.length > ASK_MAX_LENGTH) throw new ConvexError(`Questions need 3 to ${ASK_MAX_LENGTH} characters.`);
    if (args.addressedTo) {
      const target = await ctx.db.get("members", args.addressedTo);
      if (!target || target.tableId !== table._id) throw new ConvexError("Pick someone at this Table.");
      if (target._id === member._id) throw new ConvexError("Ask the Table, or pick someone else.");
    }
    const now = Date.now();
    const weekOf = weekOfFor(dateInZone(now, table.timeZone));
    const existing = await ctx.db
      .query("askQueue")
      .withIndex("by_authorId_and_weekOf", (q) => q.eq("authorId", member._id).eq("weekOf", weekOf))
      .first();
    if (existing) throw new ConvexError("You already asked this week. Ask again next week.");
    return await ctx.db.insert("askQueue", {
      tableId: table._id,
      authorId: member._id,
      text,
      ...(args.addressedTo ? { addressedTo: args.addressedTo } : {}),
      weekOf,
      createdAt: now,
    });
  },
});
