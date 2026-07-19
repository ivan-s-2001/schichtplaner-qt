"use strict";

const { createServer } = require("node:http");
const { parse } = require("node:url");
const next = require("next");
const { Pool } = require("pg");
const { Server: SocketIOServer } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const requiredServerFiles = dev
  ? null
  : require("./.next/required-server-files.json");
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parsePort(process.env.PORT, 3000);
const publicUrl =
  process.env.APP_URL ||
  process.env.AUTH_URL ||
  process.env.NEXTAUTH_URL ||
  `http://localhost:${port}`;
const publicOrigin = new URL(publicUrl).origin;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const pool = new Pool({ connectionString: databaseUrl });
const app = next({
  dev,
  hostname,
  port,
  ...(requiredServerFiles ? { conf: requiredServerFiles.config } : {}),
});
const handle = app.getRequestHandler();

function firstHeader(value) {
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535
    ? parsed
    : fallback;
}

async function loadSocketIdentity(request) {
  const cookie = request.headers.cookie;
  if (!cookie) {
    throw new Error("Session cookie is missing");
  }

  const response = await fetch(
    `http://127.0.0.1:${port}/api/auth/session`,
    {
      headers: {
        cookie,
        "x-forwarded-host": firstHeader(
          request.headers["x-forwarded-host"] ||
            request.headers.host ||
            "localhost"
        ),
        "x-forwarded-proto": firstHeader(
          request.headers["x-forwarded-proto"] || "https"
        ),
      },
      signal: AbortSignal.timeout(5000),
    }
  );

  if (!response.ok) {
    throw new Error(`Session endpoint returned ${response.status}`);
  }

  const session = await response.json();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || !userId) {
    throw new Error("Authenticated user is missing");
  }

  const result = await pool.query(
    `
      SELECT
        "id"::text AS "id",
        "teamId"::text AS "teamId"
      FROM public.users
      WHERE "id" = $1::uuid
        AND "deletedAt" IS NULL
        AND "suspendedAt" IS NULL
      LIMIT 1
    `,
    [userId]
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error("Authenticated Outline user is unavailable");
  }

  return user;
}

async function canAccessSchedule(teamId, scheduleId) {
  if (
    typeof scheduleId !== "string" ||
    !scheduleId ||
    scheduleId.length > 200
  ) {
    return false;
  }

  const result = await pool.query(
    `
      SELECT 1
      FROM schedule.schedules
      WHERE "id" = $1
        AND "organizationId" = $2::uuid
        AND "deletedAt" IS NULL
      LIMIT 1
    `,
    [scheduleId, teamId]
  );

  return result.rowCount === 1;
}

app
  .prepare()
  .then(() => {
    const httpServer = createServer((req, res) => {
      handle(req, res, parse(req.url || "/", true));
    });

    const io = new SocketIOServer(httpServer, {
      path: "/api/ws",
      serveClient: false,
      transports: ["websocket", "polling"],
      cors: { origin: publicOrigin, credentials: true },
      allowRequest: (request, callback) => {
        const origin = firstHeader(request.headers.origin);
        callback(null, !origin || origin === publicOrigin);
      },
    });

    io.use(async (socket, nextMiddleware) => {
      try {
        socket.data.identity = await loadSocketIdentity(socket.request);
        nextMiddleware();
      } catch (error) {
        console.warn(
          "Rejected unauthenticated Socket.IO connection:",
          error instanceof Error ? error.message : String(error)
        );
        nextMiddleware(new Error("unauthorized"));
      }
    });

    io.on("connection", (socket) => {
      const identity = socket.data.identity;
      const organizationRoom = `org:${identity.teamId}`;

      socket.join(organizationRoom);

      socket.on("join:org", (_requestedOrganizationId, acknowledge) => {
        socket.join(organizationRoom);
        if (typeof acknowledge === "function") {
          acknowledge({ ok: true });
        }
      });

      socket.on("join:schedule", async (scheduleId, acknowledge) => {
        try {
          const allowed = await canAccessSchedule(
            identity.teamId,
            scheduleId
          );

          if (!allowed) {
            if (typeof acknowledge === "function") {
              acknowledge({ ok: false, error: "forbidden" });
            }
            return;
          }

          socket.join(`schedule:${scheduleId}`);
          if (typeof acknowledge === "function") {
            acknowledge({ ok: true });
          }
        } catch (error) {
          console.error(
            "Failed to authorize schedule room:",
            error instanceof Error ? error.message : String(error)
          );
          if (typeof acknowledge === "function") {
            acknowledge({ ok: false, error: "internal_error" });
          }
        }
      });

      socket.on("leave:schedule", (scheduleId) => {
        if (
          typeof scheduleId === "string" &&
          scheduleId.length <= 200
        ) {
          socket.leave(`schedule:${scheduleId}`);
        }
      });
    });

    globalThis.__socketIO = io;

    httpServer.listen(port, hostname, () => {
      console.log(`> Schedule ready at ${publicUrl}`);
      console.log(`> Internal listener http://${hostname}:${port}`);
    });

    async function shutdown(signal) {
      console.log(`> Received ${signal}, shutting down`);
      io.close();
      httpServer.close(async () => {
        await pool.end();
        process.exit(0);
      });

      setTimeout(() => process.exit(1), 10000).unref();
    }

    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
