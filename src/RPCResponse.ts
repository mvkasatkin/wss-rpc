import { RPCRequest } from './RPCRequest'
import { RPCErrors, RPCError } from './RPCError'

export class RPCResponse {
  public readonly id: IRPCID
  public readonly result?: any
  public readonly error?: IRPCError

  public constructor (params: { id: IRPCID, result?: any, error?: IRPCError }) {
    this.id = params.id
    if (params.error) {
      this.error = params.error
    } else {
      this.result = params.result ?? true
    }
  }

  public isError () {
    return !!this.error
  }

  public toObject (): IRPCResponseObject {
    const { id, result, error } = this
    return this.isError()
      ? { jsonrpc: '2.0', id, error }
      : { jsonrpc: '2.0', id, result }
  }

  public static fromError (e: unknown, request: RPCRequest | null = null) {
    const { code, message } = e instanceof RPCError ? e : new RPCError(...RPCErrors.INTERNAL_ERROR)

    return new RPCResponse({
      id: request?.id || null,
      error: { code, message },
    })
  }
}

export type IRPCID = string | number | null

export interface IRPCResponseObject {
  jsonrpc: '2.0'
  id: IRPCID
  result?: any
  error?: IRPCError
}

export interface IRPCError {
  code: number
  message: string
  data?: unknown
}
