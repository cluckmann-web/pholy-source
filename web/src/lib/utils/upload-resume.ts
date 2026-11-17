/** Only metadata is persisted. Browsers cannot restore a File after a reload. */
export type ResumableUpload = {
  id: string;
  ownerId: string;
  fileName: string;
  fileSize: number;
  lastModified: number;
  checksum: string;
  albumId?: string;
  isLockedAssets?: boolean;
  expiresAt: string;
  offset: number;
};

const KEY = 'pholy-upload-sessions-v1';
const MAX_RECORDS = 100;

export const matchesResumableFile = (record: ResumableUpload, file: File, checksum?: string) =>
  record.fileName === file.name &&
  record.fileSize === file.size &&
  record.lastModified === file.lastModified &&
  (checksum === undefined || record.checksum === checksum);

export function readResumableUploads(ownerId: string, storage: Storage = localStorage): ResumableUpload[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (value): value is ResumableUpload =>
          typeof value === 'object' &&
          value !== null &&
          typeof value.id === 'string' &&
          value.ownerId === ownerId &&
          typeof value.fileName === 'string' &&
          Number.isSafeInteger(value.fileSize) &&
          value.fileSize > 0 &&
          Number.isSafeInteger(value.lastModified) &&
          typeof value.checksum === 'string' &&
          /^[a-f\d]{40}$/i.test(value.checksum) &&
          typeof value.expiresAt === 'string' &&
          Date.parse(value.expiresAt) > Date.now() &&
          Number.isSafeInteger(value.offset) &&
          value.offset >= 0 &&
          value.offset <= value.fileSize &&
          (value.albumId === undefined || typeof value.albumId === 'string') &&
          (value.isLockedAssets === undefined || typeof value.isLockedAssets === 'boolean'),
      )
      .slice(-MAX_RECORDS);
  } catch {
    return [];
  }
}

export function writeResumableUploads(records: ResumableUpload[], storage: Storage = localStorage) {
  try {
    // Whitelist fields: never persist auth tokens, file contents or arbitrary server responses.
    storage.setItem(
      KEY,
      JSON.stringify(
        records.slice(-MAX_RECORDS).map((record) => ({
          id: record.id,
          ownerId: record.ownerId,
          fileName: record.fileName,
          fileSize: record.fileSize,
          lastModified: record.lastModified,
          checksum: record.checksum,
          albumId: record.albumId,
          isLockedAssets: record.isLockedAssets,
          expiresAt: record.expiresAt,
          offset: record.offset,
        })),
      ),
    );
  } catch {
    // Storage may be disabled or full. Current-tab uploads still work.
  }
}
