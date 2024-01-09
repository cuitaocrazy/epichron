import { runSagaStep, SagaStepConfig } from '../src/runner.js'
import { createSagaEffectCaller } from '../src/effect-spec.js'
import { expect } from 'chai'

describe('my test', () => {
  it('should run saga step', async () => {
    async function sampleEffect(ctl: AbortController, str: string) {
      return 'result'
    }
    const effectCall = createSagaEffectCaller(
      sampleEffect,
      async () => ({ status: 'succeeded', result: 'result' }),
      async () => {},
      'effect1',
    )
    const step = effectCall('arg1')

    const config: SagaStepConfig = {
      historyIterator: (async function* () {})(),
      abortController: new AbortController(),
      stepId: 'step1',
      step: step as any,
      publish: async () => {},
      addRollback: () => {},
    }

    const result = await runSagaStep(config)

    expect(result).to.equal('result')
  })
})
