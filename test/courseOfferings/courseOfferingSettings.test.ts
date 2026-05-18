import { describe, expect, it } from 'vitest';

import { processCourseOfferingSettings } from '../../src/courseOfferings/courseOfferingSettings.js';

describe('processCourseOfferingSettings', () => {
  it('no-ops when course_visibility is absent', async () => {
    await expect(
      processCourseOfferingSettings(1, {}, {}, 99, false),
    ).resolves.toBeUndefined();
  });

  it('no-ops when parsed settings omit visibility arrays', async () => {
    await expect(
      processCourseOfferingSettings(
        1,
        { other: true },
        { other: false },
        99,
        true,
      ),
    ).resolves.toBeUndefined();
  });
});
