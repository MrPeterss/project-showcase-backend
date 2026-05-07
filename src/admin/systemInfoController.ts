import type { Request, Response } from 'express';
import si from 'systeminformation';

const writeSseEvent = (res: Response, event: string, data: unknown) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const avg = (values: number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, v) => sum + v, 0) / values.length;

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const streamSystemStats = async (req: Request, res: Response) => {
  // Server-Sent Events (SSE)
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Prevent nginx from buffering SSE
  res.setHeader('X-Accel-Buffering', 'no');

  res.flushHeaders();

  // Let the client know stream is alive
  writeSseEvent(res, 'ready', { ok: true, timestamp: new Date().toISOString() });

  // 1s sampling is very noisy near-idle; use a slightly longer window.
  const intervalMs = 2000;
  const smoothingWindow = 5;

  const history = {
    overall: {
      currentLoad: [] as number[],
      user: [] as number[],
      system: [] as number[],
      idle: [] as number[],
    },
    perCore: [] as Array<{
      load: number[];
      user: number[];
      system: number[];
      idle: number[];
    }>,
  };

  const pushTrim = (arr: number[], value: number) => {
    arr.push(value);
    if (arr.length > smoothingWindow) arr.shift();
  };

  const tick = async () => {
    try {
      const [load, mem] = await Promise.all([si.currentLoad(), si.mem()]);

      // Keep history at full precision for smoothing.
      pushTrim(history.overall.currentLoad, load.currentLoad);
      pushTrim(history.overall.user, load.currentLoadUser);
      pushTrim(history.overall.system, load.currentLoadSystem);
      pushTrim(history.overall.idle, load.currentLoadIdle);

      const perCoreRaw = (load.cpus || []).map((c, idx) => {
        if (!history.perCore[idx]) {
          history.perCore[idx] = { load: [], user: [], system: [], idle: [] };
        }
        pushTrim(history.perCore[idx].load, c.load);
        pushTrim(history.perCore[idx].user, c.loadUser);
        pushTrim(history.perCore[idx].system, c.loadSystem);
        pushTrim(history.perCore[idx].idle, c.loadIdle);

        return {
          core: idx,
          load: round4(c.load), // %
          user: round4(c.loadUser), // %
          system: round4(c.loadSystem), // %
          idle: round4(c.loadIdle), // %
          smoothed: {
            load: round4(avg(history.perCore[idx].load)),
            user: round4(avg(history.perCore[idx].user)),
            system: round4(avg(history.perCore[idx].system)),
            idle: round4(avg(history.perCore[idx].idle)),
          },
        };
      });

      writeSseEvent(res, 'stats', {
        timestamp: new Date().toISOString(),
        cpu: {
          currentLoad: round4(load.currentLoad), // %
          user: round4(load.currentLoadUser), // %
          system: round4(load.currentLoadSystem), // %
          idle: round4(load.currentLoadIdle), // %
          smoothed: {
            currentLoad: round4(avg(history.overall.currentLoad)),
            user: round4(avg(history.overall.user)),
            system: round4(avg(history.overall.system)),
            idle: round4(avg(history.overall.idle)),
          },
          cores: perCoreRaw,
        },
        memory: {
          total: mem.total,
          free: mem.free,
          used: mem.used,
          active: mem.active,
          available: mem.available,
          swaptotal: mem.swaptotal,
          swapused: mem.swapused,
          swapfree: mem.swapfree,
        },
      });
    } catch (error) {
      writeSseEvent(res, 'error', {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  };

  // send an immediate tick, then every second
  await tick();
  const timer = setInterval(() => void tick(), intervalMs);

  req.on('close', () => {
    clearInterval(timer);
  });
};

export const getStorageInfo = async (_req: Request, res: Response) => {
  const sizes = await si.fsSize();

  return res.json({
    timestamp: new Date().toISOString(),
    filesystems: sizes.map((fs) => ({
      fs: fs.fs,
      type: fs.type,
      mount: fs.mount,
      size: fs.size,
      used: fs.used,
      available: fs.available,
      use: fs.use, // %
      rw: fs.rw,
    })),
  });
};

