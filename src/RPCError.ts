export class RPCError extends Error {
  public readonly code: number
  public readonly data?: unknown

  public constructor (code: number, message: string, data?: unknown) {
    super(message)
    this.code = code
    this.data = data
  }
}

export const RPCErrors = {
  // json-rpc2 errors
  PARSE_ERROR:      [-32700, 'Parse error'],
  INVALID_REQUEST:  [-32600, 'Invalid Request'],
  METHOD_NOT_FOUND: [-32601, 'Method not found'],
  INVALID_PARAMS:   [-32602, 'Invalid params'],
  INTERNAL_ERROR:   [-32603, 'Internal error'],

  // custom errors
  UNKNOWN_MESSAGE:   [-10000, 'Unknown message'],
} as const
