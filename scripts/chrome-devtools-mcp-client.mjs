import { spawn } from 'node:child_process';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class McpClient {
  constructor(command, args, options = {}) {
    this.command = command;
    this.args = args;
    this.options = options;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    this.child = null;
  }

  start() {
    this.child = spawn(this.command, this.args, {
      cwd: this.options.cwd,
      env: {
        ...process.env,
        ...(this.options.env || {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.on('data', (chunk) => this.#handleStdout(chunk));
    this.child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      if (text.trim()) {
        process.stderr.write(text);
      }
    });
    this.child.on('exit', (code, signal) => {
      for (const [, pending] of this.pending) {
        pending.reject(new Error(`MCP process exited before response: code=${code} signal=${signal}`));
      }
      this.pending.clear();
    });
  }

  async initialize() {
    const result = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'codex-shell-client',
        version: '1.0.0',
      },
    });

    this.notify('notifications/initialized', {});
    return result;
  }

  request(method, params = {}) {
    const id = this.nextId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.#writeFrame(payload);
    });
  }

  notify(method, params = {}) {
    const payload = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.#writeFrame(payload);
  }

  async listTools() {
    const response = await this.request('tools/list', {});
    return response.tools || [];
  }

  async callTool(name, args = {}) {
    const response = await this.request('tools/call', {
      name,
      arguments: args,
    });
    return response;
  }

  async close() {
    if (!this.child) {
      return;
    }

    this.child.kill('SIGTERM');
    await sleep(300);
    if (!this.child.killed) {
      this.child.kill('SIGKILL');
    }
  }

  #writeFrame(payload) {
    const json = JSON.stringify(payload);
    const frame = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
    this.child.stdin.write(frame);
  }

  #handleStdout(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const delimiterIndex = this.buffer.indexOf('\r\n\r\n');
      if (delimiterIndex === -1) {
        return;
      }

      const headerText = this.buffer.subarray(0, delimiterIndex).toString('utf8');
      const match = headerText.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        throw new Error(`Invalid MCP header: ${headerText}`);
      }

      const contentLength = Number(match[1]);
      const totalLength = delimiterIndex + 4 + contentLength;
      if (this.buffer.length < totalLength) {
        return;
      }

      const body = this.buffer.subarray(delimiterIndex + 4, totalLength).toString('utf8');
      this.buffer = this.buffer.subarray(totalLength);

      const message = JSON.parse(body);
      if (!Object.prototype.hasOwnProperty.call(message, 'id')) {
        continue;
      }

      const pending = this.pending.get(message.id);
      if (!pending) {
        continue;
      }

      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result || {});
      }
    }
  }
}

async function main() {
  const mode = process.argv[2] || 'list-tools';
  const client = new McpClient(
    'npx',
    [
      '-y',
      'chrome-devtools-mcp@latest',
      '--headless',
      '--isolated',
      '--executablePath=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '--no-performance-crux',
      '--no-usage-statistics',
    ],
    {
      cwd: process.cwd(),
    },
  );

  client.start();

  try {
    await client.initialize();

    if (mode === 'list-tools') {
      const tools = await client.listTools();
      console.log(JSON.stringify(tools, null, 2));
      return;
    }

    throw new Error(`Unsupported mode: ${mode}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
