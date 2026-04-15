declare module 'ws' {
  import { EventEmitter } from 'node:events';
  import type { IncomingMessage } from 'node:http';
  import type { Socket } from 'node:net';

  export type RawData = Buffer | ArrayBuffer | Buffer[];

  export default class WebSocket extends EventEmitter {
    static OPEN: number;
    readyState: number;
    send(data: string): void;
    close(): void;
    on(event: 'message', listener: (data: RawData) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { noServer: boolean });
    on(
      event: 'connection',
      listener: (
        socket: WebSocket,
        request: IncomingMessage,
        binding: unknown,
        deviceLabel: string | null,
      ) => void,
    ): this;
    handleUpgrade(
      request: IncomingMessage,
      socket: Socket,
      head: Buffer,
      callback: (socket: WebSocket) => void,
    ): void;
    emit(
      event: 'connection',
      socket: WebSocket,
      request: IncomingMessage,
      binding: unknown,
      deviceLabel: string | null,
    ): boolean;
    close(): void;
  }
}
