import { app } from 'electron'
import pkg from '../package.json'

export function getAppVersion(): string {
  if (app.isPackaged) {
    return app.getVersion()
  }
  return pkg.version
}
