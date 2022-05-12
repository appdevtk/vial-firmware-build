import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import YAML from 'yaml'
import globSync from 'glob/sync.js'
import { join } from 'array-join'
import deepmerge from 'deepmerge'

let dryRun = process.env.DRY_RUN !== undefined || false

const keyboards = globSync('users/*/keyboards.yml')
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
    return join(
      acc,
      curr,
      (l) =>
        `${l.fork.username ? l.fork.username : 'qmk'}-${l.fork.repository ? l.fork.repository : 'qmk_firmware'}-${
          l.fork.branch ? l.fork.branch : 'master'
        }-${l.keyboard}`,
      (r) =>
        `${r.fork.username ? r.fork.username : 'qmk'}-${r.fork.repository ? r.fork.repository : 'qmk_firmware'}-${
          r.fork.branch ? r.fork.branch : 'master'
        }-${r.keyboard}`,
      (l, r) => deepmerge(l, r),
    )
  })

const qmkHome = path.resolve(process.cwd(), 'qmk_firmware')

;(keyboards || []).forEach((kb) => {
  ;(kb.keymaps || []).forEach((km) => {
    if (dryRun) {
      console.log(`Compile ${kb.keyboard} with the keymap ${km}`, kb.fork ? `(${kb.fork.username})` : '')
    } else {
      if (kb.fork) {
        execSync(
          `git remote add ${kb.fork.username} https://github.com/${kb.fork.username}/${
            kb.fork.repository || 'qmk_firmware'
          }.git`,
          { cwd: qmkHome },
        )
        execSync(`git fetch ${kb.fork.username}`, { cwd: qmkHome })
        execSync(`git checkout ${kb.fork.username}/${kb.fork.branch || 'master'}`, { cwd: qmkHome })
      } else {
        execSync(`git checkout master`, { cwd: qmkHome })
      }
      execSync(`qmk compile -kb ${kb.keyboard} -km ${km}`, (err, stdout, stderr) => {
        if (err) {
          console.error(err)
        }
        console.log(stdout)
        console.error(stderr)
      })
    }
  })
})
