import { mkdir, readdir, rm, cp, stat } from 'node:fs/promises'
import { resolve, relative } from 'node:path'

const rootDir = process.cwd()
const docsDir = resolve(rootDir, 'docs')
const versionsDir = resolve(docsDir, 'versions')

const version = process.argv[2]

if (!version || !/^v\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: bun run docs:snapshot -- vX.Y.Z')
  process.exit(1)
}

const snapshotDir = resolve(versionsDir, version)

const exclude = new Set([
  'versions',
  'node_modules',
  '.vitepress/dist',
  '.vitepress/cache'
])

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function copyDocs(sourceDir: string, targetDir: string) {
  const entries = await readdir(sourceDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = resolve(sourceDir, entry.name)
    const relativePath = relative(docsDir, sourcePath)

    if (exclude.has(relativePath) || relativePath.startsWith('versions/')) {
      continue
    }

    const targetPath = resolve(targetDir, relative(sourceDir, sourcePath))

    if (entry.isDirectory()) {
      await mkdir(targetPath, { recursive: true })
      await copyDocs(sourcePath, targetPath)
      continue
    }

    await cp(sourcePath, targetPath, { force: true })
  }
}

await mkdir(versionsDir, { recursive: true })

if (await exists(snapshotDir)) {
  await rm(snapshotDir, { recursive: true, force: true })
}

await mkdir(snapshotDir, { recursive: true })
await copyDocs(docsDir, snapshotDir)

console.log(`Snapshot created at docs/versions/${version}`)

