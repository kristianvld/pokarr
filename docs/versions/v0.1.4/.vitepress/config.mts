import { defineConfig } from 'vitepress'
import { basename, dirname, resolve } from 'node:path'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const currentDocsDir = resolve(__dirname, '..')

function resolveProjectDocsDir() {
  const currentName = basename(currentDocsDir)
  const parentName = basename(resolve(currentDocsDir, '..'))

  if (/^v\d+\.\d+\.\d+$/.test(currentName) && parentName === 'versions') {
    return resolve(currentDocsDir, '..', '..')
  }

  return currentDocsDir
}

const projectDocsDir = resolveProjectDocsDir()

function detectVersionsFromFs(): string[] {
  try {
    return readdirSync(resolve(projectDocsDir, 'versions'))
      .filter((name) => /^v\d+\.\d+\.\d+$/.test(name))
      .sort((a, b) => {
        const [aMajor, aMinor, aPatch] = a.slice(1).split('.').map(Number)
        const [bMajor, bMinor, bPatch] = b.slice(1).split('.').map(Number)
        return bMajor - aMajor || bMinor - aMinor || bPatch - aPatch
      })
  } catch {
    return []
  }
}

const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const isUserSite = repo.endsWith('.github.io')
const base =
  process.env.VITEPRESS_BASE ??
  (process.env.GITHUB_ACTIONS === 'true' && !isUserSite ? `/${repo}/` : '/')
const docsBasePath = process.env.DOCS_BASE_PATH ?? base
let docsVersionList = (process.env.DOCS_VERSION_LIST ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
if (docsVersionList.length === 0) {
  docsVersionList = detectVersionsFromFs()
}
const docsLatestVersion =
  process.env.DOCS_LATEST_VERSION ?? (docsVersionList.length > 0 ? docsVersionList[0] : '')
const deployUrl =
  process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY
    ? `https://${process.env.GITHUB_REPOSITORY.split('/')[0]}.github.io/${repo}/`
    : ''
const latestLink = deployUrl || docsBasePath
const edgeLink = deployUrl ? `${deployUrl}edge/` : `${docsBasePath}edge/`
const versionLink = (version: string) =>
  deployUrl ? `${deployUrl}${version}/` : `${docsBasePath}${version}/`

const versionNavItems = docsVersionList.map((version) => ({
  text: version === docsLatestVersion ? `${version} (latest)` : version,
  link: version === docsLatestVersion ? latestLink : versionLink(version),
  ...(deployUrl && { target: '_self' as const })
}))

if (docsVersionList.length > 0) {
  versionNavItems.push({
    text: 'Edge',
    link: edgeLink,
    ...(deployUrl && { target: '_self' as const })
  })
}

export default defineConfig({
  title: 'pokarr',
  description: 'Self-hosted Sonarr and Radarr retry scheduling with rules, queue visibility, backups, and notifications',
  base,
  cleanUrls: true,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }]],
  vite: {
    define: {
      __DOCS_LATEST__: JSON.stringify(docsLatestVersion),
      __DOCS_IS_DEV__: JSON.stringify(base === '/'),
      __DOCS_BASE_PATH__: JSON.stringify(docsBasePath)
    }
  },
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: 'Documentation', link: '/' },
      ...(versionNavItems.length > 0 ? [{ text: 'Versions', items: versionNavItems }] : [])
    ],
    sidebar: [
      {
        text: 'Start Here',
        items: [
          { text: 'Home', link: '/' },
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Authentication and Access', link: '/security-model' },
          { text: 'Concepts', link: '/concepts' },
        ]
      },
      {
        text: 'Operate',
        items: [
          { text: 'Connecting Instances', link: '/connecting-instances' },
          { text: 'Creating Rules', link: '/creating-rules' },
          { text: 'Scope and Guards', link: '/scope-and-guards' },
          { text: 'Backoff Behavior', link: '/backoff-behavior' },
          { text: 'Dashboard and Activity', link: '/dashboard-and-runs' },
          { text: 'Backups and Restore', link: '/backups-and-restore' },
          { text: 'Notifications', link: '/notifications' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'API and Config Reference', link: '/api-and-config-reference' },
          { text: 'FAQ', link: '/faq' }
        ]
      },
      {
        text: 'Releases',
        items: [
          { text: 'Releases and Versioned Docs', link: '/upgrade-and-release-notes' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/kristianvld/pokarr' }
    ],
    outline: [2, 3]
  }
})
