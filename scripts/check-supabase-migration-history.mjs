import { readdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

// Parse the CLI's local/remote table. Never guess and apply older migrations.
export const parseHistory = (raw) => {
  const pairs = []
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/\x1b\[[0-9;]*m/g, '').replace(/^\s*[│|]\s*/, '')
    if (!line.includes('│') && !line.includes('|')) continue
    const cols = line.split(/[│|]/)
    if (cols.length < 3) continue
    const local = cols[0].trim()
    const remote = cols[1].trim()
    if ((local && !/^\d{14}$/.test(local)) || (remote && !/^\d{14}$/.test(remote))) continue
    if (local || remote) pairs.push({ local, remote })
  }
  return pairs
}

export const checkHistory = (filenames, history) => {
  const local = new Set(filenames.map(x => /^(\d{14})_[a-zA-Z0-9_-]+\.sql$/.exec(x)?.[1]).filter(Boolean))
  const remote = new Set(history.map(x => x.remote).filter(Boolean))
  if (!remote.size || !local.size) throw Error('운영 DB 또는 로컬 마이그레이션 이력을 읽지 못했습니다.')
  const lastRemote = [...remote].sort().at(-1)
  const missingRemoteFiles = [...remote].filter(v => !local.has(v)).sort()
  const historicLocalNotApplied = [...local].filter(v => v <= lastRemote && !remote.has(v)).sort()
  if (missingRemoteFiles.length || historicLocalNotApplied.length) {
    throw Error('운영 DB와 저장소의 과거 마이그레이션 이력이 일치하지 않습니다. 배포 중단.\n'
      + '저장소에 없는 운영 버전: ' + (missingRemoteFiles.join(', ') || '없음') + '\n'
      + '적용되지 않은 과거 저장소 버전: ' + (historicLocalNotApplied.join(', ') || '없음') + '\n'
      + '운영 가이드의 이력 복구 절차를 확인하세요.')
  }
  return [...local].filter(v => !remote.has(v)).sort()
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw Error('사용법: node check-supabase-migration-history.mjs <migration-list-output>')
    const raw = readFileSync(process.argv[2], 'utf8')
    const filenames = readdirSync('supabase/migrations')
    const pending = checkHistory(filenames, parseHistory(raw))
    console.log('기존 마이그레이션 이력 일치. 새로 적용할 마이그레이션:',
      pending.length ? pending.join(', ') : '없음')
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  }
}
