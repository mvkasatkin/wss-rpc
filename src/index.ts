import { WebSocket } from 'ws'
import { RPCServer } from './Server'

const server = new RPCServer({
  host: 'localhost',
  port: 5000,
})
server.on('listening', () => {
  console.log('RPC listening')
})
server.on('connect', (connection: any) => {
  console.log('RPC connect', connection.id)
})
server.on('disconnect', (connection: any) => {
  console.log('RPC disconnect', connection.id)
})
server.on('close', () => {
  console.log('RPC close')
})
const ws1 = new WebSocket('ws://localhost:5000')
ws1.on('open', () => {
  console.log('CLIENT open 1')
  ws1.close()
  // ws.send('something');
})
const ws2 = new WebSocket('ws://localhost:5000')
ws2.on('open', () => {
  console.log('CLIENT open 2')
  ws2.send('something')
})
