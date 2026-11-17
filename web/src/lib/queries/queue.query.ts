import { QueueCommand, QueueName, getQueues, runQueueCommandLegacy } from '@immich/sdk';
import { mutationOptions, queryOptions } from '@tanstack/svelte-query';

export const queuesQueryKey = ['queues'] as const;

export const getQueuesQuery = () =>
  queryOptions({
    queryKey: queuesQueryKey,
    queryFn: ({ signal }) => getQueues({ signal }),
    staleTime: 0,
  });

export const scanAllLibrariesMutation = () =>
  mutationOptions({
    mutationFn: () =>
      runQueueCommandLegacy({ name: QueueName.Library, queueCommandDto: { command: QueueCommand.Start } }),
    meta: {
      success: { toast: { color: 'info', description: 'admin.refreshing_all_libraries' } },
      error: { toast: 'errors.unable_to_scan_libraries' },
    },
  });
