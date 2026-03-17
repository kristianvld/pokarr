import { rm } from 'node:fs/promises'
import tailwind from 'bun-plugin-tailwind'

await rm('dist', { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: ['server.ts'],
  outdir: 'dist',
  target: 'bun',
  plugins: [tailwind]
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }

  process.exit(1)
}

for (const output of result.outputs) {
  console.log(output.path.replace(`${process.cwd()}/`, ''))
}
