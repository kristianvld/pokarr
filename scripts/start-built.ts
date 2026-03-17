import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const appRoot = process.cwd()
process.env.POKARR_APP_ROOT = appRoot

if (!process.env.POKARR_DATA_DIR) {
  process.env.POKARR_DATA_DIR = resolve(appRoot, 'data')
}

const distDir = resolve(appRoot, 'dist')
process.chdir(distDir)

await import(pathToFileURL(resolve(distDir, 'server.js')).href)
