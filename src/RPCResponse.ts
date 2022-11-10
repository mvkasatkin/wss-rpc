import { RPCRequest } from './RPCRequest'
import { RPCErrors, RPCError } from './RPCError'

export class RPCResponse {
  public readonly id: ID
  public readonly result?: any
  public readonly error?: IError

  public constructor (params: { id: ID, result?: any, error?: IError }) {
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

export type ID = string | number | null

export interface IRPCResponseObject {
  jsonrpc: '2.0'
  id: ID
  result?: any
  error?: IError
}

export interface IError {
  code: number
  message: string
  data?: unknown
}
