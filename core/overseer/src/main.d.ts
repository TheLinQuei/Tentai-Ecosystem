/**
 * Vi Overseer - God-1 Control Plane
 *
 * Authority:
 * - Ecosystem lifecycle (all dependencies)
 * - State machine (STOPPED/STARTING/RUNNING/CRASHED/DEGRADED)
 * - Command audit trail (immutable action log)
 * - Process lifecycle (start/stop/restart)
 * - Port management & health verification
 * - TEST_MODE enforcement (hard gate)
 * - Log streaming
 *
 * The God Console talks ONLY to Overseer.
 * Overseer talks to OS/Node/Docker.
 * Every action is logged. Every state is verified.
 */
export {};
//# sourceMappingURL=main.d.ts.map