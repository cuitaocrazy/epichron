import type { EffectDescriptorWithArgs } from './effect-spec'

type SagaStepEvent = PrecallEvent | CallEvent

interface PrecallEvent {
  type: 'precall'
  payload: {
    stepId: string
    name: string
  }
}

interface CallEvent {
  type: 'call'
  payload: {
    stepId: string
    name: string
    success: boolean
    ret: any
  }
}

/**
 * Error thrown when an unexpected event is received.
 */
export class UnexpectedEventError extends Error {
  constructor(
    expectedName: string,
    expectedStepId: string,
    expectedType: string,
    actualEnv: SagaStepEvent,
  ) {
    super(
      `Expected event type '${expectedType}' for step '${expectedName}' with ID ${expectedStepId}, but received unexpected event: ${JSON.stringify(
        actualEnv,
      )}`,
    )
    this.name = 'UnexpectedEventError'
  }
}

/**
 * Configuration object for executing a saga step.
 * This type defines the necessary configuration to manage and execute a step
 * within a saga, including handling effects, rollbacks, and asynchronous event handling.
 */
export type SagaStepConfig = {
  /**
   * A unique identifier for the saga step. Used to track and manage specific steps
   * within the saga flow.
   */
  stepId: string

  /**
   * The effect descriptor for the saga step. This includes the effect to be executed
   * and its arguments.
   */
  step: EffectDescriptorWithArgs

  /**
   * An AbortController instance used to signal cancellation of the saga step.
   * Useful for aborting asynchronous operations tied to the saga step.
   */
  abortController: AbortController

  /**
   * An asynchronous generator that yields saga step events. This is used to handle
   * the sequencing and history of events within the saga step.
   */
  historyIterator: AsyncGenerator<SagaStepEvent, any, AbortController>

  /**
   * A function to publish events related to the saga step. This is used to emit
   * events such as 'precall' or 'call' events, which can be consumed by the saga
   * or other parts of the system.
   * @param event - The event to publish.
   * @param abortController - An AbortController instance used for cancellation signaling.
   * @returns A promise that resolves when the event is successfully published.
   */
  publish: (
    event: SagaStepEvent,
    abortController: AbortController,
  ) => Promise<void>

  /**
   * A function to add a rollback action for the saga step. This is used to register
   * actions that should be taken in case of a failure or rollback scenario in the
   * saga step.
   * @param rollback - The rollback action to add.
   * @returns A function that, when called, will register the provided rollback action.
   */
  addRollback: (rollback: () => Promise<void>) => void
}

/**
 * Executes a saga step based on the provided configuration.
 * This function orchestrates the saga flow, handling precall and call events,
 * and delegating to specific functions based on the state of these events.
 *
 * @param {SagaStepConfig} config - The configuration object for the saga step.
 * @returns {Promise<any>} The result of the saga step execution.
 */
export async function runSagaStep(
  config: SagaStepConfig,
): Promise<any> {
  const precallEvent = await config.historyIterator.next(
    config.abortController,
  )
  const callEvent = await config.historyIterator.next(
    config.abortController,
  )

  handlePrecallEvent(
    precallEvent,
    config.stepId,
    config.step.effectDescriptor.name,
  )
  handleCallEvent(
    callEvent,
    config.stepId,
    config.step.effectDescriptor.name,
  )

  if (callEvent.done && precallEvent.done) {
    return executeInitialSagaStep(config)
  } else if (callEvent.done) {
    return executeSubsequentSagaStep(config)
  } else {
    const evn = callEvent.value as CallEvent

    if (evn.payload.success) {
      registerRollbackAction(config, true, evn.payload.ret)
      return evn.payload.ret
    } else {
      registerRollbackAction(config, false, undefined)
      throw evn.payload.ret
    }
  }
}

/**
 * Executes the initial step of the saga.
 * This function is responsible for publishing the precall event, executing the effect,
 * and then publishing the call event, indicating the step's completion.
 *
 * @param {SagaStepConfig} config - The configuration object for the saga step.
 * @returns {Promise<any>} The result of the initial step execution.
 */
async function executeInitialSagaStep(config: SagaStepConfig) {
  await publishPrecallEvent(config)

  const ret = await executeEffect(config)

  return ret
}

/**
 * Executes a subsequent step in the saga.
 * This function handles the probe results and executes the effect based on the probe status.
 * It publishes the call event and registers the rollback action as needed.
 *
 * @param {SagaStepConfig} config - The configuration object for the saga step.
 * @returns {Promise<any>} The result of the subsequent step execution.
 */
