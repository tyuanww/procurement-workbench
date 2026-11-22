import type { DetectImportFile, DetectImportFileDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

export const makeDetectImportFile =
  (deps: DetectImportFileDeps): DetectImportFile =>
  async (input, actor) => {
    authorize(actor, 'imports.write');
    const stored = await deps.files.put({ bytes: input.bytes, originalName: input.fileName, mime: input.mime });
    const book = await deps.workbooks.read(input.bytes, input.fileName);
    const candidates = deps.templates.map((template) => ({ template: template.id, ...template.detect(book) })).sort((left, right) => right.score - left.score);
    return {
      fileId: stored.sha256,
      candidates,
      requiresFactory: candidates.some((item) => item.template === 'factory-progress-v1' && item.score > 0),
      sheets: book.sheets.map((sheet) => ({ name: sheet.name, hidden: sheet.hidden })),
    };
  };
