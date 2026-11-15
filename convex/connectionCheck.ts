import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";

export const recent = query({
  args: {},
  returns: v.array(schema.doc("connectionChecks")),
  handler: async (ctx) => {
    return await ctx.db.query("connectionChecks").order("desc").take(5);
  },
});

export const record = mutation({
  args: { source: v.string() },
  returns: v.id("connectionChecks"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("connectionChecks", { source: args.source });
  },
});
