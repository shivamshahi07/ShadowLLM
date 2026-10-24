import { EventEmitter } from 'node:events';
import { ShadowPayload } from './types.js';

export interface IStreamQueue {
  enqueue(payload: ShadowPayload): Promise<string>;
  startConsumer(handler: (payload: ShadowPayload) => Promise<void>): () => void;
  size(): number;
}

/**
 * In-memory fallback stream queue for zero-dependency local development and testing.
 */
class MemoryStreamQueue implements IStreamQueue {
  private queue: ShadowPayload[] = [];
  private emitter = new EventEmitter();
  private isProcessing = false;
  private consumerActive = false;

  async enqueue(payload: ShadowPayload): Promise<string> {
    this.queue.push(payload);
    // Non-blocking trigger to consumer
    setImmediate(() => {
      this.emitter.emit('new_item');
    });
    return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  startConsumer(handler: (payload: ShadowPayload) => Promise<void>): () => void {
    this.consumerActive = true;

    const processQueue = async () => {
      if (this.isProcessing || !this.consumerActive) return;
      this.isProcessing = true;

      while (this.consumerActive && this.queue.length > 0) {
        const item = this.queue.shift();
        if (item) {
          try {
            await handler(item);
          } catch (err) {
            console.error('[MemoryStreamQueue] Error processing shadow item:', err);
          }
        }
      }

      this.isProcessing = false;
    };

    this.emitter.on('new_item', processQueue);

    // Initial drain in case items were enqueued before consumer started
    setImmediate(processQueue);

    return () => {
      this.consumerActive = false;
      this.emitter.off('new_item', processQueue);
    };
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
      const res = await fetch(`${this.url}/xadd/${this.streamKey}/*`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['payload', serialized]),
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
    let lastId = '$'; // Start from current end

    // Also run fallback memory consumer in case of degraded mode
    const stopMemory = this.fallbackMemory.startConsumer(handler);

    const poll = async () => {
      while (running) {
        try {
          // XREAD count 10 STREAMS streamKey lastId
          const res = await fetch(`${this.url}/xread/count/10/streams/${this.streamKey}/${encodeURIComponent(lastId)}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.token}`,
            },
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

    poll();

    return () => {
      running = false;
      stopMemory();
    };
  }

  size(): number {
    return this.fallbackMemory.size();
  }
}

// Global Singleton factory
let streamQueueInstance: IStreamQueue | null = null;

export function getStreamQueue(): IStreamQueue {
  if (streamQueueInstance) return streamQueueInstance;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    console.log('[Queue] Initializing Upstash Redis Stream Queue');
    streamQueueInstance = new UpstashRedisStreamQueue(upstashUrl, upstashToken);
  } else {
    console.log('[Queue] Using zero-latency In-Memory Stream Buffer (offline mode)');
    streamQueueInstance = new MemoryStreamQueue();
  }

  return streamQueueInstance;
}
