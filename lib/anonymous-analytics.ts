"use client";

import type { AnonymousEventName } from "@/lib/analytics-events";

type TrackOptions = {
  oncePerSession?: boolean;
};

const SESSION_PREFIX = "shubing-anonymous-event:";

/**
 * Sends only an event name. Tracking failures are intentionally silent so they
 * can never block connecting, previewing, or downloading a wallpaper.
 */
export function trackAnonymousEvent(
  event: AnonymousEventName,
  { oncePerSession = false }: TrackOptions = {}
) {
  if (typeof window === "undefined") return;

  const sessionKey = `${SESSION_PREFIX}${event}`;
  if (oncePerSession && window.sessionStorage.getItem(sessionKey) === "1") return;

  void fetch("/api/analytics", {
    method: "POST",
    cache: "no-store",
    credentials: "omit",
    keepalive: true,
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event })
  })
    .then((response) => {
      if (response.ok && oncePerSession) {
        window.sessionStorage.setItem(sessionKey, "1");
      }
    })
    .catch(() => undefined);
}
