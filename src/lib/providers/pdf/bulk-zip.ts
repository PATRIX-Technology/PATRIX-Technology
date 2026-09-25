import 'server-only';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';

export interface BulkZipEntry {
  fileName: string;
  pdfBytes: Uint8Array;
}

/**
 * Streams a set of already-rendered, already-preflighted story PDFs into
 * a single ZIP for class-level bulk download. Rendering/preflight happen
 * per-story beforehand — this module only concatenates the results.
 */
export async function buildBulkZip(entries: BulkZipEntry[]): Promise<Buffer> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];

  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  archive.pipe(stream);

  for (const entry of entries) {
    archive.append(Buffer.from(entry.pdfBytes), { name: entry.fileName });
  }

  const done = new Promise<Buffer>((resolve, reject) => {
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
  });

  await archive.finalize();
  return done;
}

export function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60);
}

const UNASSIGNED_CLASS_FOLDER = 'No class';

export interface ExportPlanChild {
  id: string;
  first_name: string;
  class_name: string | null;
}

export interface ExportPlanStory {
  id: string;
  child_id: string;
  theme_key: string;
}

export interface ExportPlanEntry {
  storyId: string;
  fileName: string;
}

/**
 * Computes each approved story's path within the whole-tenant export ZIP:
 * one folder per class, and — only when a child has more than one
 * approved story — a subfolder per child so their stories don't collide
 * or get lost among siblings/classmates. A child with a single story
 * gets a flat "{class}/{childName}.pdf" instead of an unnecessary
 * one-file subfolder. See docs/DECISIONS.md "Bulk export folder
 * structure".
 */
export function buildExportPlan(children: ExportPlanChild[], stories: ExportPlanStory[]): ExportPlanEntry[] {
  const childById = new Map(children.map((c) => [c.id, c]));
  const storiesByChild = new Map<string, ExportPlanStory[]>();
  for (const story of stories) {
    const existing = storiesByChild.get(story.child_id) ?? [];
    existing.push(story);
    storiesByChild.set(story.child_id, existing);
  }

  const plan: ExportPlanEntry[] = [];
  for (const [childId, childStories] of storiesByChild) {
    const child = childById.get(childId);
    if (!child) continue;

    const classFolder = sanitizeFileNamePart(child.class_name?.trim() || UNASSIGNED_CLASS_FOLDER);
    const childFolder = sanitizeFileNamePart(child.first_name);
    const multipleStories = childStories.length > 1;

    for (const story of childStories) {
      const fileName = multipleStories
        ? `${classFolder}/${childFolder}/${sanitizeFileNamePart(story.theme_key)}-${story.id.slice(0, 8)}.pdf`
        : `${classFolder}/${childFolder}.pdf`;
      plan.push({ storyId: story.id, fileName });
    }
  }
  return plan;
}
