export type ProbeStatus<R> =
  | {
      status: 'succeeded'
      result: R
    }
  | {
      status: 'call'
    }

export type BaseEffect = (
  ac: AbortController,
  ...args: any
) => Promise<any>

type TailParameters<T extends (...args: any) => any> = T extends (
  _: any,
  ...args: infer P
) => any
  ? P
  : never

export type Probe<F extends BaseEffect> = (
  ...args: Parameters<F>
) => Promise<ProbeStatus<BaseEffectReturnType<F>>>

export type Rollback<F extends BaseEffect> = (
  succeeded: boolean,
  ret: BaseEffectReturnType<F>,
  ...args: Parameters<F>
) => Promise<void>

type BaseEffectReturnType<F extends BaseEffect> = F extends (
  ...args: any
) => Promise<infer R>
  ? R
  : never

export const effectSymbol = Symbol.for('effect')
export type EffectType = 'Effect' | 'GetSystemParameters'

export type EffectDescriptorWithArgs<
  F extends BaseEffect = BaseEffect,
> = {
  [effectSymbol]: EffectType
  funcArgs: TailParameters<F>
  effectDescriptor: {
    name: string
    effect: F
    probe: Probe<F>
    rollback: Rollback<F>
  }
}

export type EffectDescriptor<F extends BaseEffect = BaseEffect> =
  EffectDescriptorWithArgs<F>['effectDescriptor']

export function createSagaEffectCaller<F extends BaseEffect>(
  effect: F,
  probe: Probe<F>,
  rollback: Rollback<F>,
  name?: string,
): (...funcArgs: TailParameters<F>) => EffectDescriptorWithArgs<F> {
  return (...funcArgs) => {
    const effectDescriptor = {
      name: name || (effect as any).name || 'anonymous',
      effect,
      probe,
      rollback,
    }

    return {
      [effectSymbol]: 'Effect',
      funcArgs: funcArgs,
      effectDescriptor: effectDescriptor,
    }
  }
}

export type SystemParameters = {
  sagaId: string
  currentStepId: string
  historyRepo: any
  eventRepo: any
}

export function getSystemParameters(): EffectDescriptorWithArgs<
  () => Promise<SystemParameters>
> {
  return {
    [effectSymbol]: 'GetSystemParameters',
    funcArgs: [],
    effectDescriptor: {
      name: 'getSystemParameters',
      effect: async () => {
        throw new Error(
          "getSystemParameters's effect should not be called",
        )
      },
      probe: async () => {
        throw new Error(
          "getSystemParameters's probe should not be called",
        )
      },
      rollback: async () => {
        throw new Error(
          "getSystemParameters's rollback should not be called",
        )
      },
    },
  }
}
