import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import {
  Cipher,
  Decipher,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import pc from "picocolors";
import { logger } from "./logger.js";

const ENCRYPTED_WS_PROTOCOL = "com.microsoft.minecraft.wsencrypt";

interface WebSocketSession {
  encrypted: boolean;
  ready: boolean;
  queuedCommands: string[];
  handshakeRequestId?: string;
  privateKey?: ReturnType<typeof generateKeyPairSync>["privateKey"];
  salt?: Buffer;
  encrypt?: Cipher;
  decrypt?: Decipher;
}

export interface BedrockCommandRequest {
  header: {
    version: number;
    requestId: string;
    messagePurpose: "commandRequest";
  };
  body: {
    version: number;
    commandLine: string;
  };
}

export class BedrockHotReloadServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private sessions: Map<WebSocket, WebSocketSession> = new Map();
  private port: number;

  constructor(port: number = 8000) {
    this.port = port;
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const tryListen = (attemptPort: number) => {
        const server = new WebSocketServer({
          port: attemptPort,
          handleProtocols: (protocols) => {
            if (protocols.has(ENCRYPTED_WS_PROTOCOL)) {
              return ENCRYPTED_WS_PROTOCOL;
            }
            return false;
          },
        }, () => {
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
      const session: WebSocketSession = {
        encrypted: socket.protocol === ENCRYPTED_WS_PROTOCOL,
        ready: socket.protocol !== ENCRYPTED_WS_PROTOCOL,
        queuedCommands: [],
      };
      this.sessions.set(socket, session);
      logger.success(pc.green("Minecraft connected to WebSocket hot reload!"));

      if (session.encrypted) {
        this.startEncryptionHandshake(socket, session);
      }

      socket.on("message", (data: WebSocket.RawData) => {
        try {
          const session = this.sessions.get(socket);
          if (!session) {
            return;
          }
          const plain = this.decryptMessage(data, session);
          const res = JSON.parse(plain.toString("utf8"));

          if (
            session.handshakeRequestId &&
            res?.header?.messagePurpose === "commandResponse" &&
            res?.header?.requestId === session.handshakeRequestId
          ) {
            this.finishEncryptionHandshake(socket, session, res);
            return;
          }

          if (res?.body?.statusCode && res.body.statusCode !== 0) {
            logger.warn(`Minecraft command response: ${res.body.statusMessage || "Error"}`);
          }
        } catch {
          // Ignore non-json responses
        }
      });

      socket.on("close", () => {
        this.clients.delete(socket);
        this.sessions.delete(socket);
        logger.info("Minecraft disconnected from WebSocket.");
      });

      socket.on("error", () => {
        this.clients.delete(socket);
        this.sessions.delete(socket);
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
    // Match mcwss Player.Exec(): commandLine carries a leading slash.
    const formatted = commandLine.startsWith("/") ? commandLine : `/${commandLine}`;
    const session = this.sessions.get(socket);
    if (!session) {
      return;
    }
    if (!session.ready) {
      session.queuedCommands.push(formatted);
      return;
    }

    const payload: BedrockCommandRequest = {
      header: {
        requestId: uuidv4(),
        messagePurpose: "commandRequest",
        version: 1,
      },
      body: {
        commandLine: formatted,
        version: 1,
      },
    };
    this.sendPayload(socket, session, payload);
  }

  private sendPayload(
    socket: WebSocket,
    session: WebSocketSession,
    payload: BedrockCommandRequest
  ): void {
    const data = Buffer.from(JSON.stringify(payload));
    if (session.encrypted && session.encrypt) {
      socket.send(session.encrypt.update(data), { binary: false });
    } else {
      socket.send(data.toString("utf8"));
    }
  }

  private startEncryptionHandshake(socket: WebSocket, session: WebSocketSession): void {
    const keyPair = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
    const salt = randomBytes(16);
    session.privateKey = keyPair.privateKey;
    session.salt = salt;
    session.handshakeRequestId = uuidv4();

    const publicKey = keyPair.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64")
      .replace(/=+$/, "");
    const saltBase64 = salt.toString("base64").replace(/=+$/, "");
    const payload: BedrockCommandRequest = {
      header: {
        requestId: session.handshakeRequestId,
        messagePurpose: "commandRequest",
        version: 1,
      },
      body: {
        commandLine: `/enableencryption "${publicKey}" "${saltBase64}"`,
        version: 1,
      },
    };
    this.sendPayload(socket, { ...session, ready: true, encrypted: false }, payload);
  }

  private finishEncryptionHandshake(
    socket: WebSocket,
    session: WebSocketSession,
    response: { body?: { publicKey?: string } }
  ): void {
    if (!session.privateKey || !session.salt || !response.body?.publicKey) {
      logger.warn("Minecraft WebSocket encryption handshake failed: missing client public key");
      return;
    }

    try {
      const clientPublicKey = createPublicKey({
        key: Buffer.from(response.body.publicKey, "base64"),
        format: "der",
        type: "spki",
      });
      const sharedSecret = diffieHellman({
        privateKey: session.privateKey,
        publicKey: clientPublicKey,
      });
      const sharedSecretWithoutPadding = sharedSecret.subarray(
        sharedSecret.findIndex((byte) => byte !== 0)
      );
      const key = createHash("sha256")
        .update(Buffer.concat([session.salt, sharedSecretWithoutPadding]))
        .digest();
      const iv = key.subarray(0, 16);
      session.encrypt = createCipheriv("aes-256-cfb8", key, iv);
      session.decrypt = createDecipheriv("aes-256-cfb8", key, iv);
      session.ready = true;

      const queued = session.queuedCommands.splice(0);
      for (const command of queued) {
        this.sendCommandToSocket(socket, command);
      }
    } catch (err) {
      logger.warn(`Minecraft WebSocket encryption handshake failed: ${(err as Error).message}`);
    }
  }

  private decryptMessage(data: WebSocket.RawData, session: WebSocketSession): Buffer {
    const bytes = Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data as ArrayBuffer);
    if (session.encrypted && session.decrypt) {
      return session.decrypt.update(bytes);
    }
    return bytes;
  }

  public reload(): void {
    if (this.clients.size === 0) {
      return;
    }
    this.sendCommand("reload");
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
        this.sessions.clear();
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
