import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { exit } from 'process'
import YAML from 'yaml'
import globSync from 'glob/sync.js'
import { fullJoin } from 'array-join'
import deepmerge from 'deepmerge'
import uniq from 'lodash.uniq'
import commandLineArgs from 'command-line-args'
import commandLineUsage from 'command-line-usage'

const DEFAULT_DIR = `qmk_firmware`
const DEFAULT_QMK_USER = `qmk`
const DEFAULT_QMK_REPO = `qmk_firmware`
const DEFAULT_QMK_BRANCH = `master`
const DEFAULT_QMK_KEYMAP = `default`
const DEFAULT_VIA_KEYMAP = `via`
const DEFAULT_VIAL_USER = `vial-kb`
const DEFAULT_VIAL_REPO = `vial-qmk`
const DEFAULT_VIAL_BRANCH = `vial`
const DEFAULT_VIAL_KEYMAP = `vial`

const optionList = [
  {
    name: 'home',
    type: String,
    defaultValue: process.env.QMK_HOME || path.resolve(process.cwd(), DEFAULT_DIR),
    description: 'The path to the qmk_firmware directory',
  },
  {
    name: 'glob',
    type: String,
    defaultOption: true,
    description: 'The glob to use to find keyboards',
  },
  {
    name: 'local',
    type: Boolean,
    description: 'Use the local keyboards definition',
  },
  {
    name: 'vial',
    type: Boolean,
    description: 'Use the vial fork',
  },
  {
    name: 'dry-run',
    type: Boolean,
    defaultValue: process.env.DRY_RUN !== undefined,
    description: 'Do not run any commands',
  },
  {
    name: 'debug',
    type: Boolean,
    description: 'Print debug information',
  },
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Print usage information',
  },
]

const options = commandLineArgs(optionList)

if (options.help) {
  console.log(
    commandLineUsage([
      {
        header: 'QMK Firmware Build',
        optionList: optionList,
      },
    ]),
  )
  exit(0)
}

function keyboardToString(kb, vial = false) {
  if (vial) {
    return `${kb?.fork?.username ? kb.fork.username : DEFAULT_VIAL_USER}-${
      kb?.fork?.repository ? kb.fork.repository : DEFAULT_VIAL_REPO
    }-${kb?.fork?.branch ? kb.fork.branch : DEFAULT_VIAL_BRANCH}`
  }
  return `${kb?.fork?.username ? kb.fork.username : DEFAULT_QMK_USER}-${
    kb?.fork?.repository ? kb.fork.repository : DEFAULT_QMK_REPO
  }-${kb?.fork?.branch ? kb.fork.branch : DEFAULT_QMK_BRANCH}`
}

function run(cmd, opts = {}) {
  let args = cmd.split(' ')
  let cmdName = args.shift()
  if (options.debug || options['dry-run']) {
    console.log(cmdName, args, opts)
    if (options['dry-run']) {
      return { status: 0 }
    }
  }
  return spawnSync(cmdName, args, opts)
}

function compile(keyboard, keymap = DEFAULT_QMK_KEYMAP) {
  let res = run(`qmk compile -kb ${keyboard} -km ${keymap}`)
  if (res.status !== 0) {
    if (fs.existsSync(path.join(options.home, `${keyboard.replaceAll('/', '_')}_${keymap}.hex`))) {
      fs.unlinkSync(path.join(options.home, `${keyboard.replaceAll('/', '_')}_${keymap}.hex`))
    }
    if (fs.existsSync(path.join(options.home, `${keyboard.replaceAll('/', '_')}_${keymap}.bin`))) {
      fs.unlinkSync(path.join(options.home, `${keyboard.replaceAll('/', '_')}_${keymap}.bin`))
    }
    console.log(`Compiling ${keyboard}:${keymap}... KO`)
    return false
  } else {
    console.log(`Compiling ${keyboard}:${keymap}... OK`)
    return true
  }
}

const forkSetup = []
let currentBranch = keyboardToString(undefined, options.vial)
let count = 0

if (options.vial) {
  options.glob = undefined
  run(`git remote add ${DEFAULT_VIAL_USER} https://github.com/${DEFAULT_VIAL_USER}/${DEFAULT_VIAL_REPO}.git`, {
    cwd: options.home,
  })
  run(`git fetch ${DEFAULT_VIAL_USER}`, { cwd: options.home })
  run(`git checkout ${DEFAULT_VIAL_USER}/${DEFAULT_VIAL_BRANCH}`, { cwd: options.home })
} else {
  run(`git checkout ${DEFAULT_QMK_BRANCH}`, { cwd: options.home })
  run(`git pull`, { cwd: options.home })
}

let detected = undefined
if (options.glob) {
  detected = globSync(path.join(options.glob, '**', 'info.json'), { cwd: path.join(options.home, 'keyboards') }).map(
    (file) => {
      return {
        keyboard: path.dirname(file),
        keymaps: [DEFAULT_VIA_KEYMAP],
      }
    },
  )
}

let local = undefined
if (options.local) {
  let localPath = '**/keyboards.yml'
  if (options.vial) {
    localPath = '**/vial.yml'
  }
  local = globSync(localPath)
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
}

let vial = undefined
if (options.vial) {
  vial = globSync(path.join('**', 'keymaps', 'vial', 'vial.json'), {
    cwd: path.join(options.home, 'keyboards'),
  }).map((file) => {
    return {
      keyboard: path.dirname(path.join(file, '..', '..')),
      keymaps: [DEFAULT_VIAL_KEYMAP],
    }
  })
}

;[]
  .concat(detected || [])
  .concat(local || [])
  .concat(vial || [])
  .forEach((kb) => {
    ;(kb.keymaps || []).forEach((km) => {
      if (currentBranch !== keyboardToString(kb, options.vial)) {
        if (kb.fork) {
          let forkPath = `${kb.fork.username}/${kb.fork.repository || DEFAULT_QMK_REPO}`
          if (!forkSetup.includes(forkPath)) {
            run(`git remote add ${kb.fork.username} https://github.com/${forkPath}.git`, { cwd: options.home })
            run(`git fetch ${kb.fork.username}`, { cwd: options.home })
            forkSetup.push(forkPath)
          }
          run(`git checkout ${kb.fork.username}/${kb.fork.branch || DEFAULT_QMK_BRANCH}`, { cwd: options.home })
        } else if (options.vial) {
          run(`git checkout ${DEFAULT_VIAL_USER}/${DEFAULT_VIAL_BRANCH}`, { cwd: options.home })
        } else {
          run(`git checkout ${DEFAULT_QMK_BRANCH}`, { cwd: options.home })
        }
        currentBranch = keyboardToString(kb, options.vial)
      }
      if (compile(kb.keyboard, km)) {
        count++
      } else if (km === DEFAULT_VIA_KEYMAP) {
        if (compile(kb.keyboard, DEFAULT_QMK_KEYMAP)) {
          count++
        }
      }
    })
  })

if (currentBranch !== `${DEFAULT_QMK_USER}-${DEFAULT_QMK_REPO}-${DEFAULT_QMK_BRANCH}`) {
  run(`git checkout ${DEFAULT_QMK_BRANCH}`, { cwd: options.home })
}

console.log(`✨ Compiled ${count} keymaps.`)
