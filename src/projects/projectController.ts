import type { Request, Response } from 'express';

import {
  deploy,
  getAllProjects,
  getProjectById,
  getTeamProjects,
  listAllImages,
  listRunningContainers,
  stopProject,
  streamProjectLogs,
  streamBuildLogs,
  deployWithStreaming,
  deployFromProject,
} from './projectService.js';
import { buildQueue } from './buildQueue.js';
import { docker } from '../docker.js';

/**
 * Generate a unique id for a build queue entry. Used to cancel queued entries
 * when the client disconnects.
 */
const makeQueueTaskId = (teamId: number | string): string => {
  return `team-${teamId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const getRunningContainers = async (_req: Request, res: Response) => {
  const containers = await listRunningContainers();
  return res.json({ containers });
};

export const getAllImages = async (_req: Request, res: Response) => {
  const images = await listAllImages();
  return res.json({ images });
};

export const deployProject = async (req: Request, res: Response) => {
  const { teamId, githubUrl, buildArgs, extraEnvVars } = req.body;
  const { userId } = req.user!;
  const dataFilePath = req.file?.path;
  const originalFileName = req.file?.originalname;

  // Route through the build queue so we don't exceed MAX_CONCURRENT_BUILDS.
  // This endpoint has no stream to report position to, so callers just wait.
  let result: Awaited<ReturnType<typeof deploy>> | undefined;
  let deployError: unknown;

  await buildQueue.enqueue({
    id: makeQueueTaskId(teamId),
    onPositionUpdate: () => {
      // No-op: non-streaming endpoint cannot push updates to the client.
    },
    onStart: () => {
      // No-op: non-streaming endpoint has no channel for build-start events.
    },
    run: async () => {
      try {
        result = await deploy(
          Number(teamId),
          githubUrl,
          userId,
          buildArgs,
          dataFilePath,
          originalFileName,
          extraEnvVars,
        );
      } catch (error) {
        deployError = error;
      }
    },
  });

  if (deployError) throw deployError;

  return res.status(201).json({
    message: 'Project deployed successfully',
    ...result,
  });
};


export const getProjects = async (_req: Request, res: Response) => {
  const projects = await getAllProjects();
  return res.json({ projects });
};

export const getTeamProjectsController = async (
  req: Request,
  res: Response,
) => {
  const { teamId } = req.params;
  const projects = await getTeamProjects(Number(teamId));
  return res.json({ projects });
};

export const getProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const project = await getProjectById(Number(projectId));
  return res.json({ project });
};

export const stopProjectController = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { userId, isAdmin } = req.user!;
  const project = await stopProject(Number(projectId), userId, isAdmin);
  return res.json({
    message: 'Project stopped successfully',
    project,
  });
};

export const streamProjectLogsController = async (
  req: Request,
  res: Response,
) => {
  const { projectId } = req.params;
  const { tail, since, timestamps } = req.query;

  try {
    const { project, stream } = await streamProjectLogs(Number(projectId), {
      tail: tail ? Number(tail) : undefined,
      since: since as string | undefined,
      timestamps: timestamps === 'true',
    });

    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial project info
    res.write(
      `data: ${JSON.stringify({ type: 'info', project })}\n\n`,
    );

    // Docker multiplexes stdout and stderr, so we need to demultiplex
    // The first 8 bytes of each chunk contain header information
    stream.on('data', (chunk: Buffer) => {
      // Parse Docker's stream format
      let offset = 0;
      while (offset < chunk.length) {
        // Docker stream header is 8 bytes:
        // [0] = stream type (0=stdin, 1=stdout, 2=stderr)
        // [1-3] = padding
        // [4-7] = payload size (big-endian)
        if (chunk.length - offset < 8) break;

        const header = chunk.slice(offset, offset + 8);
        const streamType = header[0];
        const payloadSize =
          (header[4] << 24) |
          (header[5] << 16) |
          (header[6] << 8) |
          header[7];

        offset += 8;

        if (offset + payloadSize > chunk.length) break;

        const payload = chunk.slice(offset, offset + payloadSize);
        const logLine = payload.toString('utf-8');

        // Send log line as SSE
        const logData = {
          type: 'log',
          stream: streamType === 1 ? 'stdout' : 'stderr',
          data: logLine,
          timestamp: new Date().toISOString(),
        };

        res.write(`data: ${JSON.stringify(logData)}\n\n`);

        offset += payloadSize;
      }
    });

    stream.on('end', () => {
      res.write(
        `data: ${JSON.stringify({ type: 'end', message: 'Stream ended' })}\n\n`,
      );
      res.end();
    });

    stream.on('error', (error: Error) => {
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`,
      );
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
      // Try to destroy the stream if the method exists
      if ('destroy' in stream && typeof stream.destroy === 'function') {
        stream.destroy();
      }
    });
  } catch (error) {
    // If headers haven't been sent yet, send error as JSON
    if (!res.headersSent) {
      throw error;
    } else {
      // Otherwise send as SSE error
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: (error as Error).message })}\n\n`,
      );
      res.end();
    }
  }
};

export const streamBuildLogsController = async (
  req: Request,
  res: Response,
) => {
  const { projectId } = req.params;

  try {
    const { project, buildLogs } = await streamBuildLogs(Number(projectId));

    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial project info
    res.write(
      `data: ${JSON.stringify({ type: 'info', project })}\n\n`,
    );

    if (buildLogs && buildLogs.length > 0) {
      // Send each build log line
      for (const log of buildLogs) {
        res.write(`data: ${JSON.stringify({ type: 'log', data: log })}\n\n`);
      }
    } else {
      res.write(
        `data: ${JSON.stringify({ type: 'info', message: 'No build logs available' })}\n\n`,
      );
    }

    // Send end event
    res.write(
      `data: ${JSON.stringify({ type: 'end', message: 'Build logs stream ended' })}\n\n`,
    );
    res.end();
  } catch (error) {
    // If headers haven't been sent yet, send error as JSON
    if (!res.headersSent) {
      throw error;
    } else {
      // Otherwise send as SSE error
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: (error as Error).message })}\n\n`,
      );
      res.end();
    }
  }
};

