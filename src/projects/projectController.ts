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
  buildWithStreaming,
} from './projectService.js';
import { docker } from '../docker.js';

export const getRunningContainers = async (_req: Request, res: Response) => {
  const containers = await listRunningContainers();
  return res.json({ containers });
};

export const getAllImages = async (_req: Request, res: Response) => {
  const images = await listAllImages();
  return res.json({ images });
};

export const deployProject = async (req: Request, res: Response) => {
  const { teamId, githubUrl, buildArgs } = req.body;
  const { userId } = req.user!;
  const dataFilePath = req.file?.path;

  const result = await deploy(Number(teamId), githubUrl, userId, buildArgs, dataFilePath);

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
  const project = await stopProject(Number(projectId));
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
  const { teamId, githubUrl, buildArgs } = req.body;
  const { userId } = req.user!;
  const dataFilePath = req.file?.path;

  try {
    const { project, initBuild, completeBuild } = await buildWithStreaming(
      Number(teamId),
      githubUrl,
      userId,
      buildArgs,
      dataFilePath,
    );

    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial project info
    res.write(
      `data: ${JSON.stringify({ type: 'start', project })}\n\n`,
    );

    // Initialize the build and get the stream
    const buildStream = await initBuild();
    const buildLogLines: string[] = [];

    // Follow the build progress and stream events to client
    docker.modem.followProgress(
      buildStream,
      async (err, _result) => {
        if (err) {
          res.write(
            `data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`,
          );
          res.end();
          return;
        }

        // Build completed successfully, now start the container
        try {
          const updatedProject = await completeBuild(buildLogLines);
          res.write(
            `data: ${JSON.stringify({ type: 'complete', project: updatedProject })}\n\n`,
          );
          res.end();
        } catch (completeError) {
          res.write(
            `data: ${JSON.stringify({ type: 'error', message: (completeError as Error).message })}\n\n`,
          );
          res.end();
        }
      },
      (event) => {
        // Stream each build event to the client in real-time
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
          res.write(
            `data: ${JSON.stringify({ type: 'log', data: logLine })}\n\n`,
          );
        }
      },
    );

    // Handle client disconnect
    req.on('close', () => {
      if ('destroy' in buildStream && typeof buildStream.destroy === 'function') {
        buildStream.destroy();
      }
    });
  } catch (error) {
    if (!res.headersSent) {
      throw error;
    } else {
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: (error as Error).message })}\n\n`,
      );
      res.end();
    }
  }
};
