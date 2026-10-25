import { ShadowPayload } from './types.js';

export interface IStreamQueue {
  enqueue(payload: ShadowPayload): Promise<string>;
  startConsumer(handler: (payload: ShadowPayload) => Promise<void>): () => void;
  size(): number;
}

/**
 * In-memory buffer queue fallback for local development or when Redis is unavailable.
 */
class MemoryStreamQueue implements IStreamQueue {
  private queue: ShadowPayload[] = [];
  private consumers: Array<(payload: ShadowPayload) => Promise<void>> = [];
  private processing = false;

  async enqueue(payload: ShadowPayload): Promise<string> {
    const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.queue.push(payload);
    this.triggerConsumers();
    return id;
  }

  startConsumer(handler: (payload: ShadowPayload) => Promise<void>): () => void {
    this.consumers.push(handler);
    this.triggerConsumers();

    return () => {
      const idx = this.consumers.indexOf(handler);
      if (idx !== -1) {
        this.consumers.splice(idx, 1);
      }
    };
  }

  private async triggerConsumers() {
    if (this.processing || this.queue.length === 0 || this.consumers.length === 0) {
      return;
    }

    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      for (const consumer of this.consumers) {
        try {
          await consumer(item);
        } catch (err) {
          console.error('[MemoryStreamQueue] Consumer error:', err);
        }
      }
    }
    this.processing = false;
  }

  size(): number {
    return this.queue.length;
  }
}

/**
 * Upstash Redis REST API stream queue implementation.
 */
class UpstashRedisStreamQueue implements IStreamQueue {
  private url: string;
  private token: string;
  private streamKey: string;
  private pollIntervalMs: number;
  private fallbackMemory: MemoryStreamQueue = new MemoryStreamQueue();

  constructor(url: string, token: string, streamKey = 'shadow:requests:stream', pollIntervalMs = 1000) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.streamKey = streamKey;
    this.pollIntervalMs = pollIntervalMs;
  }

  async enqueue(payload: ShadowPayload): Promise<string> {
    try {
      const serialized = JSON.stringify(payload);
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['XADD', this.streamKey, '*', 'payload', serialized]),
      });

      if (!res.ok) {
        throw new Error(`Upstash XADD failed with HTTP ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as { result?: string };
      return data.result || `upstash_${Date.now()}`;
    } catch (err) {
      console.warn('[UpstashRedisStreamQueue] Remote XADD failed, falling back to in-memory queue:', err);
      return this.fallbackMemory.enqueue(payload);
    }
  }

  startConsumer(handler: (payload: ShadowPayload) => Promise<void>): () => void {
    let running = true;
    let lastId = '0-0';

    // Also run fallback memory consumer in case of degraded mode
    const stopMemory = this.fallbackMemory.startConsumer(handler);

    const initAndPoll = async () => {
      // 1. Find the latest ID so we only process new events moving forward
      try {
        const latestRes = await fetch(this.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(['XREVRANGE', this.streamKey, '+', '-', 'COUNT', '1']),
        });
        if (latestRes.ok) {
          const latestData = (await latestRes.json()) as { result?: Array<[string, any]> };
          if (latestData.result && latestData.result.length > 0 && latestData.result[0][0]) {
            lastId = latestData.result[0][0];
          }
        }
      } catch (err) {
        console.warn('[UpstashRedisStreamQueue] Failed to query latest stream ID on init:', err);
      }

      // 2. Continuous polling loop
      while (running) {
        try {
          // XREAD COUNT 10 STREAMS streamKey lastId
          const res = await fetch(this.url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(['XREAD', 'COUNT', '10', 'STREAMS', this.streamKey, lastId]),
          });

          if (res.ok) {
            const data = (await res.json()) as { result?: Array<[string, Array<[string, string[]]>]> };
            if (data.result && data.result.length > 0) {
              for (const streamEntry of data.result) {
                const entries = streamEntry[1];
                for (const [entryId, fields] of entries) {
                  lastId = entryId;
                  // Look for payload field
                  const payloadIdx = fields.indexOf('payload');
                  if (payloadIdx !== -1 && fields[payloadIdx + 1]) {
                    try {
                      const payload = JSON.parse(fields[payloadIdx + 1]) as ShadowPayload;
                      await handler(payload);
                    } catch (parseErr) {
                      console.error('[UpstashRedisStreamQueue] Failed to parse payload:', parseErr);
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error('[UpstashRedisStreamQueue] Poll error:', err);
        }

        if (running) {
          await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
        }
      }
    };

    initAndPoll();

    return () => {
      running = false;
      stopMemory();
    };
  }

  size(): number {
    return this.fallbackMemory.size();
  }
}

let streamQueueInstance: IStreamQueue | null = null;

export function getStreamQueue(): IStreamQueue {
  if (streamQueueInstance) {
    return streamQueueInstance;
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    console.log('[Queue] Initializing Upstash Redis Stream Queue');
    streamQueueInstance = new UpstashRedisStreamQueue(redisUrl, redisToken);
  } else {
    console.log('[Queue] Using zero-latency In-Memory Stream Buffer (offline mode)');
    streamQueueInstance = new MemoryStreamQueue();
  }

  return streamQueueInstance;
}

export function resetStreamQueue(): void {
  streamQueueInstance = null;
}
