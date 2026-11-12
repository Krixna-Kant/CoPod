import { ensureEngine } from "@/lib/http";
import { subscribe } from "@/lib/store";
import { roomView } from "@/lib/view";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  ensureEngine();
  const { roomId } = await params;
  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let last = 0;
      let queued: NodeJS.Timeout | undefined;
      const send = () => {
        queued = undefined;
        last = Date.now();
        const v = roomView(roomId);
        if (!v) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(v)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const schedule = () => {
        if (queued) return;
        queued = setTimeout(send, Math.max(0, 700 - (Date.now() - last)));
      };
      const unsub = subscribe(schedule);
      const heartbeat = setInterval(schedule, 3000);
      send();
      cleanup = () => {
        unsub();
        clearInterval(heartbeat);
        if (queued) clearTimeout(queued);
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
