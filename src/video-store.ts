// Adaptador QueueStore (do pacote mkivideos) sobre o SQLite do openpcbot.
// A tabela video_jobs vive no mesmo banco das outras features; este adaptador
// só expõe as funções do db.ts no formato que o motor da fila espera.

import type { EnqueueInput, QueueStore } from 'mkivideos';

import {
  enqueueVideoJob,
  getNextQueuedJob,
  getRunningJob,
  markJobRunning,
  markJobDone,
  markJobFailed,
  cancelJob,
  listJobs,
  failStaleRunningJobs,
} from './db.js';

export const videoStore: QueueStore = {
  enqueue: (job: EnqueueInput) => enqueueVideoJob(job),
  getNext: () => getNextQueuedJob(),
  getRunning: () => getRunningJob(),
  markRunning: (id) => markJobRunning(id),
  markDone: (id, path) => markJobDone(id, path),
  markFailed: (id, error) => markJobFailed(id, error),
  cancel: (id) => cancelJob(id),
  list: (limit) => listJobs(limit),
  failStaleRunning: () => failStaleRunningJobs(),
};
