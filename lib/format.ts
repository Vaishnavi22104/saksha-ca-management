export const TIMEZONE = "Asia/Kolkata";

const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TIMEZONE, day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIMEZONE, day: "2-digit", month: "short", hour: "numeric", minute: "2-digit",
});
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "numeric", hourCycle: "h23" });

export const formatDate = (d: string | Date) => dateFmt.format(new Date(d));
export const formatDateTime = (d: string | Date) => dateTimeFmt.format(new Date(d));
/** YYYY-MM-DD in firm time. */
export const dayKey = (d: string | Date | number) => dayKeyFmt.format(new Date(d));

/** Date input value (YYYY-MM-DD) -> 5:00 PM IST that day. */
export const dueDateFromInput = (value: string) => `${value}T17:00:00+05:30`;

export function greeting(now = new Date()) {
  const h = Number(hourFmt.format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function currentFinancialYear(now = new Date()) {
  const [y, m] = dayKey(now).split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
