import { RPCRequest } from './RPCRequest'
import { RPCErrors, RPCError } from './RPCError'

class RPCResponse<T extends any = any> {
  public readonly id: IRPCID
  public readonly result?: T | undefined
  public readonly error?: IRPCError | undefined

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

  public toObject (): IRPCResponseObject<T> {
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

type IRPCID = string | number | null

interface IRPCResponseObject<T extends any = any> {
  jsonrpc: '2.0'
  id: IRPCID
  result?: T
  error?: IRPCError
}

interface IRPCError {
  code: number
  message: string
  data?: unknown
}

export { RPCResponse, IRPCID, IRPCResponseObject, IRPCError }
