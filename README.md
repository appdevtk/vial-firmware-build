# QMK Firmware Build

[![CI](https://github.com/GreatWizard/qmk-firmware-build/actions/workflows/ci.yml/badge.svg)](https://github.com/GreatWizard/qmk-firmware-build/actions/workflows/ci.yml)
[![Publish](https://github.com/GreatWizard/qmk-firmware-build/actions/workflows/publish.yml/badge.svg)](https://github.com/GreatWizard/qmk-firmware-build/actions/workflows/publish.yml)
[![License: GPL-3.0](https://img.shields.io/github/license/GreatWizard/qmk-firmware-build)](https://github.com/GreatWizard/qmk-firmware-build/blob/master/LICENSE.md)
[![Liberapay](https://img.shields.io/liberapay/patrons/GreatWizard.svg?logo=liberapay)](https://liberapay.com/GreatWizard/)

This project uses [QMK Firmware](https://qmk.fm).

It builds all the keyboard firmwares configured in the repository.

## Release

Every week the script is executed by Github Actions and updates the `weekly` tag.

You can download the files directly here:
https://github.com/GreatWizard/qmk-firmware-build/releases/tag/weekly

## Add my keyboards

You can add your keyboards by doing a pull request with the following content:

- create a new user in the `users` directory that is exactly you GitHub nickname
- add a file `keyboards.yml` in your directory following this structure:

```yaml
---
- keyboard: coseyfannitutti/discipline # required
  keymaps: [default, via] # required
- fork: # optional
    username: piit79 # required
    repository: qmk_firmware # optional, defaults to qmk_firmware
    branch: master # optional, defaults to master
  keyboard: 42keebs/mysterium/v15d # required
  keymaps: [via] # required
```
