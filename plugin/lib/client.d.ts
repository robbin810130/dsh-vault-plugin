import { Context } from "@deepseek-ai/cordis";
//#region src/client/index.d.ts
declare const inject: readonly ["slots", "locale", "configForms", "sessions", "workspaces"];
declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface ISessions {
    readonly openingAccess: {
      register(gate: (sessionId: string) => void | Promise<void>): () => void;
    };
  }
}
interface ClientContext extends Context {
  readonly slots: {
    inject(name: string, factory: () => unknown): () => void;
    register(config: Record<string, unknown>, component: unknown): unknown;
  };
  readonly locale: {
    t?: (key: string) => string;
  };
  readonly sessions: Context['sessions'];
  readonly workspaces: Context['workspaces'];
  readonly configForms: Context['configForms'];
}
declare function apply(ctx: ClientContext): void;
declare namespace apply {
  var inject: readonly ["slots", "locale", "configForms", "sessions", "workspaces"];
}
//#endregion
export { apply, inject };
//# sourceMappingURL=client.d.ts.map