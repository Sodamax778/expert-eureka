import "server-only";
import { randomUUID } from "node:crypto";

import { getStore } from "@edgeone/pages-blob";
import {
  anonymousEventNames,
  type AnonymousEventName
} from "@/lib/analytics-events";

const STORE_NAME = "shubing-anonymous-counters";
const COUNTER_SHARDS = 16;
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

type CounterValue = {
  count: number;
};

export type DailyAnonymousCounters = Record<AnonymousEventName, number> & {
  date: string;
};

const localCounters = new Map<string, number>();

function dateInShanghai(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function counterKey(date: string, event: AnonymousEventName, shard: number) {
  return `daily/${date.slice(0, 7)}/${date}/${event}/${String(shard).padStart(2, "0")}.json`;
}

function emptyDay(date: string): DailyAnonymousCounters {
  return {
    date,
    page_open: 0,
    weread_connected: 0,
    preview_generated: 0,
    image_downloaded: 0
  };
}

function datesThroughToday(days: number) {
  const result: string[] = [];
  const now = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    result.push(dateInShanghai(new Date(now.getTime() - offset * 86_400_000)));
  }
  return result;
}

function isLocalDevelopment() {
  return process.env.NODE_ENV !== "production";
}

export async function incrementAnonymousCounter(event: AnonymousEventName) {
  const date = dateInShanghai();
  const shard = Math.floor(Math.random() * COUNTER_SHARDS);
  const key = counterKey(date, event, shard);

  if (isLocalDevelopment()) {
    localCounters.set(key, (localCounters.get(key) ?? 0) + 1);
    return;
  }

  // Multiple small shards greatly reduce concurrent read-modify-write collisions
  // while keeping the stored data anonymous and aggregate-only.
  const store = getStore(STORE_NAME);
  // Independent records avoid concurrent read/modify/write losses. No visitor ID.
  await store.setJSON(`events/${date.slice(0, 7)}/${date}/${event}/${randomUUID()}.json`, { count: 1 });
}

export async function readAnonymousCounters(days: number) {
  const dates = datesThroughToday(days);
  const wantedDates = new Set(dates);
  const daily = new Map(dates.map((date) => [date, emptyDay(date)]));
  const keyPattern = /^daily\/(\d{4}-\d{2})\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/\d{2}\.json$/;

  const addCounter = (key: string, count: number) => {
    const match = key.match(keyPattern);
    if (!match || !wantedDates.has(match[2])) return;
    const event = match[3];
    if (!anonymousEventNames.includes(event as AnonymousEventName)) return;
    daily.get(match[2])![event as AnonymousEventName] += Math.max(0, Number(count) || 0);
  };

  if (isLocalDevelopment()) {
    for (const [key, count] of localCounters) addCounter(key, count);
  } else {
    const store = getStore(STORE_NAME);
    const months = [...new Set(dates.map((date) => date.slice(0, 7)))];
    const listings = await Promise.all(
      months.map((month) =>
        store.list({ prefix: `daily/${month}/`, consistency: "strong" })
      )
    );
    const keys = listings.flatMap(({ blobs }) => blobs.map(({ key }) => key));
    const values = await Promise.all(
      keys.map((key) => store.get(key, { type: "json", consistency: "strong" }))
    );
    keys.forEach((key, index) => addCounter(key, Number((values[index] as CounterValue | null)?.count)));
    const eventListings = await Promise.all(months.map(month => store.list({ prefix: `events/${month}/`, consistency: "strong" })));
    for (const { blobs } of eventListings) for (const { key } of blobs) {
      const parts = key.split("/");
      if (parts.length === 5 && wantedDates.has(parts[2]) && anonymousEventNames.includes(parts[3] as AnonymousEventName)) daily.get(parts[2])![parts[3] as AnonymousEventName]++;
    }
  }

  const totals = Object.fromEntries(anonymousEventNames.map((event) => [event, 0])) as Record<
    AnonymousEventName,
    number
  >;
  const rows = dates.map((date) => daily.get(date)!);
  for (const row of rows) {
    for (const event of anonymousEventNames) totals[event] += row[event];
  }

  return {
    range: { days, startDate: dates[0], endDate: dates.at(-1) },
    totals,
    daily: rows
  };
}
