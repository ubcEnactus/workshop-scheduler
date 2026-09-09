import EmbeddedPostgres from 'embedded-postgres'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'

export async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

export function runNode(script, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: 'inherit',
      windowsHide: true,
      ...options,
    })
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))
    )
  })
}

export async function startDatabase(kind) {
  const root = path.resolve(
    'work',
    kind === 'dev' ? 'dev-db' : `test-db-${randomBytes(6).toString('hex')}`
  )
  await mkdir(root, { recursive: true })
  const settingsFile = path.join(root, 'settings.json')
  let settings
  try {
    settings = JSON.parse(await readFile(settingsFile, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    settings = { port: await freePort(), password: randomBytes(24).toString('hex') }
    await writeFile(settingsFile, JSON.stringify(settings), { flag: 'wx', mode: 0o600 })
  }
  const databaseDir = path.join(root, 'data')
  const pg = new EmbeddedPostgres({
    databaseDir,
    port: settings.port,
    user: 'postgres',
    password: settings.password,
    persistent: true,
    postgresFlags: ['-h', '127.0.0.1'],
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: console.error,
  })
  try {
    await readFile(path.join(databaseDir, 'PG_VERSION'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await pg.initialise()
  }
  await pg.start()
  const name = kind === 'dev' ? 'workshop_dev' : 'workshop_test'
  const client = pg.getPgClient('postgres', '127.0.0.1')
  await client.connect()
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (existing.rowCount === 0) await pg.createDatabase(name)
  } finally {
    await client.end()
  }
  return {
    pg,
    url: `postgresql://postgres:${settings.password}@127.0.0.1:${settings.port}/${name}`,
    root,
  }
}
