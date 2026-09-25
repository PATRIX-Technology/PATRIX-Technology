import { describe, expect, it } from 'vitest';
import { buildExportPlan } from '@/lib/providers/pdf/bulk-zip';

describe('buildExportPlan', () => {
  it('gives a child with one approved story a flat {class}/{child}.pdf path', () => {
    const plan = buildExportPlan(
      [{ id: 'c1', first_name: 'Omar', class_name: 'Butterflies' }],
      [{ id: 's1', child_id: 'c1', theme_key: 'honesty' }],
    );
    expect(plan).toEqual([{ storyId: 's1', fileName: 'Butterflies/Omar.pdf' }]);
  });

  it('groups a child with multiple approved stories into their own subfolder', () => {
    const plan = buildExportPlan(
      [{ id: 'c1', first_name: 'Hala', class_name: 'Bumblebees' }],
      [
        { id: 's1', child_id: 'c1', theme_key: 'first_day_school' },
        { id: 's2', child_id: 'c1', theme_key: 'honesty' },
      ],
    );
    expect(plan).toHaveLength(2);
    for (const entry of plan) {
      expect(entry.fileName.startsWith('Bumblebees/Hala/')).toBe(true);
    }
    // Distinct filenames even though both are under the same child folder.
    expect(new Set(plan.map((e) => e.fileName)).size).toBe(2);
  });

  it('puts children with no class in a "No class" folder', () => {
    const plan = buildExportPlan(
      [{ id: 'c1', first_name: 'Sara', class_name: null }],
      [{ id: 's1', child_id: 'c1', theme_key: 'honesty' }],
    );
    expect(plan).toEqual([{ storyId: 's1', fileName: 'No_class/Sara.pdf' }]);
  });

  it('keeps two different classes in two different top-level folders', () => {
    const plan = buildExportPlan(
      [
        { id: 'c1', first_name: 'Omar', class_name: 'Butterflies' },
        { id: 'c2', first_name: 'Maya', class_name: 'Bumblebees' },
      ],
      [
        { id: 's1', child_id: 'c1', theme_key: 'honesty' },
        { id: 's2', child_id: 'c2', theme_key: 'honesty' },
      ],
    );
    const fileNames = plan.map((e) => e.fileName).sort();
    expect(fileNames).toEqual(['Butterflies/Omar.pdf', 'Bumblebees/Maya.pdf'].sort());
  });

  it('drops stories whose child no longer exists rather than throwing', () => {
    const plan = buildExportPlan([], [{ id: 's1', child_id: 'missing', theme_key: 'honesty' }]);
    expect(plan).toEqual([]);
  });
});
