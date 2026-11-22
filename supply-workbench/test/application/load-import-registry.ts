import { bindCommitExecutors } from '../../packages/application/src/imports/commit/index.js';
import { importCommitExecutors } from '../../packages/importers/src/registry.js';

bindCommitExecutors(importCommitExecutors);
