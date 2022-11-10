import { RPCError, RPCErrors } from './RPCError'

export class RPCRequest {
  public readonly id?: string | number
  public readonly method: string
  public readonly params?: IRPCParams

  public constructor (data: Record<any, any>) {
    this.validate(data)
    this.id = data.id
    this.method = data.method
    this.params = data.params
  }

  public isNotification () {
    return !this.id
  }

  public toObject (): IRPCRequestObject {
    const { id, method, params } = this
    return { jsonrpc: '2.0', id, method, params }
  }

  protected validate (data: { [key: string]: unknown }) {
    const isValid = data.jsonrpc === '2.0' &&
      typeof data.method === 'string' &&
      data.method.length > 0 &&
      ['number', 'string', 'undefined'].includes(typeof data.id) &&
      ['object', 'array', 'undefined'].includes(typeof data.params) &&
      data.params !== null

    if (!isValid) {
      throw new RPCError(...RPCErrors.INVALID_REQUEST, data)
    }
  }

  public static fromString (data: string) {
    try {
      const object = JSON.parse(data)
      return new RPCRequest(object)
    } catch (e) {
      throw e instanceof RPCError ? e : new RPCError(...RPCErrors.PARSE_ERROR, data)
    }
  }

  public static fromBuffer (data: Buffer | ArrayBuffer | Buffer[], encoding: BufferEncoding = 'utf8') {
    try {
      return RPCRequest.fromString(data.toString(encoding))
    } catch (e) {
      throw e instanceof RPCError ? e : new RPCError(...RPCErrors.PARSE_ERROR, data)
    }
  }

  public static fromObject (object: Record<string, any>) {
    const { id, method, params } = object
    return new RPCRequest({
      jsonrpc: '2.0',
      id,
      method,
      params,
    })
  }
}

export type IRPCParams = { [key: string]: unknown } | unknown[]

export interface IRPCRequestObject {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: IRPCParams
}