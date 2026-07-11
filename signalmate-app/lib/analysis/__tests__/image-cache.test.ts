type FileSystemEvent =
  | {
      kind: 'directory.create';
      uri: string;
      options: { idempotent: boolean; intermediates: boolean };
    }
  | { kind: 'directory.delete'; uri: string }
  | { kind: 'file.copy'; sourceUri: string; targetUri: string }
  | { kind: 'file.delete'; uri: string };

const mockFileSystemState = {
  directories: new Map<string, boolean>(),
  files: new Map<string, boolean>(),
  events: [] as FileSystemEvent[],
};
let directoryConstructionCount = 0;
let mockPlatformOS = 'ios';

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
}));

jest.mock('expo-file-system', () => {
  const joinUri = (parts: Array<string | { uri: string }>) => parts
    .map((part) => typeof part === 'string' ? part : part.uri)
    .reduce((uri, part) => `${uri.replace(/\/$/, '')}/${part.replace(/^\//, '')}`);

  class Directory {
    uri: string;

    constructor(...parts: Array<string | { uri: string }>) {
      directoryConstructionCount += 1;
      this.uri = `${joinUri(parts)}/`;
    }

    get exists() {
      return mockFileSystemState.directories.get(this.uri) ?? false;
    }

    create(options: { idempotent: boolean; intermediates: boolean }) {
      mockFileSystemState.events.push({ kind: 'directory.create', uri: this.uri, options });
      mockFileSystemState.directories.set(this.uri, true);
    }

    delete() {
      mockFileSystemState.events.push({ kind: 'directory.delete', uri: this.uri });
      mockFileSystemState.directories.set(this.uri, false);
    }
  }

  class File {
    uri: string;

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = joinUri(parts);
    }

    get exists() {
      return mockFileSystemState.files.get(this.uri) ?? false;
    }

    copy(target: File) {
      mockFileSystemState.events.push({
        kind: 'file.copy', sourceUri: this.uri, targetUri: target.uri,
      });
      mockFileSystemState.files.set(target.uri, true);
    }

    delete() {
      mockFileSystemState.events.push({ kind: 'file.delete', uri: this.uri });
      mockFileSystemState.files.set(this.uri, false);
    }
  }

  return { Paths: { cache: { uri: 'file://cache/' } }, Directory, File };
});

import {
  cacheFileName,
  cachePickedImage,
  clearCachedImages,
  deleteCachedImage,
} from '../image-cache';

describe('analysis image cache', () => {
  beforeEach(() => {
    mockPlatformOS = 'ios';
    directoryConstructionCount = 0;
    mockFileSystemState.directories.clear();
    mockFileSystemState.files.clear();
    mockFileSystemState.events.length = 0;
  });

  test('모듈을 불러올 때는 캐시 디렉터리 객체를 만들지 않는다', () => {
    jest.isolateModules(() => {
      require('../image-cache');
    });

    expect(directoryConstructionCount).toBe(0);
  });

  test('캐시 파일명은 식별자와 허용 확장자만 사용한다', () => {
    expect(cacheFileName('abc', 'IMG 1.PNG', 'image/png')).toBe('abc.png');
    expect(cacheFileName('abc', 'IMG.HEIC', 'image/jpeg')).toBe('abc.jpg');
  });

  test('선택한 이미지를 캐시 디렉터리에 복사하고 대상 URI를 반환한다', () => {
    const sourceUri = 'file://picker/original.png';
    const targetUri = 'file://cache/signalmate-analysis/image-1.png';
    mockFileSystemState.files.set(targetUri, true);

    const result = cachePickedImage(sourceUri, 'image-1', 'original.png', 'image/png');

    expect(result).toBe(targetUri);
    expect(mockFileSystemState.files.get(targetUri)).toBe(true);
    expect(mockFileSystemState.events).toEqual([
      {
        kind: 'directory.create',
        uri: 'file://cache/signalmate-analysis/',
        options: { idempotent: true, intermediates: true },
      },
      { kind: 'file.delete', uri: targetUri },
      { kind: 'file.copy', sourceUri, targetUri },
    ]);
  });

  test('존재하는 캐시 이미지만 삭제한다', () => {
    const existingUri = 'file://cache/existing.png';
    mockFileSystemState.files.set(existingUri, true);

    deleteCachedImage(existingUri);
    deleteCachedImage('file://cache/missing.png');

    expect(mockFileSystemState.events).toEqual([
      { kind: 'file.delete', uri: existingUri },
    ]);
  });

  test('존재하는 캐시 디렉터리만 비운다', () => {
    const cacheDirectoryUri = 'file://cache/signalmate-analysis/';
    mockFileSystemState.directories.set(cacheDirectoryUri, true);

    clearCachedImages();
    clearCachedImages();

    expect(mockFileSystemState.events).toEqual([
      { kind: 'directory.delete', uri: cacheDirectoryUri },
    ]);
  });

  test('웹에서는 파일 시스템 대신 blob URL을 추적해 삭제한다', () => {
    mockPlatformOS = 'web';
    const firstUri = 'blob:http://localhost/image-1';
    const secondUri = 'blob:http://localhost/image-2';
    const revokeObjectURL = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    expect(cachePickedImage(firstUri, 'image-1', 'original.png', 'image/png')).toBe(firstUri);
    expect(cachePickedImage(secondUri, 'image-2', 'original.png', 'image/png')).toBe(secondUri);
    deleteCachedImage(firstUri);
    clearCachedImages();

    expect(revokeObjectURL.mock.calls).toEqual([[firstUri], [secondUri]]);
    expect(directoryConstructionCount).toBe(0);
    expect(mockFileSystemState.events).toEqual([]);
    revokeObjectURL.mockRestore();
  });
});
