import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const srcDir = join(root, 'src')
const envExamplePath = join(root, '.env.example')

function walk(dir) {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? walk(path) : [path]
    })
    .filter((path) => /\.(ts|tsx|js|jsx|mjs)$/.test(path))
}

const envExample = readFileSync(envExamplePath, 'utf8')
const documented = new Set(
  envExample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')[0])
)

const used = new Map()
const pattern = /import\.meta\.env\.(VITE_[A-Z0-9_]+)/g

for (const file of walk(srcDir)) {
  const content = readFileSync(file, 'utf8')
  for (const match of content.matchAll(pattern)) {
    const name = match[1]
    if (!used.has(name)) used.set(name, [])
    used.get(name).push(relative(root, file))
  }
}

const missing = [...used.keys()].filter((name) => !documented.has(name))

if (missing.length > 0) {
  console.error('Missing variables in .env.example:')
  for (const name of missing) {
    console.error(`- ${name} used in ${[...new Set(used.get(name))].join(', ')}`)
  }
  process.exit(1)
}

console.log('.env.example includes every VITE_* variable used in src/.')
