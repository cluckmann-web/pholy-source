import { ServiceUnavailableException } from '@nestjs/common';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
} from 'kysely';
import { ConfigRepository } from 'src/repositories/config.repository.js';
import { PholyUploadRepository } from 'src/repositories/pholy-upload.repository.js';
import type { DB } from 'src/schema/index.js';

describe('PHOLY upload lock isolation', () => {
  let repository: PholyUploadRepository;
  let lockDb: Kysely<DB>;
  let connections: number;
  const blockedKeys = new Set<string>();
  const queries: Array<{ connection: number; sql: string; key: string }> = [];

  beforeEach(() => {
    connections = 0;
    queries.length = 0;
    blockedKeys.clear();
    const driver = new DummyDriver();
    vi.spyOn(driver, 'acquireConnection').mockImplementation(() => {
      const connection = ++connections;
      return Promise.resolve({
        executeQuery: (query: CompiledQuery) => {
          const key = String(query.parameters[0]);
          queries.push({ connection, sql: query.sql, key });
          return Promise.resolve({
            rows: query.sql.includes('pg_try_advisory_lock') ? [{ locked: !blockedKeys.has(key) }] : [],
          });
        },
      } as unknown as DatabaseConnection);
    });
    lockDb = new Kysely<DB>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => driver,
        createIntrospector: (db) => new PostgresIntrospector(db),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
    });
    repository = new PholyUploadRepository({} as Kysely<DB>, {} as ConfigRepository);
    // Inject an isolated connection driver. No real application pool or database
    // participates, but Kysely still compiles and runs the actual lock SQL.
    Object.assign(repository, { lockDb });
  });

  afterEach(async () => {
    await repository.onModuleDestroy();
  });

  it('acquires owner and session keys once on one connection and releases in reverse order', async () => {
    expect(await repository.withLock(['session:b', 'owner:a', 'session:b'], () => Promise.resolve('result'))).toBe(
      'result',
    );
    expect(connections).toBe(1);
    expect(queries.map(({ connection }) => connection)).toEqual([1, 1, 1, 1]);
    expect(queries.map(({ key }) => key)).toEqual([
      'pholy-upload:owner:a',
      'pholy-upload:session:b',
      'pholy-upload:session:b',
      'pholy-upload:owner:a',
    ]);
    expect(queries.slice(0, 2).every(({ sql }) => sql.includes('pg_try_advisory_lock'))).toBe(true);
    expect(queries.slice(2).every(({ sql }) => sql.includes('pg_advisory_unlock'))).toBe(true);
  });

  it('releases acquired locks when the protected operation fails', async () => {
    await expect(
      repository.withLock(['owner:a', 'session:b'], () => Promise.reject(new Error('synthetic stream error'))),
    ).rejects.toThrow('synthetic stream error');
    expect(queries.filter(({ sql }) => sql.includes('pg_advisory_unlock')).map(({ key }) => key)).toEqual([
      'pholy-upload:session:b',
      'pholy-upload:owner:a',
    ]);
    expect(await repository.withLock('owner:a', () => Promise.resolve('recovered'))).toBe('recovered');
  });

  it('releases earlier keys and never runs a callback when a later key is busy', async () => {
    blockedKeys.add('pholy-upload:session:b');
    const callback = vi.fn();
    await expect(repository.withLock(['owner:a', 'session:b'], callback)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(callback).not.toHaveBeenCalled();
    expect(queries.map(({ key }) => key)).toEqual([
      'pholy-upload:owner:a',
      'pholy-upload:session:b',
      'pholy-upload:owner:a',
    ]);
    expect(queries[2].sql).toContain('pg_advisory_unlock');
  });

  it('rejects excess transfers before acquiring another connection and admits them after release', async () => {
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const pending = Array.from({ length: 4 }, (_, index) => repository.withLock(`session:${index}`, () => gate));
    await expect(repository.withLock('session:overflow', () => Promise.resolve())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    release();
    await Promise.all(pending);
    expect(connections).toBe(4);
    expect(await repository.withLock('session:next', () => Promise.resolve('available'))).toBe('available');
    expect(connections).toBe(5);
  });
});
