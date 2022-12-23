import { nanoid } from 'nanoid'
import WebSocket from 'isomorphic-ws'
import { RPCResponse } from './RPCResponse'
import { RPCEvent } from './RPCEvent'

export class RPCConnection<State = unknown> {
  public readonly id: string
  public readonly ws?: WebSocket
  public state?: State
  public lastActivity = 0

  public constructor (ws?: WebSocket, initialState?: State) {
    this.id = nanoid()
    this.ws = ws
    this.state = initialState
  }

  public send (response: RPCResponse, cb?: (e: Error) => void) {
    const data = JSON.stringify(response.toObject())
    this.ws?.send(data, e => e && cb && cb(e))
  }

  public emit (event: RPCEvent, cb?: (e: Error) => void) {
    const data = JSON.stringify(event.toObject())
    this.ws?.send(data, e => e && cb && cb(e))
  }
}
