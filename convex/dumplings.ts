import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { isFillingOpen, requireMember, sessionArgs } from "./lib";

const MAX_BYTES = 80 * 1024 * 1024;

export const generateUploadUrl = mutation({
  args: sessionArgs,
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireMember(ctx, args);
    return await ctx.storage.generateUploadUrl();
  },
});

export const fold = mutation({
  args: {
    ...sessionArgs,
    fillingId: v.id("fillings"),
    storageId: v.id("_storage"),
    mediaType: v.union(v.literal("video"), v.literal("audio")),
  },
  returns: v.id("dumplings"),
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx, args);
    const filling = await ctx.db.get("fillings", args.fillingId);
    if (!filling || filling.tableId !== member.tableId) throw new ConvexError("That Filling belongs to another Table.");
    if (!(await isFillingOpen(ctx, filling))) throw new ConvexError("That Filling has closed. Fold today's instead.");
    const existing = await ctx.db
      .query("dumplings")
      .withIndex("by_fillingId_and_memberId", (q) => q.eq("fillingId", filling._id).eq("memberId", member._id))
      .first();
    if (existing) throw new ConvexError("You already folded today.");
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (!file) throw new ConvexError("The upload did not arrive. Try again.");
    if (file.size > MAX_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("That clip is too large.");
    }
    const dumplingId = await ctx.db.insert("dumplings", {
      tableId: member.tableId,
      memberId: member._id,
      fillingId: filling._id,
      date: filling.date,
      mediaStorageId: args.storageId,
      mediaType: args.mediaType,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.ai.processDumpling, { dumplingId });
    return dumplingId;
  },
});
