import * as fs from 'fs';
import * as path from 'path';

import { docker } from '../docker.js';
import { git } from '../git.js';

/**
 * Extract repository name from GitHub URL
 */
const extractRepoName = (githubUrl: string): string => {
  const match = githubUrl.match(/\/([^/]+?)(\.git)?$/);
  if (!match) {
    throw new Error('Invalid GitHub URL');
  }
  return match[1].replace('.git', '');
};

/**
 * List all running Docker containers
 */
export const listRunningContainers = async () => {
  const containers = await docker.listContainers({ all: false });
  return containers.map((container) => ({
    id: container.Id,
    names: container.Names,
    image: container.Image,
    state: container.State,
    status: container.Status,
    ports: container.Ports,
    created: container.Created,
  }));
};

/**
 * List all Docker images
 */
export const listAllImages = async () => {
  const images = await docker.listImages({ all: true });
  return images.map((image) => ({
    id: image.Id,
    repoTags: image.RepoTags,
    repoDigests: image.RepoDigests,
    created: image.Created,
    size: image.Size,
    virtualSize: image.VirtualSize,
  }));
};

/**
 * Clone a GitHub repository, build a Docker image from it, and run a container
 */
export const deploy = async (githubUrl: string) => {
  const repoName = extractRepoName(githubUrl);
  const tempDir = path.join('/tmp', `project-${Date.now()}-${repoName}`);

  try {
    // Clone the repository
    await git.clone(githubUrl, tempDir);

    // Check if Dockerfile exists
    const dockerfilePath = path.join(tempDir, 'Dockerfile');
    if (!fs.existsSync(dockerfilePath)) {
      throw new Error('No Dockerfile found in the repository');
    }

    // Build the image
    const imageName = `${repoName}:latest`.toLowerCase();
    const stream = await docker.buildImage(
      {
        context: tempDir,
        src: ['.'],
      },
      {
        t: imageName,
      },
    );

    // Wait for the build to complete
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });

    // Run the container
    const container = await docker.createContainer({
      Image: imageName,
      name: `${repoName}-${Date.now()}`,
      HostConfig: {
        AutoRemove: false,
        PublishAllPorts: true,
      },
    });

    await container.start();

    // Get container info
    const containerInfo = await container.inspect();

    return {
      success: true,
      imageName,
      containerId: container.id,
      containerName: containerInfo.Name,
      ports: containerInfo.NetworkSettings.Ports,
      state: containerInfo.State,
    };
  } finally {
    // Clean up the temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
};