export const deployProjectWithStreamingController = async (
  req: Request,
  res: Response,
) => {
  const { teamId, githubUrl, buildArgs, extraEnvVars } = req.body;
  const { userId } = req.user!;
  const dataFilePath = req.file?.path;
  const originalFileName = req.file?.originalname;

  // Set SSE headers up front so we can stream queue-position updates before
  // the Docker build actually starts.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  let clientClosed = false;
  let activeBuildStream: { destroy?: () => void } | null = null;

  const writeSse = (payload: unknown): void => {
    if (clientClosed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // Emit queue messages as plain log lines so the existing frontend renders
  // them alongside regular build output without any changes.
  const writeLog = (line: string): void => {
    writeSse({ type: 'log', data: line });
  };

  const taskId = makeQueueTaskId(teamId);

  // Use `res`, not `req`, for disconnect detection. For POST, `req` can emit
  // `close` as soon as the request body is fully read (e.g. after multer
  // finishes), while the response is still streaming. That would set
  // `clientClosed` too early and drop all subsequent SSE writes.
  const onClientDisconnected = () => {
    clientClosed = true;
    buildQueue.cancel(taskId);
    if (activeBuildStream?.destroy) {
      try {
        activeBuildStream.destroy();
      } catch {
        // Best-effort cleanup.
      }
    }
  };

  res.on('close', onClientDisconnected);
  req.on('aborted', onClientDisconnected);

  try {
    await buildQueue.enqueue({
      id: taskId,
      onPositionUpdate: (position, totalQueued) => {
        writeLog(
          `[queue] Waiting for an available build slot: position ${position} of ${totalQueued} ` +
            `(max ${buildQueue.getMaxConcurrent()} concurrent builds).\n`,
        );
      },
      onStart: () => {
        writeLog('[queue] A build slot is now available. Starting build...\n');
      },
      run: async () => {
        if (clientClosed) return;

        // Heartbeat so intermediaries don't drop the connection during
        // silent phases (clone, container teardown, context upload, etc.).
        const pingInterval = setInterval(() => {
          writeSse({ type: 'ping' });
        }, 20_000);

        try {
          const { project, initBuild, completeBuild } = await deployWithStreaming(
            Number(teamId),
            githubUrl,
            userId,
            buildArgs,
            dataFilePath,
            originalFileName,
            extraEnvVars,
          );

          writeSse({ type: 'start', project });

          const buildStream = await initBuild(writeLog);
          activeBuildStream = buildStream as { destroy?: () => void };
          const buildLogLines: string[] = [];

          await new Promise<void>((resolve) => {
            docker.modem.followProgress(
              buildStream,
              async (err, _result) => {
                if (err) {
                  writeSse({ type: 'error', message: err.message });
                  if (!clientClosed && !res.writableEnded) res.end();
                  resolve();
                  return;
                }

                try {
                  const updatedProject = await completeBuild(buildLogLines);
                  writeSse({ type: 'complete', project: updatedProject });
                } catch (completeError) {
                  writeSse({
                    type: 'error',
                    message: (completeError as Error).message,
                  });
                } finally {
                  if (!clientClosed && !res.writableEnded) res.end();
                  resolve();
                }
              },
              (event) => {
                let logLine = '';

                if (event.stream) {
                  logLine = event.stream;
                } else if (event.status) {
                  logLine = `${event.status}${event.progress ? ` ${event.progress}` : ''}\n`;
                } else if (event.error) {
                  logLine = `ERROR: ${event.error}\n`;
                }

                if (logLine) {
                  buildLogLines.push(logLine);
                  writeSse({ type: 'log', data: logLine });
                }
              },
            );
          });
        } finally {
          clearInterval(pingInterval);
        }
      },
    });
  } catch (error) {
    if (!res.headersSent) {
      throw error;
    }
    writeSse({ type: 'error', message: (error as Error).message });
    if (!res.writableEnded) res.end();
  }
};

export const redeployProjectController = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { userId } = req.user!;

  const result = await deployFromProject(Number(projectId), userId);

  return res.status(201).json({
    message: 'Project redeployed successfully',
    ...result,
  });
};
