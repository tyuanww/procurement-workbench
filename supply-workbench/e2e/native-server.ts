import assert from 'node:assert/strict';
import { Server } from 'node:net';

assert.ok(process.send, 'Start this preload with native-acceptance.ts');
const send = process.send.bind(process);
const listen = Server.prototype.listen;
Server.prototype.listen = function (this: Server, options: unknown, ...args: unknown[]): Server {
  assert.ok(typeof options === 'object' && options !== null && 'host' in options && 'port' in options);
  assert.equal(options.host, '0.0.0.0');
  assert.equal(options.port, Number(process.env.PORT));
  this.once('listening', () => send('listening'));
  return Reflect.apply(listen, this, [{ ...options, host: '127.0.0.1' }, ...args]);
};
