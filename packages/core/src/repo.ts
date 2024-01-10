export interface EventRepo {
  getEvents(effectId: string): AsyncGenerator<any>
  saveEvent(effectId: string, seq: number, event: any): Promise<void>
  deleteEvents(effectId: string): Promise<void>
  generateEffectId(baseEffectId: string, slug: string): string
}