async function executeSubsequentSagaStep(config: SagaStepConfig) {
  const probeResult = await config.step.effectDescriptor.probe(
    config.abortController,
    ...config.step.funcArgs,
  )

  if (probeResult.status === 'succeeded') {
    await publishCallEvent(config, true, probeResult.result)
    registerRollbackAction(config, true, probeResult.result)
    return probeResult.result
  } else {
    const ret = await executeEffect(config)
    return ret
  }
}

/**
 * Registers a rollback action for the saga step.
 * This function adds a rollback procedure to the configuration, which can be invoked if necessary.
 *
 * @param {SagaStepConfig} config - The configuration object for the saga step.
 * @param {any} [ret] - The result to be used in the rollback action.
 */
function registerRollbackAction(
  config: SagaStepConfig,
  succeeded: boolean,
  ret: any,
) {
  config.addRollback(() => {
    return config.step.effectDescriptor.rollback(
      true,
      ret,
      config.abortController,
      ...config.step.funcArgs,
    )
  })
}

/**
 * Publishes a call event for the saga step.
 *
 * @param {SagaStepConfig} config - The configuration object for the saga step.
 * @param {boolean} success - Indicates whether the step was successful.
 * @param {any} ret - The result or error to be included in the event payload.
 * @returns {Promise<void>}
 */
function publishCallEvent(
  config: SagaStepConfig,
  success: boolean,
  ret: any,
) {
  return config.publish(
    {
      type: 'call',
      payload: {
        stepId: config.stepId,
        name: config.step.effectDescriptor.name,
        success,
        ret,
      },
    },
    config.abortController,
  )
}

/**
 * Publishes a precall event for the saga step.
 *
 * @param {SagaStepConfig} config - The configuration object for the saga step.
 * @returns {Promise<void>}
 */
function publishPrecallEvent(config: SagaStepConfig) {
  return config.publish(
    {
      type: 'precall',
      payload: {
        stepId: config.stepId,
        name: config.step.effectDescriptor.name,
      },
    },
    config.abortController,
  )
}

/**
 * Executes the effect defined in the saga step configuration.
 * This function tries to execute the effect and handles any errors that occur.
 *
 * @param {SagaStepConfig} config - The configuration object for the saga step.
 * @returns {Promise<any>} The result of the effect execution.
 */
async function executeEffect(config: SagaStepConfig) {
  try {
    const ret = await config.step.effectDescriptor.effect(
      config.abortController,
      ...config.step.funcArgs,
    )

    await publishCallEvent(config, true, ret)
    registerRollbackAction(config, true, ret)

    return ret
  } catch (e: any) {
    if (e.name === 'AbortError') {
      // 为以后加入race做准备
      registerRollbackAction(config, false, undefined)
      throw e
    } else {
      await publishCallEvent(config, false, e)
      registerRollbackAction(config, false, undefined)
      throw e
    }
  }
}

/**
 * Handles a precall event in the saga step.
 * This function checks the precall event for consistency and throws an error if there is a mismatch.
 *
 * @param {IteratorResult<SagaStepEvent, any>} precallEvent - The precall event to handle.
 * @param {string} stepId - The expected step ID.
 * @param {string} name - The expected step name.
 * @throws {UnexpectedEventError} If the event is not as expected.
 */
function handlePrecallEvent(
  precallEvent: IteratorResult<SagaStepEvent, any>,
  stepId: string,
  name: string,
) {
  if (
    !precallEvent.done &&
    (precallEvent.value.type !== 'precall' ||
      precallEvent.value.payload.stepId !== stepId ||
      precallEvent.value.payload.name !== name)
  ) {
    throw new UnexpectedEventError(
      name,
      stepId,
      'precall',
      precallEvent.value,
    )
  }
}

/**
 * Handles a call event in the saga step.
 * This function checks the call event for consistency and throws an error if there is a mismatch.
 *
 * @param {IteratorResult<SagaStepEvent, any>} callEvent - The call event to handle.
 * @param {string} stepId - The expected step ID.
 * @param {string} name - The expected step name.
 * @throws {UnexpectedEventError} If the event is not as expected.
 */
function handleCallEvent(
  callEvent: IteratorResult<SagaStepEvent, any>,
  stepId: string,
  name: string,
) {
  if (
    !callEvent.done &&
    (callEvent.value.type !== 'call' ||
      callEvent.value.payload.stepId !== stepId ||
      callEvent.value.payload.name !== name)
  ) {
    throw new UnexpectedEventError(
      name,
      stepId,
      'call',
      callEvent.value,
    )
  }
}
