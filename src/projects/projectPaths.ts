import * as path from 'path';

export const DATA_MOUNT_PATH = '/var/www';

export function getHostDataFilePath(filePath: string): string {
  const containerDataDir =
    process.env.DATA_FILES_DIR || '/app/data/project-data-files';
  const hostDataDir = process.env.DATA_FILES_HOST_DIR;

  if (hostDataDir && filePath.startsWith(containerDataDir)) {
    return filePath.replace(containerDataDir, hostDataDir);
  }

  return filePath;
}

export function getContainerDataFilePath(
  filePath: string,
  originalFileName?: string,
): string {
  const fileName = originalFileName || path.basename(filePath);
  return path.posix.join(DATA_MOUNT_PATH, fileName);
}
