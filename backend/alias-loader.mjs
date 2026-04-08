import path from 'node:path';
import { pathToFileURL } from 'node:url';

const srcPrefix = '@/';
const srcPath = path.resolve(process.cwd(), 'src');

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(srcPrefix)) {
    const relativePath = specifier.slice(srcPrefix.length);
    const resolvedPath = path.join(srcPath, relativePath);
    return nextResolve(pathToFileURL(resolvedPath).href, context);
  }

  return nextResolve(specifier, context);
}
