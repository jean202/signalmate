import { Directory, File, Paths } from 'expo-file-system';

const MIME_EXTENSION: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function cacheDirectory(): Directory {
  return new Directory(Paths.cache, 'signalmate-analysis');
}

export function cacheFileName(id: string, fileName: string, mimeType: string): string {
  const sourceExtension = fileName.match(/\.(png|jpe?g|webp|gif)$/i)?.[0].toLowerCase();
  const extension = MIME_EXTENSION[mimeType] ?? sourceExtension ?? '.jpg';
  return `${id}${extension === '.jpeg' ? '.jpg' : extension}`;
}

export function cachePickedImage(
  sourceUri: string,
  id: string,
  fileName: string,
  mimeType: string,
): string {
  const directory = cacheDirectory();
  directory.create({ idempotent: true, intermediates: true });
  const source = new File(sourceUri);
  const target = new File(directory, cacheFileName(id, fileName, mimeType));
  if (target.exists) target.delete();
  source.copy(target);
  return target.uri;
}

export function deleteCachedImage(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}

export function clearCachedImages(): void {
  const directory = cacheDirectory();
  if (directory.exists) directory.delete();
}
