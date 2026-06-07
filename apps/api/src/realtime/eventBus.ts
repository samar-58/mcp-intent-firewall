import type { Response } from "express";

export type SseEvent = {
  id: string;
  event: string;
  data: unknown;
  createdAt: string;
};

const clients = new Set<Response>();
let eventCounter = 0;

export function publishEvent(event: string, data: unknown) {
  const payload: SseEvent = {
    id: String((eventCounter += 1)),
    event,
    data,
    createdAt: new Date().toISOString(),
  };

  for (const client of clients) {
    writeEvent(client, payload);
  }

  return payload;
}

export function addSseClient(response: Response) {
  clients.add(response);

  writeEvent(response, {
    id: String(eventCounter),
    event: "connected",
    data: { ok: true },
    createdAt: new Date().toISOString(),
  });

  const heartbeat = setInterval(() => {
    response.write(": ping\n\n");
  }, 25_000);

  return () => {
    clearInterval(heartbeat);
    clients.delete(response);
  };
}

function writeEvent(response: Response, payload: SseEvent) {
  response.write(`id: ${payload.id}\n`);
  response.write(`event: ${payload.event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}
