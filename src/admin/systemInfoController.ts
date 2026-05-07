import type { Request, Response } from 'express';
import si from 'systeminformation';

const writeSseEvent = (res: Response, event: string, data: unknown) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

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

  const intervalMs = 1000;

  const tick = async () => {
    try {
      const [load, mem] = await Promise.all([si.currentLoad(), si.mem()]);

      writeSseEvent(res, 'stats', {
        timestamp: new Date().toISOString(),
        cpu: {
          currentLoad: load.currentLoad, // %
          user: load.currentLoadUser, // %
          system: load.currentLoadSystem, // %
          idle: load.currentLoadIdle, // %
          cores: (load.cpus || []).map((c, idx) => ({
            core: idx,
            load: c.load, // %
            user: c.loadUser, // %
            system: c.loadSystem, // %
            idle: c.loadIdle, // %
          })),
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

