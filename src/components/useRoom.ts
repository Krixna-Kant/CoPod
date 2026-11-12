"use client";

import { useEffect, useState } from "react";
import type { RoomView } from "@/lib/view";

export function useRoom(roomId: string) {
  const [view, setView] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      es = new EventSource(`/api/rooms/${roomId}/stream`);
      es.onopen = () => setConnected(true);
      es.onmessage = (e) => setView(JSON.parse(e.data));
      es.onerror = () => {
        setConnected(false);
        es?.close();
        retry = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, [roomId]);

  return { view, connected };
}

export type Identity = { memberId: string; apiKey: string; name: string };

export function loadIdentity(roomId: string): Identity | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(`copod:${roomId}`) ?? "null");
  } catch {
    return null;
  }
}

export function saveIdentity(roomId: string, id: Identity | null) {
  if (id) localStorage.setItem(`copod:${roomId}`, JSON.stringify(id));
  else localStorage.removeItem(`copod:${roomId}`);
}

export async function post<T = Record<string, unknown>>(url: string, data?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message ?? j.error ?? `Request failed (${res.status})`);
  return j as T;
}
