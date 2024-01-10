import type { EffectDescriptorWithArgs } from './effect-spec'

type EffectExeEvent = PrecallEvent | CallEvent

interface PrecallEvent {
  type: 'precall'
  payload: {
    effectInstanceId: string
    effectName: string
  }
}

interface CallEvent {
  type: 'call'
  payload: {
    effectInstanceId: string
    effectName: string
    success: boolean
    ret: any
  }
}

export class UnexpectedEventError extends Error {
  constructor(
    expectedEffectName: string,
    expectedEffectInstanceId: string,
    expectedEventType: string,
    actualEnv: EffectExeEvent,
  ) {
    super(
      `Expected event type '${expectedEventType}' for effect '${expectedEffectName}' with ID ${expectedEffectInstanceId}, but received unexpected event: ${JSON.stringify(
        actualEnv,
      )}`,
    )
    this.name = 'UnexpectedEventError'
  }
}

export type EffectExeParams = {
  effectInstanceId: string

  effectDesc: EffectDescriptorWithArgs

  abortController: AbortController

  historyIterator: AsyncGenerator<
    EffectExeEvent,
    any,
    AbortController
  >

  publish: (
    event: EffectExeEvent,
    abortController: AbortController,
  ) => Promise<void>

  addRollback: (rollback: () => Promise<void>) => void
}

export async function runEffect(
  params: EffectExeParams,
): Promise<any> {
  const precallEvent = await params.historyIterator.next(
    params.abortController,
  )
  const callEvent = await params.historyIterator.next(
    params.abortController,
  )

  handlePrecallEvent(
    precallEvent,
    params.effectInstanceId,
    params.effectDesc.effectDescriptor.name,
  )
  handleCallEvent(
    callEvent,
    params.effectInstanceId,
    params.effectDesc.effectDescriptor.name,
  )

  if (callEvent.done && precallEvent.done) {
    return executeInitialEffect(params)
  } else if (callEvent.done) {
    return executeSubsequentEffect(params)
  } else {
    const evn = callEvent.value as CallEvent

    if (evn.payload.success) {
      registerRollbackAction(params, true, evn.payload.ret)
      return evn.payload.ret
    } else {
      registerRollbackAction(params, false, undefined)
      throw evn.payload.ret
    }
  }
}

async function executeInitialEffect(params: EffectExeParams) {
  await publishPrecallEvent(params)

  const ret = await executeEffect(params)

  return ret
}

async function executeSubsequentEffect(params: EffectExeParams) {
  const probeResult = await params.effectDesc.effectDescriptor.probe(
    params.abortController,
    ...params.effectDesc.funcArgs,
  )

  if (probeResult.status === 'succeeded') {
    await publishCallEvent(params, true, probeResult.result)
    registerRollbackAction(params, true, probeResult.result)
    return probeResult.result
  } else {
    const ret = await executeEffect(params)
    return ret
  }
}

function registerRollbackAction(
  params: EffectExeParams,
  succeeded: boolean,
  ret: any,
) {
  params.addRollback(() => {
    return params.effectDesc.effectDescriptor.rollback(
      succeeded,
      ret,
      params.abortController,
      ...params.effectDesc.funcArgs,
    )
  })
}

function publishCallEvent(
  params: EffectExeParams,
  success: boolean,
  ret: any,
) {
  return params.publish(
    {
      type: 'call',
      payload: {
        effectInstanceId: params.effectInstanceId,
        effectName: params.effectDesc.effectDescriptor.name,
        success,
        ret,
      },
    },
    params.abortController,
  )
}

function publishPrecallEvent(params: EffectExeParams) {
  return params.publish(
    {
      type: 'precall',
      payload: {
        effectInstanceId: params.effectInstanceId,
        effectName: params.effectDesc.effectDescriptor.name,
      },
    },
    params.abortController,
  )
}

async function executeEffect(params: EffectExeParams) {
  try {
    const ret = await params.effectDesc.effectDescriptor.effect(
      params.abortController,
      ...params.effectDesc.funcArgs,
    )

    await publishCallEvent(params, true, ret)
    registerRollbackAction(params, true, ret)

    return ret
  } catch (e: any) {
    if (e.name === 'AbortError') {
      // 为以后加入race做准备
      registerRollbackAction(params, false, undefined)
      throw e
    } else {
      await publishCallEvent(params, false, e)
      registerRollbackAction(params, false, undefined)
      throw e
    }
  }
}

function handlePrecallEvent(
  precallEvent: IteratorResult<EffectExeEvent, any>,
  effectInstanceId: string,
  effectName: string,
) {
  if (
    !precallEvent.done &&
    (precallEvent.value.type !== 'precall' ||
      precallEvent.value.payload.effectInstanceId !==
        effectInstanceId ||
      precallEvent.value.payload.effectName !== effectName)
  ) {
    throw new UnexpectedEventError(
      effectName,
      effectInstanceId,
      'precall',
      precallEvent.value,
    )
  }
}

function handleCallEvent(
  callEvent: IteratorResult<EffectExeEvent, any>,
  effectInstanceId: string,
  effectName: string,
) {
  if (
    !callEvent.done &&
    (callEvent.value.type !== 'call' ||
      callEvent.value.payload.effectInstanceId !== effectInstanceId ||
      callEvent.value.payload.effectName !== effectName)
  ) {
    throw new UnexpectedEventError(
      effectName,
      effectInstanceId,
      'call',
      callEvent.value,
    )
  }
}
