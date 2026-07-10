jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file://cache/' } },
  Directory: class {
    uri = 'file://cache/signalmate-analysis/';
    exists = false;
    create = jest.fn();
    delete = jest.fn();
  },
  File: class {
    uri = 'file://cache/mock.png';
    exists = false;
    copy = jest.fn();
    delete = jest.fn();
  },
}));

import { cacheFileName } from '../image-cache';

describe('analysis image cache', () => {
  test('캐시 파일명은 식별자와 허용 확장자만 사용한다', () => {
    expect(cacheFileName('abc', 'IMG 1.PNG', 'image/png')).toBe('abc.png');
    expect(cacheFileName('abc', 'IMG.HEIC', 'image/jpeg')).toBe('abc.jpg');
  });
});
