/**
 * Download the free MaxMind GeoLite2 databases into etl/geoip/.
 *   node geoip-update.mjs
 * Needs MAXMIND_LICENSE_KEY (+ MAXMIND_ACCOUNT_ID) in etl/.env.
 *
 * The .mmdb files are gitignored (large + MaxMind's license restricts
 * redistribution). Re-run this to refresh; MaxMind updates GeoLite2 twice a
 * week. Lookups run entirely offline against these files — no IP ever leaves
 * our infrastructure.
 *
 * Attribution (required by the GeoLite2 EULA): "This product includes GeoLite2
 * data created by MaxMind, available from https://www.maxmind.com" — surfaced
 * in the app UI where location is shown.
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import * as tar from 'tar'

const KEY = process.env.MAXMIND_LICENSE_KEY
if (!KEY) { console.error('Missing MAXMIND_LICENSE_KEY in etl/.env'); process.exit(1) }

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'geoip')
fs.mkdirSync(DIR, { recursive: true })

const EDITIONS = ['GeoLite2-City', 'GeoLite2-ASN', 'GeoLite2-Country']

for (const edition of EDITIONS) {
  const url = `https://download.maxmind.com/app/geoip_download?edition_id=${edition}&license_key=${encodeURIComponent(KEY)}&suffix=tar.gz`
  process.stdout.write(`↓ ${edition} … `)
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`\n  failed ${res.status}: ${(await res.text()).slice(0, 200)}`)
    process.exit(1)
  }
  const tmp = path.join(DIR, `${edition}.tar.gz`)
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp))
  // The tarball is <edition>_<date>/<edition>.mmdb — strip the dated folder so
  // the .mmdb lands at a stable path (geoip/<edition>.mmdb).
  await tar.x({ file: tmp, cwd: DIR, strip: 1, filter: (p) => p.endsWith('.mmdb') })
  fs.unlinkSync(tmp)
  const mmdb = path.join(DIR, `${edition}.mmdb`)
  console.log(`ok (${(fs.statSync(mmdb).size / 1e6).toFixed(1)} MB)`)
}
console.log('GeoLite2 databases ready in etl/geoip/')
