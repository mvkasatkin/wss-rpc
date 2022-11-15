# wss-rpc2

WebSocket Server and Client implementation of the [**JSON RPC2**](https://www.jsonrpc.org/specification) spec.\
Powered by [**ws**](https://www.npmjs.com/package/ws).

![npm](https://img.shields.io/npm/v/wss-rpc2)
![NPM](https://img.shields.io/npm/l/wss-rpc2)
[![Coverage Status](https://coveralls.io/repos/github/mvkasatkin/wss-rpc/badge.svg?branch=main)](https://coveralls.io/github/mvkasatkin/wss-rpc?branch=main)

#### Basic functionality, according to the spec:
- Method call **client** -> **server** (request/response)
- Notifications **client** -> **server** (notification)

#### Extended functionality:
- Events **server** -> **client** (to all / to some / to a single client)
- Reconnect and keep alive
- Stateful client connection
- The client works in both node and browser

## Quick start

Installation:
```shell
npm i wss-rpc2
```

Backend / Server:
```typescript
import { RPCServer, RPCEvent } from 'wss-rpc2'

const server = new RPCServer({ port: 3000 })

server.registerMethod('multiply', (params) => {
  return params[0] * params[1]
})
```

Frontend / Client:
```typescript
import { RPCClient } from 'wss-rpc2'

const client = new RPCClient('ws://localhost:3000')
const result = await client.call('multiply', [3, 5])
```

See more [examples](#examples).

## RPCServer API

### new RPCServer(options: IRPCServerOptions)

Parameters:
- `options: IRPCServerOptions<State = any> extends ServerOptions`
    - `wss?: ws.WebSocketServer` - existing WebSocketServer (ws) instance
    - `keepAlive?: number` - ping clients every N ms (default: 300000 // 5 min)
    - `stateFactory?: () => State` - initial state factory of the connected client 
    - `...ServerOptions` (see ws library)

### RPCServer.registerMethod(name: string, method: IRPCMethod): void

Parameters:
- `name: string` - name of the RPC method
- `method: IRPCMethod` - RPC method function, see [types](#types)

### RPCServer.getConnections(): RPCConnection[]

Returns active [connection](#rpcconnection-api) instances.

### RPCServer.close(): void

Closes all active client's connections and stops the server.

### RPCServer.on(eventName: string, listener: Function, once?: boolean): Function

Subscribe a listener to the event. Returns unsubscribe function.\

#### RPCServer Events:
- `listening (params: empty)` - on server start
- `connect (params: RPCConnection)` - on client connect
- `disconnect (params: RPCConnection)` - on client disconnect
- `error (params: Error | unknown)` - on server error
- `close (params: empty)` - on server stop


## RPCClient API

### new RPCClient(address: string, options?: IRPCClientOptions)

Parameters:
- `address: string` - URL of the RPCServer
- `options: IRPCClientOptions`
  - `autoConnect?: boolean` - if false, then use `client.connect()` (default: true)
  - `reconnectIntervals?: number[]` - reconnect intervals sequence. Example: [1000, 1500, 2000] will wait between
     reconnect: 1000ms, 1500ms, 2000ms, ..., 2000ms, until `reconnectLimit` (default: [1000] - every 1000 ms)
  - `reconnectLimit?: number` - 0 - unlimited, -1 - disabled (default: 1000)
  - `requestTimeout?: number` - request timeout (default: 10000)

### RPCClient.state: 'init' | 'connecting' | 'connected' | 'stopped'

Client connection state:
- `init` - before connect() has been called
- `connecting` - connection or reconnection is in process
- `connected` - active connection
- `stopped` - if disconnect() has been called or reconnectLimit is reached

### RPCClient.connected: Promise\<void>

Connection promise.
However, it is not necessary to wait for a connection, because requests will be queued up until the connection.

```typescript
const client = new RPCClient()
await client.connected
// connected!
```

### RPCClient.connect(): Promise\<void>

Manual connect, if autoConnect = false

```typescript
const client = new RPCClient({ autoConnect: false })
await client.connect()
// connected!
```

### RPCClient.disconnect(): Promise\<void>

Disconnect and stop reconnect-observer.

### RPCClient.call(method: string, params?: IRPCParams): Promise\<RPCResponse>

Calls the method and waits for a response.

### RPCClient.notify(method: string, params?: IRPCParams): void

Notifies the server without waiting for a response.

### RPCClient.on(eventName: string, listener: Function, once?: boolean): Function

Subscribe a listener to the event. Returns unsubscribe function.\

#### RPCClient Events:
- `connect (params: empty)` - on connect
- `disconnect (params: empty)` - on disconnect
- `error (params: Error | unknown)` - on error
- `request (params: IRPCRequestObject)` - on before request sent
- `response (params: IRPCResponseObject)` - on response received
- `event (params: RPCEvent)` - on server event received

## RPCConnection <State = unknown> API

### id: string

Connection identifier

### ws: WebSocket

Browser WebSocket object (`isomorphic-ws` is used for the node client)

### state?: State

Some domain state of the connection

### lastActivity: number = 0

Last client activity timestamp

### RPCConnection.emit (event: RPCEvent, cb?: (e: Error) => void)

Emit an event to the client. Example:

```typescript
const event = new RPCEvent({ event: 'hello', params: {} })
server.getConnections().forEach(connection => {
  connection.emit(event, e => console.error(e))
})
```

## Types

```typescript
interface IRPCServerOptions extends ws.ServerOptions {
  wss?: WebSocketServer
  keepAlive?: number
  stateFactory?: () => State
}
```

```typescript
interface IRPCClientOptions {
  autoConnect?: boolean
  reconnectIntervals?: number[]
  reconnectLimit?: number
  requestTimeout?: number
}
```

```typescript
type IRPCParams = { [key: string]: unknown } | unknown[]
```
```typescript
type IRPCMethod<Req extends IRPCParams = any, Res = any, State = any>
        = (params: Req, connection: RPCConnection<State>) => Res
```

```typescript
interface IRPCRequestObject {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: IRPCParams
}
```

```typescript
interface IRPCResponseObject {
  jsonrpc: '2.0'
  id: string | number | null
  result?: any
  error?: IRPCError
}
```

```typescript
interface IRPCError {
  code: number
  message: string
  data?: unknown
}
```

## Typescript

Typescript support provides several useful features for typing request, responses and connection state.

```typescript
import { RPCServer } from './RPCServer'

const server = new RPCServer<IAppUserState>({
  stateFactory: () => ({ authorized: false })
})

server.registerMethod<IRpcLogin['request'], IRpcLogin['response']>('login', async (params, connection) => {
  const user = await auth(params)
  if (user) {
    connection.state.authorized = true
    connection.state.email = user.email
    connection.state.id = user.id
  }
  return user
})

interface IAppUserState {
  authorized: boolean
  email?: string
  id?: string
}

interface IRpcLogin {
  request: {
    login: string
    password: string
  }
  response: {
    user?: {
      id: string
      email: string
    }
  }
}

```

Method generic:
```typescript
```

## Examples

To be done
