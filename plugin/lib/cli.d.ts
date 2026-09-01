import { r as VaultState, t as AuditEvent } from "./model-CirJ7a2o.js";
import { Readable, Writable } from "node:stream";
//#region src/cli.d.ts
interface CliRepository {
  load(): Promise<VaultState>;
  commit(expectedRevision: number, next: VaultState): Promise<{
    ok: true;
    revision: number;
  } | {
    ok: false;
    code: 'revision-conflict';
  }>;
  appendAudit(event: AuditEvent): Promise<void>;
  commitWithAudit?(expectedRevision: number, next: VaultState, attempt: AuditEvent, success: AuditEvent): Promise<{
    ok: true;
    revision: number;
  } | {
    ok: false;
    code: 'revision-conflict';
  }>;
}
interface CliInputOptions {
  readonly stdin?: AsyncIterable<string> | Readable;
  readonly state?: VaultState;
  readonly repository?: CliRepository;
  readonly stateDir?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly workingDirectory?: string;
  readonly now?: () => string;
}
interface CliResult {
  readonly exitCode: 0 | 1 | 2;
  readonly output: string;
  readonly error: string;
  readonly state?: VaultState;
  readonly audit?: AuditEvent;
}
declare function isCliEntrypoint(moduleUrl: string, argv1?: string | undefined): boolean;
declare function runCli(argv: readonly string[], options?: CliInputOptions): Promise<CliResult>;
declare function main(argv?: string[], stdout?: Writable, stderr?: Writable): Promise<number>;
//#endregion
export { CliResult, isCliEntrypoint, main, runCli };
//# sourceMappingURL=cli.d.ts.map