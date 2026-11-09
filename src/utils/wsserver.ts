import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import pc from "picocolors";
import { logger } from "./logger.js";

export interface BedrockCommandRequest {
  header: {
    version: number;
    requestId: string;
    messageType: "commandRequest";
    messagePurpose: "commandRequest";
  };
  body: {
    version: number;
    commandLine: string;
    origin: {
      type: "player";
    };
  };
}

export class BedrockHotReloadServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;

  constructor(port: number = 8000) {
    this.port = port;
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const tryListen = (attemptPort: number) => {
        const server = new WebSocketServer({ port: attemptPort }, () => {
          this.port = attemptPort;
          this.wss = server;
          this.setupHandlers(server);
          resolve(attemptPort);
        });

        server.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE") {
            logger.warn(`Port ${attemptPort} is in use, trying ${attemptPort + 1}...`);
            tryListen(attemptPort + 1);
          } else {
            reject(err);
          }
        });
      };

      tryListen(this.port);
    });
  }

  private setupHandlers(server: WebSocketServer): void {
    server.on("connection", (socket: WebSocket) => {
      this.clients.add(socket);
      logger.success(pc.green("Minecraft connected to WebSocket hot reload!"));

      // Delay welcome message 500ms so Bedrock completes internal handshake
      setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
          this.sendCommandToSocket(
            socket,
            'tellraw @a {"rawtext":[{"text":"§a[bdev] Connected to hot reload server!"}]}'
          );
        }
      }, 500);

      socket.on("message", (data: string) => {
        try {
          const res = JSON.parse(data.toString());
          if (res?.body?.statusCode && res.body.statusCode !== 0) {
            logger.warn(`Minecraft command response: ${res.body.statusMessage || "Error"}`);
          }
        } catch {
          // Ignore non-json responses
        }
      });

      socket.on("close", () => {
        this.clients.delete(socket);
        logger.info("Minecraft disconnected from WebSocket.");
      });

      socket.on("error", () => {
        this.clients.delete(socket);
      });
    });
  }

  public sendCommand(commandLine: string): void {
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        this.sendCommandToSocket(client, commandLine);
      }
    }
  }

  private sendCommandToSocket(socket: WebSocket, commandLine: string): void {
    const formatted = commandLine.startsWith("/") ? commandLine : `/${commandLine}`;
    const payload: BedrockCommandRequest = {
      header: {
        version: 1,
        requestId: uuidv4(),
        messageType: "commandRequest",
        messagePurpose: "commandRequest",
      },
      body: {
        version: 1,
        commandLine: formatted,
        origin: {
          type: "player",
        },
      },
    };
    socket.send(JSON.stringify(payload));
  }

  public reload(): void {
    if (this.clients.size === 0) {
      return;
    }
    // Notify in game chat and execute reload command
    this.sendCommand('tellraw @a {"rawtext":[{"text":"§e[bdev] Reloading scripts..."}]}');
    this.sendCommand("/reload");
  }

  public get clientCount(): number {
    return this.clients.size;
  }

  public get currentPort(): number {
    return this.port;
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        for (const client of this.clients) {
          client.terminate();
        }
        this.clients.clear();
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
