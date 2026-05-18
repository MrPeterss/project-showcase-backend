import { describe, expect, it } from 'vitest';

import {
  DATA_MOUNT_PATH,
  getContainerDataFilePath,
  getHostDataFilePath,
} from '../../src/projects/projectPaths.js';

describe('projectPaths', () => {
  describe('getHostDataFilePath', () => {
    it('maps container prefix to host dir when configured', () => {
      const prevHost = process.env.DATA_FILES_HOST_DIR;
      process.env.DATA_FILES_HOST_DIR = '/host/data';

      try {
        const containerDir =
          process.env.DATA_FILES_DIR || '/app/data/project-data-files';
        expect(getHostDataFilePath(`${containerDir}/report.pdf`)).toBe(
          '/host/data/report.pdf',
        );
      } finally {
        process.env.DATA_FILES_HOST_DIR = prevHost;
      }
    });

    it('returns original path when host mapping does not apply', () => {
      const prevHost = process.env.DATA_FILES_HOST_DIR;
      delete process.env.DATA_FILES_HOST_DIR;

      try {
        expect(getHostDataFilePath('/tmp/other/file.pdf')).toBe('/tmp/other/file.pdf');
      } finally {
        if (prevHost !== undefined) process.env.DATA_FILES_HOST_DIR = prevHost;
      }
    });
  });

  describe('getContainerDataFilePath', () => {
    it('joins mount path with basename', () => {
      expect(getContainerDataFilePath('/somewhere/report.pdf')).toBe(
        `${DATA_MOUNT_PATH}/report.pdf`,
      );
    });

    it('respects explicit original filename', () => {
      expect(getContainerDataFilePath('/somewhere/tmp', 'final.pdf')).toBe(
        `${DATA_MOUNT_PATH}/final.pdf`,
      );
    });
  });
});
