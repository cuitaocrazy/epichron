import { EventRepo } from './repo'

let eventRepo: EventRepo | undefined = undefined

export function init() {
  throw new Error('not implemented')
}

export function getEventRepo() {
  return eventRepo!
}
