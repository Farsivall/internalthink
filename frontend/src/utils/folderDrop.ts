/**
 * Parse a drop event: detect if a folder was dropped and collect all files with relative paths
 * so we can recreate the folder structure. Uses webkitGetAsEntry (Chrome, Edge, Safari).
 */

export interface DroppedFile {
  relativePath: string
  file: File
}

export interface FolderDropResult {
  isFolderDrop: boolean
  rootName?: string
  files: DroppedFile[]
}

const ACCEPT_EXT = /\.(pdf|txt|md|docx?|pptx?)$/i
const ACCEPT_TYPES = /^(text\/|application\/pdf|application\/vnd\.openxmlformats)/i

function isAcceptedFile(file: File): boolean {
  return ACCEPT_EXT.test(file.name) || ACCEPT_TYPES.test(file.type || '')
}

function readDirectoryReader(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject)
  })
}

async function collectFilesFromDirectory(
  dirEntry: FileSystemDirectoryEntry,
  basePath: string
): Promise<DroppedFile[]> {
  const reader = dirEntry.createReader()
  const results: DroppedFile[] = []
  let entries = await readDirectoryReader(reader)
  while (entries.length > 0) {
    for (const entry of entries) {
      const fullPath = basePath ? `${basePath}/${entry.name}` : entry.name
      if (entry.isDirectory) {
        const sub = await collectFilesFromDirectory(entry as FileSystemDirectoryEntry, fullPath)
        results.push(...sub)
      } else {
        const file = await new Promise<File>((resolve, reject) => {
          (entry as FileSystemFileEntry).file(resolve, reject)
        })
        if (isAcceptedFile(file)) {
          results.push({ relativePath: fullPath, file })
        }
      }
    }
    entries = await readDirectoryReader(reader)
  }
  return results
}

/**
 * Parse dataTransfer from a drop event. If the drop contains a directory (first item),
 * walk it and return all accepted files with relative paths. Otherwise return flat file list.
 */
export async function getDroppedFilesAndFolders(
  dataTransfer: DataTransfer
): Promise<FolderDropResult> {
  const items = dataTransfer?.items
  if (!items || items.length === 0) {
    const files = Array.from(dataTransfer.files || []).filter(isAcceptedFile)
    return {
      isFolderDrop: false,
      files: files.map((file) => ({ relativePath: file.name, file })),
    }
  }

  const item = items[0]
  const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null

  if (entry?.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    const rootName = dirEntry.name
    const files = await collectFilesFromDirectory(dirEntry, '')
    return { isFolderDrop: true, rootName, files }
  }

  const files = Array.from(dataTransfer.files || []).filter(isAcceptedFile)
  return {
    isFolderDrop: false,
    files: files.map((file) => ({ relativePath: file.name, file })),
  }
}

/**
 * From a list of relative paths (e.g. "Legal/Contracts/doc.pdf"), return folder paths
 * in order so parents come before children. Root folder (rootName) is the first segment.
 */
export function getOrderedFolderPaths(
  relativePaths: string[],
  rootName: string
): string[] {
  const set = new Set<string>()
  for (const p of relativePaths) {
    const parts = p.split('/')
    if (parts.length <= 1) continue
    for (let i = 1; i < parts.length; i++) {
      set.add(parts.slice(0, i).join('/'))
    }
  }
  const sorted = Array.from(set).sort((a, b) => {
    const ad = (a.match(/\//g) || []).length
    const bd = (b.match(/\//g) || []).length
    return ad - bd || a.localeCompare(b)
  })
  return sorted
}
