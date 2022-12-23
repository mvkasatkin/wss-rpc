import WebSocket, { WebSocketServer, ServerOptions } from 'isomorphic-ws'
import { IRPCParams, RPCRequest } from './RPCRequest'
import { RPCResponse } from './RPCResponse'
import { EventEmitter } from './EventEmitter'
import { RPCConnection } from './RPCConnection'
import { RPCError, RPCErrors } from './RPCError'

class RPCServer<State = unknown> {
  public readonly wss: WebSocketServer
  public readonly options: IRPCServerOptions<State>
  protected stateFactory?: () => State
  protected eventEmitter = new EventEmitter()
  protected connections: Map<string, RPCConnection<State>> = new Map()
  protected keepAlive: Map<string, NodeJS.Timer> = new Map()
  protected methods: Map<string, IRPCMethod<any, any, State>> = new Map()
  protected state: IServerState = 'active'

  public constructor (options: IRPCServerOptions<State>, onListening?: () => void) {
    this.options = {
      keepAlive: 300000,
      ...options,
    }
    this.stateFactory = options.stateFactory
    this.wss = this.options.wss ?? this.createWebsocketServer(onListening)
    this.handleWssListening()
    this.handleWssConnection()
    this.handleWssError()
    this.handleWssClose()
  }

  public registerMethod <Req extends IRPCParams = any, Res = any>(name: string, method: IRPCMethod<Req, Res, State>) {
    if (this.methods.has(name)) {
      throw new Error('A method with the same name is already registered')
    }
    this.methods.set(name, method)
  }

  public async callMethod (methodName: string, params?: IRPCParams, connection?: RPCConnection<State>): Promise<any> {
    const conn = connection ?? new RPCConnection<State>(undefined, this.stateFactory?.())
    let result: unknown
    try {
      const method = this.methods.get(methodName)
      result = method
        ? await method(params, conn)
        : new RPCError(...RPCErrors.METHOD_NOT_FOUND)

    } catch (e) {
      if (e instanceof RPCError) {
        result = e
      } else {
        throw e
      }
    }
    return result
  }

  public getConnections (): RPCConnection<State>[] {
    return [...this.connections.values()]
  }

  public close (): Promise<void> {
    if (this.state === 'stopped') {
      return Promise.resolve()
    }

    this.state = 'stopped'
    this.onBeforeClose()
    return new Promise((resolve, reject) => {
      this.wss.close(e => {
        this.wss.removeAllListeners()
        if (e) {
          this.emitError(e)
          reject(e)
        } else {
          resolve()
        }
      })
    })
  }

  public on <E extends keyof IRPCServerEvents>(eventName: E, listener: (data: IRPCServerEvents[E]) => void, once = false) {
    return this.eventEmitter.on(eventName, listener, once)
  }

  protected emit <E extends keyof IRPCServerEvents>(eventName: E, data: IRPCServerEvents[E]) {
    this.eventEmitter.emit(eventName, data)
  }

  protected createWebsocketServer (onListening?: () => void) {
    return new WebSocketServer(this.options, onListening)
  }

  protected onBeforeClose () {
    for (const [, connection] of this.connections) {
      connection.ws?.close()
    }
  }

  protected onAfterClose () {
    this.connections = new Map()
  }

  protected handleWssListening () {
    this.wss.on('listening', () => {
      this.emit('listening', null)
    })
  }

  protected handleWssConnection () {
    this.wss.on('connection', (ws) => {
      const connection = new RPCConnection(ws, this.options.stateFactory?.())
      this.connections.set(connection.id, connection)
      this.handleConnectionClose(ws, connection)
      this.handleConnectionMessage(ws, connection)
      this.handleConnectionKeepAlive(ws, connection)
      this.emit('connect', connection)
    })
  }

  protected handleConnectionMessage (ws: WebSocket, connection: RPCConnection<State>) {
    ws.on('message', async (data) => {
      connection.lastActivity = Date.now()
      let request: RPCRequest | null = null

      try {
        request = RPCRequest.fromBuffer(data, this.options.encoding || 'utf8')
        this.emit('request', request)
        const response = await this.processRequest(request, connection)
        this.emit('response', response)
        connection.send(response, this.emitError)

      } catch (e) {
        if (!request || !request.isNotification()) {
          const response = RPCResponse.fromError(e, request)
          connection.send(response, this.emitError)
        }
        if (!(e instanceof RPCError)) {
          this.emitError(e)
        }
      }
    })
  }

  protected async processRequest (request: RPCRequest, connection: RPCConnection<State>): Promise<RPCResponse> {
    const result = await this.callMethod(request.method, request.params, connection)
    return result instanceof Error
      ? RPCResponse.fromError(result, request)
      : new RPCResponse({ id: request.id || null, result })
  }

  protected handleConnectionClose (ws: WebSocket, connection: RPCConnection) {
    ws.once('close', () => {
      clearInterval(this.keepAlive.get(connection.id))
      this.keepAlive.delete(connection.id)
      this.connections.delete(connection.id)
      this.emit('disconnect', connection)
    })
  }

  protected handleConnectionKeepAlive (ws: WebSocket, connection: RPCConnection) {
    const updateActivity = () => connection.lastActivity = Date.now()
    ws.on('pong', updateActivity)
    ws.on('ping', updateActivity)

    if (this.options.keepAlive) {
      this.keepAlive.set(connection.id, setInterval(() => {
        connection.ws?.ping()
      }, this.options.keepAlive))
    }
  }

  protected handleWssError () {
    this.wss.on('error', (error) => {
      this.emit('error', error)
    })
  }

  protected handleWssClose () {
    this.wss.on('close', () => {
      this.emit('close', null)
      this.onAfterClose()
    })
  }

  private emitError = (e: unknown) => this.emit('error', e)
}

type IServerState = 'active' | 'stopped'

type IRPCMethod<Req extends IRPCParams = any, Res = any, State = any>
  = (params: Req, connection: RPCConnection<State>) => Res | Promise<Res>

interface IRPCServerOptions<State> extends ServerOptions {
  wss?: WebSocketServer
  encoding?: BufferEncoding
  keepAlive?: number
  stateFactory?: () => State
}

interface IRPCServerEvents {
  listening: null
  connect: RPCConnection
  disconnect: RPCConnection
  request: RPCRequest
  response: RPCResponse
  error: unknown
  close: null
}

export { RPCServer, IRPCServerOptions, IRPCMethod, IRPCServerEvents }
