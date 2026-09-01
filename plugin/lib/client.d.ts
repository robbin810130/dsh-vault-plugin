import { Context } from "@deepseek-ai/cordis";
//#region src/client/index.d.ts
declare const inject: readonly ["slots", "locale", "settingsScope", "navigationAccess", "workspaceRows"];
interface ClientContext extends Context {
  readonly slots: {
    inject(name: string, factory: () => unknown): () => void;
    register(config: Record<string, unknown>, component: unknown): unknown;
  };
  readonly locale: {
    t?: (key: string) => string;
  };
  readonly navigationAccess: {
    register(provider: unknown): () => void;
  };
  readonly workspaceRows: {
    register(decorator: unknown): () => void;
  };
  readonly settingsScope: {
    bind(spec: {
      namespace: string;
    }): {
      set(field: string, value: unknown): Promise<void>;
    };
  };
}
declare function apply(ctx: ClientContext): void;
declare namespace apply {
  var inject: readonly ["slots", "locale", "settingsScope", "navigationAccess", "workspaceRows"];
}
//#endregion
export { apply, inject };
//# sourceMappingURL=client.d.ts.map