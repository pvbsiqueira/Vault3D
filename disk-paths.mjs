export function diskPathSeparator(platform = 'win32') {
  return platform === 'darwin' ? '/' : '\\';
}

export function joinDiskPath(root, relativePath = '', platform = 'win32') {
  const separator = diskPathSeparator(platform);
  const relative = String(relativePath || '').split(/[\\/]+/).filter(Boolean).join(separator);
  if (!relative) return root;

  const rootText = String(root || '');
  const base = rootText.replace(/[\\/]+$/, '') || (rootText.startsWith('/') ? '/' : '');
  return base === '/' ? `/${relative}` : `${base}${separator}${relative}`;
}

export function dirOfDiskPath(fullPath) {
  const value = String(fullPath || '');
  const index = Math.max(value.lastIndexOf('\\'), value.lastIndexOf('/'));
  return index === -1 ? '' : value.substring(0, index + 1);
}

export function basenameDiskPath(fullPath) {
  return String(fullPath || '').split(/[\\/]/).filter(Boolean).pop() || '';
}
