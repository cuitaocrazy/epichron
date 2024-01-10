import {
  BaseEffect,
  EffectDescriptorWithArgs,
  Probe,
  Rollback,
  createEffectCaller,
} from './effect-spec'
import { getEventRepo } from './runtime-env'

export function createGeneratorCaller<
  P,
  R,
  G extends (
    payload: P,
  ) => AsyncGenerator<EffectDescriptorWithArgs, R, never>,
>(generator: G, id: string, name: string = 'generator') {
  const effect: (
    ac: AbortController,
    payload: P,
  ) => Promise<R> = async (ac, payload) => {
    const eventRepo = getEventRepo()
    let seq = 0

    throw new Error('not implemented')
  }
  const probe: Probe<typeof effect> = async () => {
    throw new Error('not implemented')
  }
  const rollback: Rollback<typeof effect> = async () => {
    throw new Error('not implemented')
  }
  return createEffectCaller(effect, probe, rollback, 'generator')
}
