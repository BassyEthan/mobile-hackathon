/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as asks from "../asks.js";
import type * as chef from "../chef.js";
import type * as connectionCheck from "../connectionCheck.js";
import type * as crons from "../crons.js";
import type * as dumplings from "../dumplings.js";
import type * as feasts from "../feasts.js";
import type * as lib from "../lib.js";
import type * as reactions from "../reactions.js";
import type * as schedule from "../schedule.js";
import type * as seed from "../seed.js";
import type * as sparks from "../sparks.js";
import type * as tables from "../tables.js";
import type * as today from "../today.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  asks: typeof asks;
  chef: typeof chef;
  connectionCheck: typeof connectionCheck;
  crons: typeof crons;
  dumplings: typeof dumplings;
  feasts: typeof feasts;
  lib: typeof lib;
  reactions: typeof reactions;
  schedule: typeof schedule;
  seed: typeof seed;
  sparks: typeof sparks;
  tables: typeof tables;
  today: typeof today;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
