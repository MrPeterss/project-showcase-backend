import Docker from 'dockerode';

export type DockerClient = Docker;

export function createDockerClient(): DockerClient {
  const socketPath = process.env.DOCKER_SOCKET_PATH;
  if (socketPath) {
    return new Docker({ socketPath });
  }
  return new Docker();
}

/**
 * Mutable singleton so integration tests can substitute a mock (`setDockerClientForTesting`).
 */
export let docker: DockerClient = createDockerClient();

export function setDockerClientForTesting(client: DockerClient | null): void {
  docker = client ?? createDockerClient();
}
