/**
 * In-memory queue that caps the number of concurrent Docker builds.
 *
 * Concurrency is controlled by the MAX_CONCURRENT_BUILDS environment variable
 * (default 2). Additional enqueues wait until a slot opens up.
 *
 * While queued, a task's onPositionUpdate callback is invoked:
 *   - Once immediately on enqueue (so the client sees its position right away).
 *   - Every POSITION_UPDATE_MS (15s) for as long as anyone is queued.
 *   - Whenever the queue shifts (another task finishes / a task is cancelled).
 *
 * This queue is process-local. In a multi-replica deployment each replica has
 * its own queue; the assumption here is that the build host is a single
 * instance, matching how Docker is invoked in this project.
 */

type QueueEntry = {
  id: string;
  onPositionUpdate: (position: number, totalQueued: number) => void;
  onStart: () => void;
  run: () => Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
  cancelled: boolean;
};

const DEFAULT_MAX_CONCURRENT = 2;
const POSITION_UPDATE_MS = 15_000;

const resolveMaxConcurrent = (): number => {
  const raw = process.env.MAX_CONCURRENT_BUILDS;
  if (!raw) return DEFAULT_MAX_CONCURRENT;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CONCURRENT;
};

class BuildQueue {
  private readonly maxConcurrent: number;
  private activeCount = 0;
  private readonly queue: QueueEntry[] = [];
  private positionInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.maxConcurrent = resolveMaxConcurrent();
  }

  getMaxConcurrent(): number {
    return this.maxConcurrent;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getQueuedCount(): number {
    return this.queue.length;
  }

  /**
   * Enqueue a build task. Resolves once the task has completed (successfully
   * or not). Rejects only if `run` throws. If the task is cancelled while
   * still queued, the promise resolves without running.
   */
  enqueue(opts: {
    id: string;
    onPositionUpdate: (position: number, totalQueued: number) => void;
    onStart: () => void;
    run: () => Promise<void>;
  }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = {
        id: opts.id,
        onPositionUpdate: opts.onPositionUpdate,
        onStart: opts.onStart,
        run: opts.run,
        resolve,
        reject,
        cancelled: false,
      };

      this.queue.push(entry);
      this.processNext();

      // If the entry is still queued (didn't immediately start), push an
      // initial position update and ensure the periodic ticker is running.
      if (this.queue.includes(entry)) {
        this.notifyPositions();
        this.ensurePositionTicker();
      }
    });
  }

  /**
   * Remove a queued task by id. Safe to call for ids that are already active
   * or unknown — in that case this is a no-op. Active tasks continue running.
   */
  cancel(id: string): void {
    const idx = this.queue.findIndex((e) => e.id === id);
    if (idx === -1) return;

    const [entry] = this.queue.splice(idx, 1);
    entry.cancelled = true;
    entry.resolve();

    this.notifyPositions();
    if (this.queue.length === 0) this.stopPositionTicker();
  }

  private processNext(): void {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const entry = this.queue.shift();
      if (!entry) break;
      if (entry.cancelled) continue;

      this.activeCount += 1;

      void (async () => {
        try {
          entry.onStart();
          await entry.run();
          entry.resolve();
        } catch (err) {
          entry.reject(err instanceof Error ? err : new Error(String(err)));
        } finally {
          this.activeCount -= 1;
          this.processNext();
          // Positions may have shifted for those still waiting.
          this.notifyPositions();
          if (this.queue.length === 0) this.stopPositionTicker();
        }
      })();
    }
  }

  private notifyPositions(): void {
    const total = this.queue.length;
    this.queue.forEach((entry, i) => {
      try {
        entry.onPositionUpdate(i + 1, total);
      } catch {
        // Ignore listener errors so one misbehaving client can't poison the queue.
      }
    });
  }

  private ensurePositionTicker(): void {
    if (this.positionInterval || this.queue.length === 0) return;
    this.positionInterval = setInterval(() => {
      this.notifyPositions();
    }, POSITION_UPDATE_MS);
    // Don't let this timer keep the process alive on shutdown.
    if (typeof this.positionInterval.unref === 'function') {
      this.positionInterval.unref();
    }
  }

  private stopPositionTicker(): void {
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }
}

export const buildQueue = new BuildQueue();
