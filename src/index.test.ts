import { RPCServer, IRPCServerOptions } from './RPCServer'
import { RPCClient, IRPCClientOptions } from './RPCClient'
import { RPCEvent } from './RPCEvent'
import { RPCError } from './RPCError'

const port = 5005
let serverData: ReturnType<typeof createServer>

describe('Integration client/server', () => {

  beforeEach(async () => {
    jest.useRealTimers()
    serverData = createServer()
    await new Promise(r => serverData.server.on('listening', r))
  })

  afterEach(async () => {
    if (serverData) {
      serverData.server.close()
      await serverData.closePromise
    }
  })

  test('connect/disconnect 1 client', async () => {
    const { server } = serverData
    const { client: client1 } = createClient({ autoConnect: false })
    expect(server.getConnections().length).toBe(0)

    await client1.connect()
    expect(server.getConnections().length).toBe(1)

    await client1.disconnect()
    await waitEvent(server, 'disconnect')

    expect(server.getConnections().length).toBe(0)
  })

  test('connect/disconnect 2 client', async () => {
    const { server, events: serverEvents } = serverData
    const { client: client1 } = createClient({ autoConnect: false })
    const { client: client2 } = createClient({ autoConnect: false })
    expect(server.getConnections().length).toBe(0)

    await Promise.all([client1.connect(), client2.connect()])
    expect(serverEvents.connect).toBeCalledTimes(2)
    expect(server.getConnections().length).toBe(2)

    await client1.disconnect()
    await waitEvent(server, 'disconnect')
    expect(server.getConnections().length).toBe(1)
  })

  test('client state', async () => {
    const { client } = createClient({ autoConnect: false })
    expect(client.state).toBe('init')

    const connectedPromise = client.connect()
    expect(client.state).toBe('connecting')

    await connectedPromise
    expect(client.state).toBe('connected')

    await client.disconnect()
    expect(client.state).toBe('stopped')
  })

  test('request/response', async () => {
    const { server } = serverData
    const { client } = createClient()
    await client.connected

    server.registerMethod('test.method1', (params) => {
      return params[0] + params[1]
    })

    server.registerMethod('test.method2', (params) => {
      return { sum: params.value1 + params.value2 }
    })

    const { result: r1 } = await client.call('test.method1', [1, 2])
    expect(r1).toBe(3)

    const { result: r2 } = await client.call('test.method2', { value1: 2, value2: 3 })
    expect(r2.sum).toBe(5)
  })

  test('notify to server', async () => {
    const { server } = serverData
    const { client } = createClient()
    await client.connected

    const cb = jest.fn()
    server.registerMethod('test.method', cb)

    await client.notify('test.method', [1, 2])
    await delay()
    expect(cb).toBeCalledTimes(1)
    expect(cb.mock.calls[0][0]).toEqual([1, 2])
  })

  test('events to client', async () => {
    const { server } = serverData
    const { client: client1, events: client1Events } = createClient({ autoConnect: false })
    const { client: client2, events: client2Events } = createClient({ autoConnect: false })
    await client1.connect()
    await client2.connect()

    const [client1Connection, client2Connection] = server.getConnections()
    client1Connection.emit(new RPCEvent({ event: 'event1' }))
    await waitEvent(client1, 'event')
    expect(client1Events.event).toBeCalledTimes(1)
    expect(client1Events.event).toBeCalledWith({ event: 'event1' })

    client2Connection.emit(new RPCEvent({ event: 'event2', params: { some: 'value' } }))
    await waitEvent(client2, 'event')
    expect(client2Events.event).toBeCalledTimes(1)
    expect(client2Events.event).toBeCalledWith({ event: 'event2', params: { some: 'value' } })
  })

  test('connection state', async () => {
    const { server } = serverData
    const { client: client1 } = createClient()
    const { client: client2 } = createClient()
    await Promise.all([client1.connected, client2.connected])

    const [client1Connection, client2Connection] = server.getConnections()
    client1Connection.state.a = 1
    client2Connection.state.a = 2
    expect(client1Connection.state.a).toBe(1)
    expect(client2Connection.state.a).toBe(2)
  })

  test('errors handling', async () => {
    const { server } = serverData
    const { client } = createClient()
    const serverErrorCb = jest.fn()
    const clientErrorCb = jest.fn()
    server.on('error', serverErrorCb)
    client.on('error', clientErrorCb)
    server.registerMethod('return_rpc_error', () => { return new RPCError(111, 'msg1') })
    server.registerMethod('throw_rpc_error', () => { throw new RPCError(222, 'msg2') })
    server.registerMethod('return_error', () => { return new Error('msg3') })
    server.registerMethod('throw_error', () => { throw new Error('msg4') })
    await client.connected

    expect(() => {
      server.registerMethod('throw_error', () => {})
    }).toThrow('already registered')

    client.ws?.send('parse error message')
    await waitEvent(client, 'response')
    expect(clientErrorCb).toBeCalledTimes(1)
    expect(clientErrorCb).toHaveBeenLastCalledWith(expect.any(RPCError))
    expect(clientErrorCb.mock.lastCall[0].code).toBe(-32700)

    clientErrorCb.mockReset()
    client.ws?.send(JSON.stringify({ jsonrpc: '1.0' }))
    await waitEvent(client, 'response')
    expect(clientErrorCb).toBeCalledTimes(1)
    expect(clientErrorCb).toHaveBeenLastCalledWith(expect.any(RPCError))
    expect(clientErrorCb.mock.lastCall[0].code).toBe(-32600)

    let response
    response = await client.call('not_exists')
    expect(response.result).toBeUndefined()
    expect(response.error).toEqual({ code: -32601, message: 'Method not found' })

    response = await client.call('return_rpc_error')
    expect(response.result).toBeUndefined()
    expect(response.error).toEqual({ code: 111, message: 'msg1' })

    response = await client.call('throw_rpc_error')
    expect(response.result).toBeUndefined()
    expect(response.error).toEqual({ code: 222, message: 'msg2' })

    response = await client.call('return_error')
    expect(response.result).toBeUndefined()
    expect(response.error).toEqual({ code: -32603, message: 'Internal error' })

    serverErrorCb.mockReset()
    response = await client.call('throw_error')
    expect(response.result).toBeUndefined()
    expect(response.error).toEqual({ code: -32603, message: 'Internal error' })
    expect(serverErrorCb).toBeCalledTimes(1)
    expect(serverErrorCb).toHaveBeenLastCalledWith(expect.any(Error))
    expect(serverErrorCb.mock.lastCall[0].message).toBe('msg4')
  })

  test('connection activity', async () => {
    const { server } = serverData
    const { client } = createClient()
    await client.connected
    const connection = server.getConnections()[0]
    const activity1 = connection.lastActivity

    const pingCb = jest.fn()
    const pongCb = jest.fn()
    client.ws?.on('ping', pingCb)
    client.ws?.on('pong', pongCb)

    client.ws?.ping('aaa')
    await waitEvent(client.ws, 'pong', 500)
    expect(pongCb).toBeCalledTimes(1)
    expect(pongCb.mock.calls[0][0].toString()).toBe('aaa')
    const activity2 = connection.lastActivity
    expect(activity2).toBeGreaterThan(activity1)

    connection.ws.ping('bbb')
    await waitEvent(client.ws, 'ping', 500)
    await waitEvent(connection.ws, 'pong', 500)
    expect(pingCb).toBeCalledTimes(1)
    expect(pingCb.mock.calls[0][0].toString()).toBe('bbb')
    const activity3 = connection.lastActivity
    expect(activity3).toBeGreaterThan(activity2)
  })

  test('connection keep alive', async () => {
    jest.useFakeTimers({ timerLimit: 1000 })
    const { server } = serverData
    const { client } = createClient()
    await client.connected
    const connection = server.getConnections()[0]
    const activity1 = connection.lastActivity

    jest.runOnlyPendingTimers()
    await waitEvent(connection.ws, 'pong', 500)
    const activity2 = connection.lastActivity
    expect(activity2).toBeGreaterThan(activity1)

    jest.runOnlyPendingTimers()
    await waitEvent(connection.ws, 'pong', 500)
    const activity3 = connection.lastActivity
    expect(activity3).toBeGreaterThan(activity2)
  })
})

async function waitEvent (instance: any, eventName: string, timeout = 0) {
  const resultPromise = new Promise<any>(resolve => {
    instance.on(eventName, resolve, true)
  })

  if (timeout > 0) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), timeout)
    })
    return Promise.race([resultPromise, timeoutPromise])
  }

  return resultPromise
}

async function delay (ms: number = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createServer (opts?: Partial<IRPCServerOptions<any>>) {
  const events = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    close: jest.fn(),
  }
  const server = new RPCServer({
    host: 'localhost',
    port,
    stateFactory: () => ({}),
    ...opts,
  })
  server.on('connect', events.connect)
  server.on('disconnect', events.disconnect)
  server.on('close', events.close)
  const closePromise = new Promise(resolve => {
    server.on('close', resolve)
  })
  return { server, events, closePromise }
}

function createClient (opts?: Partial<IRPCClientOptions>) {
  const events = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    event: jest.fn(),
  }
  const client = new RPCClient(`ws://localhost:${port}`, {
    reconnectLimit: -1,
    ...opts,
  })
  client.on('connect', events.connect)
  client.on('disconnect', events.disconnect)
  client.on('event', events.event)
  return { client, events }
}
