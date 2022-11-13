const DEFAULT_LIMIT = 1000
const DEFAULT_INTERVALS = [1000]

class Repeater {
  public readonly options: IRepeaterOptions
  public finished: Promise<void> = Promise.resolve()
  protected finishResolver = () => {}
  protected active = false
  protected counter = 0
  protected timeoutId?: NodeJS.Timeout

  public constructor (options: IRepeaterOptions) {
    this.options = {
      intervals: [...DEFAULT_INTERVALS],
      limit: DEFAULT_LIMIT,
      ...options,
    }
  }
  
  public start () {
    this.finished = new Promise(r => this.finishResolver = r)
    this.active = true
    this.process()
  }

  public stop () {
    clearTimeout(this.timeoutId)
    this.active = false
    this.counter = 0
    this.finishResolver()
  }

  protected process () {
    if (!this.active) {
      return
    }

    if (this.options.limit && this.counter >= this.options.limit) {
      this.stop()
      this.options.onLimit?.()
      return
    }

    const delay = this.getDelay()
    setTimeout(async () => {
      const result = this.options.callback()
      if (result instanceof Promise) {
        await result
      }
      this.counter += 1
      this.process()
    }, delay)
  }

  protected getDelay () {
    return (this.options.intervals && this.options.intervals.length)
      ? (this.options.intervals[this.counter] || this.options.intervals[this.options.intervals.length - 1])
      : DEFAULT_INTERVALS[0]
  }
}

interface IRepeaterOptions {
  callback: () => void | Promise<unknown>
  onLimit?: () => void
  intervals?: number[]
  limit?: number
}

export { Repeater, IRepeaterOptions }
