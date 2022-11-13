import WebSocket, { ClientOptions, ErrorEvent, MessageEvent } from 'isomorphic-ws'
import { IRPCResponseObject, RPCResponse } from './RPCResponse'
import { EventEmitter } from './EventEmitter'
import { RPCError, RPCErrors } from './RPCError'
import { RPCRequest, IRPCParams } from './RPCRequest'
import { IRPCEventObject, RPCEvent } from './RPCEvent'
import { Repeater } from './Repeater'

export class RPCClient {
  public ws?: WebSocket
  public readonly address: string
  public readonly options: IRPCClientOptions
  protected eventEmitter = new EventEmitter()
  protected clientState: IRPCClientState = 'init'
  protected requestQueue: Map<string | number, IRequestItem> = new Map()
  protected ready: Promise<void> = new Promise(() => {})
  protected readyResolver = () => {}
  protected reconnect: Repeater
  protected cleanupTimer: any
  protected id: number = 1

  public constructor (address: string, options: IRPCClientOptions) {
    this.address = address
    this.options = {
      autoConnect: true,
      requestTimeout: 10000,
      cleanupInterval: 3000,
      ...options,
    }
    this.reconnect = new Repeater({
      callback: () => this.connect().catch(this.emitError),
      onLimit: () => { this.disconnect().catch(this.emitError) },
      intervals: this.options.reconnectIntervals,
      limit: this.options.reconnectLimit,
    })

    if (this.options.autoConnect) {
      this.connect().catch(this.emitError)
    }
  }

  public get state () {
    return this.clientState
  }

  public get connected (): Promise<void> {
    return this.ready
  }

  public connect (): Promise<void> {
    this.handleRequestQueueCleanup()
    this.resetReadyState()
    this.resetListeners()
    this.clientState = 'connecting'
    this.ws = new WebSocket(this.address)
    this.ws.addEventListener('open', this.onOpen)
    this.ws.addEventListener('message', this.onMessage)
    this.ws.addEventListener('error', this.onError)
    this.ws.addEventListener('close', this.onClose)
    return this.ready
  }

  public disconnect () {
    this.clientState = 'stopped'
    clearInterval(this.cleanupTimer)
    this.reconnect.stop()
    if (this.ws) {
      return new Promise<void>(resolve => {
        const onClose = () => {
          this.ws?.removeEventListener('close', onClose)
          resolve()
        }
        this.ws?.addEventListener('close', onClose)
        this.ws?.close()
      })
    }
    return Promise.resolve()
  }

  public async call (method: string, params?: IRPCParams): Promise<RPCResponse> {
    await this.ready
    const request = this.createRequest(method, params)
    this.emit('request', request)
    return this.createResponsePromise(request)
  }

  public async notify (method: string, params?: IRPCParams) {
    await this.ready
    const request = RPCRequest.fromObject({ method, params })
    const message = JSON.stringify(request.toObject())
    this.ws?.send(message, this.emitError)
  }

  public on <E extends keyof IRPCClientEvents>(eventName: E, listener: (data: IRPCClientEvents[E]) => void, once = false) {
    return this.eventEmitter.on(eventName, listener, once)
  }

  protected emit <E extends keyof IRPCClientEvents>(eventName: E, data: IRPCClientEvents[E]) {
    this.eventEmitter.emit(eventName, data)
  }

  protected createRequest (method: string, params?: IRPCParams): RPCRequest {
    const id = this.id++
    return RPCRequest.fromObject({ id, method, params })
  }

  protected createResponsePromise (request: RPCRequest): Promise<RPCResponse> {
    const id = request.id
    const message = JSON.stringify(request.toObject())

    return new Promise<RPCResponse>((resolve, reject) => {
      if (id) {
        const requestItem: IRequestItem = {
          request,
          resolve: (response) => {
            this.requestQueue.delete(id)
            resolve(response)
          },
          reject: (e) => {
            this.requestQueue.delete(id)
            reject(e)
          },
          created: Date.now(),
        }
        this.requestQueue.set(id, requestItem)
        this.ws?.send(message, e => e && requestItem.reject(e))
      } else {
        reject(new RPCError(...RPCErrors.INVALID_REQUEST))
      }
    })
  }

  protected resetReadyState() {
    this.ready = new Promise(r => this.readyResolver = r)
  }

  protected resetListeners () {
    this.ws?.removeEventListener('open', this.onOpen)
    this.ws?.removeEventListener('message', this.onMessage)
    this.ws?.removeEventListener('error', this.onError)
    this.ws?.removeEventListener('close', this.onClose)
  }

  protected onOpen = () => {
    this.readyResolver()
    this.reconnect.stop()
    this.clientState = 'connected'
    this.emit('connect', null)
  }

  protected onMessage = (event: MessageEvent) => {
    const message = event.data.toString(this.options.encoding ?? 'utf8')
    try {
      const object = JSON.parse(message)
      if (object.jsonrpc) {
        this.processResponse(object, message)

      } else if (object.event) {
        this.processEvent(object)

      } else {
        throw new RPCError(...RPCErrors.UNKNOWN_MESSAGE, message)
      }

    } catch (e) {
      this.emitError(e)
    }
  }

  protected processResponse (object: IRPCResponseObject, message: string) {
    const response = new RPCResponse(object)
    this.emit('response', response)

    if (!response.id) {
      if (response.error) {
        throw new RPCError(response.error.code, response.error.message, response.error.data)
      }
      throw new RPCError(...RPCErrors.UNKNOWN_MESSAGE, message)
    }

    const requestItem = this.requestQueue.get(response.id)
    if (requestItem) {
      requestItem.resolve(response)
    } else {
      throw new RPCError(...RPCErrors.INTERNAL_ERROR)
    }
  }

  protected processEvent (object: IRPCEventObject) {
    const event = new RPCEvent(object)
    this.emit('event', event)
  }

  protected handleRequestQueueCleanup () {
    const { requestTimeout, cleanupInterval } = this.options
    if (requestTimeout && cleanupInterval) {
      this.cleanupTimer = setInterval(() => {
        const now = Date.now()
        for (const [, requestItem] of this.requestQueue) {
          if (now - requestItem.created > requestTimeout) {
            requestItem.reject(new RPCError(...RPCErrors.REQUEST_TIMEOUT))
          }
        }
      }, cleanupInterval)
    }
  }

  protected onError = (event: ErrorEvent) => {
    this.emitError(event.error)
  }

  protected onClose = () => {
    this.emit('disconnect', null)
    if (this.clientState === 'stopped') {
      this.resetListeners()
    } else {
      this.reconnect.start()
    }
  }

  protected emitError = (e: unknown) => e && this.emit('error', e)
}

export type IRPCClientState = 'init' | 'connecting' | 'connected' | 'stopped'

export interface IRPCClientOptions extends ClientOptions {
  autoConnect?: boolean
  reconnectIntervals?: number[]
  reconnectLimit?: number // 0 = unlimited
  requestTimeout?: number
  cleanupInterval?: number
  encoding?: BufferEncoding
}

export interface IRequestItem {
  created: number
  request: RPCRequest
  resolve: (response: RPCResponse) => void
  reject: (e: unknown) => void
}

export interface IRPCClientEvents {
  connect: null
  disconnect: null
  error: unknown
  request: RPCRequest
  response: RPCResponse
  event: RPCEvent
}
