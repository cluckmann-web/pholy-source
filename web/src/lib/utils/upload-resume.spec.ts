import {
  matchesResumableFile,
  readResumableUploads,
  writeResumableUploads,
  type ResumableUpload,
} from '#lib/utils/upload-resume.ts';
import { beforeEach, describe, expect, it } from 'vitest';

const record: ResumableUpload = {
  id: 'session-id',
  ownerId: 'alice',
  fileName: 'photo.jpg',
  fileSize: 3,
  lastModified: 12_345,
  checksum: 'a'.repeat(40),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  offset: 2,
};

describe('resumable upload metadata', () => {
  beforeEach(() => localStorage.clear());

  it('requires the same name, size, modified time and verified checksum before resuming', () => {
    const file = new File(['abc'], 'photo.jpg', { lastModified: 12_345 });
    expect(matchesResumableFile(record, file, 'a'.repeat(40))).toBe(true);
    expect(matchesResumableFile(record, file, 'b'.repeat(40))).toBe(false);
    expect(matchesResumableFile(record, new File(['abcd'], 'photo.jpg', { lastModified: 12_345 }))).toBe(false);
    expect(matchesResumableFile(record, new File(['abc'], 'other.jpg', { lastModified: 12_345 }))).toBe(false);
    expect(matchesResumableFile(record, new File(['abc'], 'photo.jpg', { lastModified: 12_346 }))).toBe(false);
  });

  it('isolates records by owner and drops expired or invalid offsets', () => {
    writeResumableUploads([
      record,
      { ...record, id: 'bob', ownerId: 'bob' },
      { ...record, id: 'expired', expiresAt: new Date(0).toISOString() },
      { ...record, id: 'invalid', offset: 4 },
    ]);
    expect(readResumableUploads('alice')).toEqual([record]);
    expect(readResumableUploads('bob').map((item) => item.id)).toEqual(['bob']);
  });

  it('persists only the metadata whitelist, without file contents or tokens', () => {
    writeResumableUploads([
      { ...record, token: 'private', file: new File(['secret'], 'photo.jpg') } as ResumableUpload,
    ]);
    expect(localStorage.getItem('pholy-upload-sessions-v1')).not.toContain('private');
    expect(localStorage.getItem('pholy-upload-sessions-v1')).not.toContain('secret');
    expect(readResumableUploads('alice')).toEqual([record]);
  });

  it('tolerates corrupt browser storage', () => {
    localStorage.setItem('pholy-upload-sessions-v1', '{broken');
    expect(readResumableUploads('alice')).toEqual([]);
  });
});
