import { ModuleRef } from '@nestjs/core';
import { JobName, QueueJobStatus, QueueName } from 'src/enum.js';
import { ConfigRepository } from 'src/repositories/config.repository.js';
import { EventRepository } from 'src/repositories/event.repository.js';
import { JobRepository } from 'src/repositories/job.repository.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import type { JobItem } from 'src/types.js';

describe('PHOLY upload job scheduling', () => {
  const queue = { add: vi.fn(), addBulk: vi.fn(), getJobs: vi.fn(), getJobCounts: vi.fn() };
  let sut: JobRepository;

  beforeEach(() => {
    vi.resetAllMocks();
    sut = new JobRepository(
      { get: () => queue } as unknown as ModuleRef,
      {} as ConfigRepository,
      {} as EventRepository,
      { setContext: vi.fn() } as unknown as LoggingRepository,
    );
    // Isolate queue submission from handler discovery and live Redis.
    Object.assign(sut, {
      handlers: {
        [JobName.AssetGenerateThumbnails]: { queueName: QueueName.ThumbnailGeneration },
        [JobName.PersonGenerateThumbnail]: { queueName: QueueName.ThumbnailGeneration },
        [JobName.AssetExtractMetadata]: { queueName: QueueName.MetadataExtraction },
        [JobName.StorageTemplateMigrationSingle]: { queueName: QueueName.StorageTemplateMigration },
        [JobName.AssetEncodeVideo]: { queueName: QueueName.VideoConversion },
      },
    });
  });

  it('submits foreground and background priorities in BullMQ bulk opts', async () => {
    await sut.queueAll([
      { name: JobName.AssetGenerateThumbnails, data: { id: 'old' } },
      { name: JobName.AssetGenerateThumbnails, data: { id: 'new', source: 'upload' } },
    ]);
    expect(queue.addBulk).toHaveBeenCalledExactlyOnceWith([
      { name: JobName.AssetGenerateThumbnails, data: { id: 'old' }, opts: { priority: 10 } },
      { name: JobName.AssetGenerateThumbnails, data: { id: 'new', source: 'upload' }, opts: { priority: 1 } },
    ]);
  });

  it('preserves storage migration deduplication and upload priority', async () => {
    const item: JobItem = { name: JobName.StorageTemplateMigrationSingle, data: { id: 'asset', source: 'upload' } };
    await sut.queue(item);
    expect(queue.add).toHaveBeenCalledExactlyOnceWith(item.name, item.data, { jobId: 'asset', priority: 1 });
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('keeps expensive video work in its existing FIFO queue', async () => {
    const item: JobItem = { name: JobName.AssetEncodeVideo, data: { id: 'video', source: 'upload' } };
    await sut.queue(item);
    expect(queue.addBulk).toHaveBeenCalledWith([{ ...item, opts: {} }]);
  });

  it('includes prioritized jobs in the administrative waiting total', async () => {
    queue.getJobCounts.mockResolvedValue({
      active: 2,
      completed: 3,
      failed: 1,
      delayed: 4,
      waiting: 5,
      prioritized: 6,
    });
    expect(await sut.getJobCounts(QueueName.ThumbnailGeneration)).toEqual({
      active: 2,
      completed: 3,
      failed: 1,
      delayed: 4,
      waiting: 11,
    });
  });

  it.each([QueueJobStatus.Waiting, QueueJobStatus.Paused])(
    'shows prioritized jobs when searching %s',
    async (status) => {
      queue.getJobs.mockResolvedValue([]);
      await sut.searchJobs(QueueName.ThumbnailGeneration, { status: [status] });
      expect(queue.getJobs).toHaveBeenCalledWith(['waiting', 'prioritized'], 0, 1000);
    },
  );
});
