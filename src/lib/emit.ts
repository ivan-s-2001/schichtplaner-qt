/**
 * Server-side Socket.IO emit helpers.
 *
 * These functions access the global `__socketIO` instance set by the
 * production custom server (`server.cjs`) and broadcast events only to rooms
 * that were authorized during the Socket.IO connection lifecycle.
 *
 * Usage in API routes:
 *   import { emitToOrg, emitToSchedule } from "@/lib/emit";
 *   emitToOrg(orgId, "schedule:updated", { scheduleId, action: "shift_created" });
 */

import type { Server as SocketIOServer } from "socket.io";

function getIO(): SocketIOServer | null {
  return (globalThis as Record<string, unknown>).__socketIO as SocketIOServer | null;
}

/**
 * Emit an event to all connected members of an organization.
 */
export function emitToOrg(orgId: string, event: string, data?: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(`org:${orgId}`).emit(event, data);
}

/**
 * Emit an event to all users currently viewing a specific schedule.
 */
export function emitToSchedule(scheduleId: string, event: string, data?: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(`schedule:${scheduleId}`).emit(event, data);
}
