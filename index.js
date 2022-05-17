import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import YAML from 'yaml'
import globSync from 'glob/sync.js'
import { fullJoin } from 'array-join'
import deepmerge from 'deepmerge'
import uniq from 'lodash.uniq'

const DEFAULT_DIR = `qmk_firmware`
const DEFAULT_USER = `qmk`
const DEFAULT_REPO = `qmk_firmware`
const DEFAULT_BRANCH = `master`
const dryRun = process.env.DRY_RUN !== undefined

function keyboardToString(kb) {
  return `${kb.fork?.username ? kb.fork.username : DEFAULT_USER}-${
    kb.fork?.repository ? kb.fork.repository : DEFAULT_REPO
  }-${kb.fork?.branch ? kb.fork.branch : DEFAULT_BRANCH}`
}

function run(cmd, opts = {}) {
  if (dryRun) {
    console.log(cmd, opts)
  } else {
    execSync(cmd, opts)
  }
}

const keyboards = globSync('**/keyboards.yml')
  .map((file) => {
    const content = fs.readFileSync(file, 'utf8')
    const data = YAML.parse(content)
    ;(data || []).forEach((item) => {
      if (
        item.keyboard === undefined ||
        item.keyboard === '' ||
        item.keymaps === undefined ||
        !(item.keymaps instanceof Array)
      ) {
        throw new Error('Keyboard or keymaps is undefined')
      }
      if (item.fork && (item.fork.username === undefined || item.fork.username === '')) {
        throw new Error('Fork username is undefined')
      }
    })
    return data
  })
  .reduce((acc, curr) => {
    return fullJoin(
      acc,
      curr,
      (l) => `${keyboardToString(l)}-${l.keyboard}`,
      (r) => `${keyboardToString(r)}-${r.keyboard}`,
      (l, r) => {
        let merge = deepmerge(l || {}, r || {})
        merge.keymaps = uniq(merge.keymaps)
        return merge
      },
    )
  })

const qmkHome = process.env.QMK_HOME || path.resolve(process.cwd(), DEFAULT_DIR)
const forkSetup = []
let currentBranch = `${DEFAULT_USER}-${DEFAULT_REPO}-${DEFAULT_BRANCH}`
let count = 0

run(`git checkout ${DEFAULT_BRANCH}`, { cwd: qmkHome })
run(`git pull`, { cwd: qmkHome })
;(keyboards || []).forEach((kb) => {
  ;(kb.keymaps || []).forEach((km) => {
    try {
      if (currentBranch !== keyboardToString(kb)) {
        if (kb.fork) {
          let forkPath = `${kb.fork.username}/${kb.fork.repository || DEFAULT_REPO}`
          if (!forkSetup.includes(forkPath)) {
            try {
              run(`git remote add ${kb.fork.username} https://github.com/${forkPath}.git`, { cwd: qmkHome })
            } catch (e) {
              console.info(`Fork ${kb.fork.username} already exists`)
            }
            run(`git fetch ${kb.fork.username}`, { cwd: qmkHome })
            forkSetup.push(forkPath)
          }
          run(`git checkout ${kb.fork.username}/${kb.fork.branch || DEFAULT_BRANCH}`, { cwd: qmkHome })
        } else {
          run(`git checkout ${DEFAULT_BRANCH}`, { cwd: qmkHome })
        }
        currentBranch = keyboardToString(kb)
      }
      run(`qmk compile -kb ${kb.keyboard} -km ${km}`)
      count++
    } catch (e) {
      console.error(e.message)
    }
  })
})

if (currentBranch !== `${DEFAULT_USER}-${DEFAULT_REPO}-${DEFAULT_BRANCH}`) {
  run(`git checkout ${DEFAULT_BRANCH}`, { cwd: qmkHome })
}

console.log(`✨ Compiled ${count} keymaps.`)
