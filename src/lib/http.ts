import { ensureEngine } from "./engine";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function fail(err: unknown, status = 400) {
  const message = err instanceof Error ? err.message : String(err);
  return Response.json({ error: message }, { status });
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export { ensureEngine };
