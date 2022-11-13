export class EventEmitter {
  protected registry: Map<string | Symbol, IItem[]> = new Map()

  public all (listener: IListener) {
    return this.registerListener(all, listener)
  }

  public on (event: string, listener: IListener, once?: boolean) {
    return this.registerListener(event, listener, once)
  }

  public off (event?: string | Symbol, listener?: IListener) {
    if (event) {
      const items = listener ? (this.registry.get(event) || []).filter(i => i.listener !== listener) : []
      this.registry.set(event, items)
    } else {
      this.registry = new Map()
    }
  }

  public emit (event: string, ...args: any[]) {
    const items = [
      ...(this.registry.get(event) || []),
      ...(this.registry.get(all) || []),
    ]
    for (const item of items) {
      item.listener(...args)
      if (item.once) {
        this.off(event, item.listener)
      }
    }
  }

  protected registerListener (event: string | Symbol, listener: IListener, once?: boolean) {
    if (!this.registry.has(event)) {
      this.registry.set(event, [])
    }
    this.registry.get(event)!.push({ listener, once })
    return () => this.off(event, listener)
  }
}

const all = Symbol('all')

type IListener = (...args: any[]) => void

interface IItem {
  listener: IListener
  once?: boolean
}
