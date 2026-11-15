import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { canSeeDumpling, requireMember, sessionArgs } from "./lib";

export const TAP_KINDS = ["heart", "laugh", "wow", "cry", "yum"];

async function visibleDumpling(ctx: MutationCtx, member: Doc<"members">, dumplingId: Id<"dumplings">) {
  const dumpling = await ctx.db.get("dumplings", dumplingId);
  if (!dumpling || !(await canSeeDumpling(ctx, member, dumpling))) {
    throw new ConvexError("Fold anything today to lift the lid first.");
  }
  return dumpling;
}

export const tap = mutation({
  args: { ...sessionArgs, dumplingId: v.id("dumplings"), kind: v.string() },
  returns: v.object({ added: v.boolean(), reactionId: v.union(v.id("reactions"), v.null()) }),
  handler: async (ctx, args) => {
    if (!TAP_KINDS.includes(args.kind)) throw new ConvexError("Unknown reaction.");
    const { member } = await requireMember(ctx, args);
    await visibleDumpling(ctx, member, args.dumplingId);
    for await (const reaction of ctx.db.query("reactions").withIndex("by_dumplingId", (q) => q.eq("dumplingId", args.dumplingId))) {
      if (reaction.memberId === member._id && reaction.kind === args.kind) {
        await ctx.db.delete("reactions", reaction._id);
        return { added: false, reactionId: null };
      }
    }
    const reactionId = await ctx.db.insert("reactions", {
      dumplingId: args.dumplingId,
      memberId: member._id,
      kind: args.kind,
      createdAt: Date.now(),
    });
    return { added: true, reactionId };
  },
});

export const voice = mutation({
  args: { ...sessionArgs, dumplingId: v.id("dumplings"), storageId: v.id("_storage") },
  returns: v.id("reactions"),
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx, args);
    await visibleDumpling(ctx, member, args.dumplingId);
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (!file || file.size > 5 * 1024 * 1024) throw new ConvexError("That voice note did not upload. Try again.");
    return await ctx.db.insert("reactions", {
      dumplingId: args.dumplingId,
      memberId: member._id,
      kind: "voice",
      audioStorageId: args.storageId,
      createdAt: Date.now(),
    });
  },
});
