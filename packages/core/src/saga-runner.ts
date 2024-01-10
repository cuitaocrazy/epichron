import { EffectDescriptorWithArgs } from './effect-spec'

type SagaStepIterator = AsyncGenerator<
  EffectDescriptorWithArgs,
  any,
  never
>

type Saga = (payload: any) => SagaStepIterator

export async function runSaga<S extends Saga>(
  saga: S,
  sagaId: string,
  payload: any,
) {
  const sagaStepIterator = saga(payload)

  return await runIter(sagaStepIterator)
}

async function runIter(iter: SagaStepIterator) {
  const { value, done } = await iter.next()
  if (done) return value
  return runIter(iter)
}
