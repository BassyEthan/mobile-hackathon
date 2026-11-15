import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("daily Fillings in each Table's time zone", { minuteUTC: 5 }, internal.schedule.dailyFillings, {});
crons.hourly("Sunday Feast after 5 PM in each Table's time zone", { minuteUTC: 10 }, internal.schedule.sundayFeasts, {});

export default crons;
