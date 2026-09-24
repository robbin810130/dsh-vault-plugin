window.__ModuleLoader__.load({
	id: "dsh-vault-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-vault-css:/Users/Robbin/.codex/worktrees/vault-017-compat/DSH 插件/plugin/src/client/styles.css.mjs
		const css = ".dsh-vault{color:inherit}.dsh-vault-settings-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);max-width:760px;color:var(--dsw-alias-label-primary);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}.dsh-vault-settings-card:hover{border-color:var(--dsw-alias-label-dimmed)}.dsh-vault-settings-card-open{border-color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2)}.dsh-vault-settings-card-heading{flex-direction:column;gap:2px;min-width:0;display:flex}.dsh-vault-settings-card-heading strong{font-size:15px;font-weight:600;line-height:1.5}.dsh-vault-settings-card-heading small{color:var(--dsw-alias-label-tertiary);font-size:13px;font-weight:400;line-height:1.5}.dsh-vault-settings-card h2,.dsh-vault-settings-panel h3{margin:0;font-size:13px;font-weight:600;line-height:1.5}.dsh-vault-settings-card-header{appearance:none;width:100%;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.dsh-vault-settings-card-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.dsh-vault-settings-card-heading{flex:1}.dsh-vault-settings-card-chevron{width:7px;height:7px;color:var(--dsw-alias-label-tertiary);border-bottom:1.5px solid;border-right:1.5px solid;flex:none;margin:0 5px 3px 0;transition:transform .12s;transform:rotate(45deg)}.dsh-vault-settings-card-open .dsh-vault-settings-card-chevron{margin-bottom:-3px;transform:rotate(225deg)}.dsh-vault-settings-card-body{border-top:1px solid var(--dsw-alias-border-l2);min-width:0;margin:0 16px;padding-bottom:8px}.dsh-vault-settings-tabs{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:flex-end;gap:22px;margin-top:2px;display:flex}.dsh-vault-settings-tabs button{color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:0 0;border:0;padding:7px 1px 9px;font-size:13px;line-height:20px;position:relative}.dsh-vault-settings-tabs button:hover,.dsh-vault-settings-tabs button[aria-selected=true]{color:var(--dsw-alias-label-primary)}.dsh-vault-settings-tabs button[aria-selected=true]:after,.dsh-vault-settings-tabs button:focus-visible:after{content:\"\";background:var(--dsw-alias-label-primary);border-radius:2px 2px 0 0;height:2px;position:absolute;bottom:-1px;left:0;right:0}.dsh-vault-settings-panel{min-width:0}.dsh-vault-field{flex-direction:column;gap:6px;padding:12px 0;display:flex}.dsh-vault-field+.dsh-vault-field{border-top:1px solid var(--dsw-alias-border-l2)}.dsh-vault-field>span,.dsh-vault-checkbox{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}.dsh-vault-field select,.dsh-vault-field input[type=number],.dsh-vault-field input[type=text],.dsh-vault-field input[type=password]{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);width:100%;height:34px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}.dsh-vault-field select:focus-visible,.dsh-vault-field input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}.dsh-vault-checkbox{align-items:center;gap:8px;padding:6px 0;display:flex}.dsh-vault-checkbox input{accent-color:var(--dsw-alias-brand-primary)}.dsh-vault-row-accessory,.dsh-vault-row-action,.dsh-vault-row-menu,.dsh-vault-dialog,.dsh-vault-locked-conversation{color:inherit;font:inherit}.dsh-vault-row-accessory{align-items:center;gap:.35rem;min-height:44px;display:inline-flex}.dsh-vault-row-accessory-locked{color:var(--dsw-alias-brand-primary)}.dsh-vault-row-accessory-inherited{color:var(--dsw-alias-label-secondary)}.dsh-vault-row-accessory-text,.dsh-vault-row-accessory-muted{display:none}.dsh-vault-lock-icon,.dsh-vault-protected-lock-icon,.dsh-vault-dialog-icon,.dsh-vault-locked-conversation-icon{flex:none;width:16px;height:16px}.dsh-vault-protected-lock-icon{color:var(--dsw-alias-label-secondary)}.dsh-vault-row-accessory-locked .dsh-vault-protected-lock-icon{color:var(--dsw-alias-brand-primary)}.dsh-vault-row-accessory-inherited .dsh-vault-protected-lock-icon{color:var(--dsw-alias-label-tertiary)}.dsh-vault-row-action{align-items:center;display:inline-flex;position:relative}.dsh-vault-row-action-button,.dsh-vault-button,.dsh-vault-row-menu-item{border:1px solid var(--dsw-alias-border-l2);min-height:34px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:8px;padding:0 12px;font-size:13px}.dsh-vault-row-action-button{background:0 0;border-color:#0000;width:34px;padding:0}.dsh-vault-row-action-button:hover:not(:disabled){background:var(--dsw-alias-bg-module-platform);border-color:#0000}.dsh-vault-button:hover:not(:disabled),.dsh-vault-row-menu-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dsh-vault-button-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:#0000}.dsh-vault-button-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.dsh-vault-row-menu{z-index:10;gap:.25rem;display:grid;position:absolute;top:100%;right:0}.dsh-vault-dialog-backdrop{z-index:2147483000;box-sizing:border-box;background:#0000008f;background:color-mix(in srgb, var(--dsw-alias-bg-base) 64%, transparent);place-items:center;padding:16px;display:grid;position:fixed;inset:0}.dsh-vault-dialog{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);width:min(420px,100%);max-width:100%;color:var(--dsw-alias-label-primary);box-shadow:0 18px 52px #0000006b;box-shadow:0 18px 52px color-mix(in srgb, var(--dsw-alias-bg-base) 42%, transparent);border-radius:12px;gap:.75rem;padding:20px;display:grid}.dsh-vault-dialog h2{color:var(--dsw-alias-label-primary);margin:0;font-size:18px;font-weight:600;line-height:1.4}.dsh-vault-dialog>p{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:1.5}.dsh-vault-quick-lock-dialog .dsh-vault-field input{box-sizing:border-box;width:100%}.dsh-vault-quick-lock-error{border:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);border-radius:10px;gap:.25rem;margin:0;padding:.75rem .875rem;font-size:13px;line-height:1.5;display:grid}.dsh-vault-quick-lock-error>strong{font-weight:600}.dsh-vault-quick-lock-error>span{color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary))}.dsh-vault-field{gap:.35rem;display:grid}.dsh-vault-field input{min-height:34px}.dsh-vault-settings-heading{justify-content:space-between;align-items:center;gap:12px;padding:12px 0;display:flex}.dsh-vault-settings-heading-actions-only{justify-content:flex-end}.dsh-vault-settings-disclosure,.dsh-vault-settings-warning{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.dsh-vault-group-list{gap:8px;margin:0;padding:0;list-style:none;display:grid}.dsh-vault-group-list>li{flex-wrap:wrap;align-items:center;gap:4px 8px;min-width:0;padding:8px 0;display:flex}.dsh-vault-group-list>li>strong{min-width:0;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}.dsh-vault-group-list>li>span{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.dsh-vault-group-list>li>.dsh-vault-dialog-actions{margin-left:auto}.dsh-vault-dialog-actions{justify-content:flex-end;gap:.5rem;display:flex}.dsh-vault-locked-conversation{text-align:center;align-content:center;justify-items:center;gap:.75rem;max-width:28rem;min-height:100%;margin:0 auto;padding:3rem 2rem;display:grid}.dsh-vault-locked-conversation-icon{width:48px;height:48px;color:var(--dsw-alias-brand-primary);opacity:.9;margin-bottom:.5rem}.dsh-vault-locked-conversation-title{margin:0;font-size:1.5rem;font-weight:600}.dsh-vault-locked-conversation-copy{color:var(--dsw-alias-label-secondary);margin:0}";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin=\"dsh-vault-plugin\"]") === null) {
			const tag = document.createElement("style");
			tag.setAttribute("data-plugin", "dsh-vault-plugin");
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/api.ts
		const ROUTE = "/dsh-vault/api";
		const HOST_ERROR_CODES = /* @__PURE__ */ new Set([
			"body-too-large",
			"busy",
			"state-lock-busy",
			"state-lock-recovery-required",
			"create-intent-refused",
			"cooldown",
			"duplicate-name",
			"invalid-binding",
			"invalid-credentials",
			"invalid-request",
			"method-not-allowed",
			"operation-failed",
			"origin-refused",
			"persistence-failed",
			"revision-conflict",
			"unsupported-media-type",
			"weak-password"
		]);
		function failure(code, message, retryAt) {
			return {
				ok: false,
				error: {
					code,
					message,
					...retryAt === void 0 ? {} : { retryAt }
				}
			};
		}
		function record(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid Vault response");
			return value;
		}
		function exact(source, keys) {
			if (Object.keys(source).some((key) => !keys.includes(key))) throw new TypeError("Invalid Vault response");
		}
		function text(value, max = 512) {
			if (typeof value !== "string" || value.length === 0 || value.length > max) throw new TypeError("Invalid Vault response");
			return value;
		}
		function optionalText(value, max = 512) {
			return value === void 0 ? void 0 : text(value, max);
		}
		function safeInteger(value, minimum = 0) {
			if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError("Invalid Vault response");
			return value;
		}
		function finiteNumber(value, minimum = 0) {
			if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) throw new TypeError("Invalid Vault response");
			return value;
		}
		function boolean(value) {
			if (typeof value !== "boolean") throw new TypeError("Invalid Vault response");
			return value;
		}
		function array(value, max = 256) {
			if (!Array.isArray(value) || value.length > max) throw new TypeError("Invalid Vault response");
			return value;
		}
		function parsePolicy(value) {
			const source = record(value);
			exact(source, [
				"autoLockMinutes",
				"lockOnSystemSleep",
				"lockedNameVisibility",
				"failedAttemptProtection",
				"passwordPolicy"
			]);
			if (source.autoLockMinutes !== 0 && source.autoLockMinutes !== 15 && source.autoLockMinutes !== 30 && source.autoLockMinutes !== 60) throw new TypeError("Invalid Vault response");
			if (source.lockedNameVisibility !== "workspace-visible-session-hidden" && source.lockedNameVisibility !== "all-visible" && source.lockedNameVisibility !== "all-hidden") throw new TypeError("Invalid Vault response");
			const attempts = record(source.failedAttemptProtection);
			exact(attempts, [
				"enabled",
				"maxAttempts",
				"cooldownSeconds"
			]);
			const passwordPolicy = source.passwordPolicy === void 0 ? {
				minLength: 8,
				requireUppercase: false,
				requireLowercase: false,
				requireNumber: false,
				requireSymbol: false
			} : record(source.passwordPolicy);
			exact(passwordPolicy, [
				"minLength",
				"requireUppercase",
				"requireLowercase",
				"requireNumber",
				"requireSymbol"
			]);
			return {
				autoLockMinutes: source.autoLockMinutes,
				lockOnSystemSleep: boolean(source.lockOnSystemSleep),
				lockedNameVisibility: source.lockedNameVisibility,
				failedAttemptProtection: {
					enabled: boolean(attempts.enabled),
					maxAttempts: safeInteger(attempts.maxAttempts, 1),
					cooldownSeconds: safeInteger(attempts.cooldownSeconds, 1)
				},
				passwordPolicy: {
					minLength: safeInteger(passwordPolicy.minLength, 4),
					requireUppercase: boolean(passwordPolicy.requireUppercase),
					requireLowercase: boolean(passwordPolicy.requireLowercase),
					requireNumber: boolean(passwordPolicy.requireNumber),
					requireSymbol: boolean(passwordPolicy.requireSymbol)
				}
			};
		}
		function parseGroup(value) {
			const source = record(value);
			exact(source, [
				"id",
				"name",
				"credentialVersion",
				"recoveryConfigured",
				"recoveryGeneratedAt",
				"recoveryLastVerifiedAt",
				"memberCount"
			]);
			const recoveryLastVerifiedAt = optionalText(source.recoveryLastVerifiedAt, 128);
			return {
				id: text(source.id, 128),
				name: text(source.name, 128),
				credentialVersion: safeInteger(source.credentialVersion, 1),
				recoveryConfigured: boolean(source.recoveryConfigured),
				recoveryGeneratedAt: text(source.recoveryGeneratedAt, 128),
				...recoveryLastVerifiedAt === void 0 ? {} : { recoveryLastVerifiedAt },
				memberCount: safeInteger(source.memberCount)
			};
		}
		function parseBinding(value) {
			const source = record(value);
			exact(source, [
				"targetType",
				"targetId",
				"mode",
				"passwordGroupId",
				"workspaceId",
				"createdAt",
				"updatedAt"
			]);
			if (source.targetType !== "workspace" && source.targetType !== "session") throw new TypeError("Invalid Vault response");
			if (source.mode !== "direct" && source.mode !== "inherit" && source.mode !== "no-inherit") throw new TypeError("Invalid Vault response");
			const passwordGroupId = optionalText(source.passwordGroupId, 128);
			const workspaceId = optionalText(source.workspaceId, 128);
			return {
				targetType: source.targetType,
				targetId: text(source.targetId, 128),
				mode: source.mode,
				...passwordGroupId === void 0 ? {} : { passwordGroupId },
				...workspaceId === void 0 ? {} : { workspaceId },
				createdAt: text(source.createdAt, 128),
				updatedAt: text(source.updatedAt, 128)
			};
		}
		function parseSnapshot(value) {
			const source = record(value);
			exact(source, [
				"revision",
				"policy",
				"groups",
				"bindings"
			]);
			return {
				revision: safeInteger(source.revision),
				policy: parsePolicy(source.policy),
				groups: array(source.groups).map(parseGroup),
				bindings: array(source.bindings).map(parseBinding)
			};
		}
		function parseGrant(value) {
			const source = record(value);
			exact(source, [
				"groupId",
				"credentialVersion",
				"token"
			]);
			const token = text(source.token, 256);
			if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new TypeError("Invalid Vault response");
			return {
				groupId: text(source.groupId, 128),
				credentialVersion: safeInteger(source.credentialVersion, 1),
				token
			};
		}
		function parseUnlockResult(value) {
			const source = record(value);
			exact(source, ["grant", "expiresAt"]);
			return {
				grant: parseGrant(source.grant),
				expiresAt: finiteNumber(source.expiresAt)
			};
		}
		function parseGrantValidation(value) {
			const source = record(value);
			exact(source, ["valid"]);
			return { valid: boolean(source.valid) };
		}
		function parseActivityTouch(value) {
			const source = record(value);
			exact(source, ["valid", "touched"]);
			return {
				valid: boolean(source.valid),
				touched: boolean(source.touched)
			};
		}
		function parseSnapshotWithRecovery(value, recoveryRequired) {
			const source = record(value);
			exact(source, ["snapshot", "recoveryKey"]);
			const recoveryKey = optionalText(source.recoveryKey, 512);
			if (recoveryRequired && recoveryKey === void 0) throw new TypeError("Invalid Vault response");
			return {
				snapshot: parseSnapshot(source.snapshot),
				...recoveryKey === void 0 ? {} : { recoveryKey }
			};
		}
		function parseCreateIntent(value) {
			const source = record(value);
			exact(source, ["intent"]);
			const intent = text(source.intent, 128);
			if (!/^[A-Za-z0-9_-]{43}$/.test(intent)) throw new TypeError("Invalid Vault response");
			return { intent };
		}
		function parseSuccess(request, value) {
			switch (request.action) {
				case "snapshot": return parseSnapshot(value);
				case "unlock": return parseUnlockResult(value);
				case "grants-validate": return parseGrantValidation(value);
				case "activity-touch": return parseActivityTouch(value);
				case "lock-group":
				case "lock-all":
					if (value !== null) throw new TypeError("Invalid Vault response");
					return null;
				case "group-create": return parseSnapshotWithRecovery(value, true);
				case "group-change-password": return parseSnapshotWithRecovery(value, false);
				case "group-recover": return parseSnapshotWithRecovery(value, true);
				case "bindings-update": return parseSnapshot(value);
			}
		}
		function parseResult(request, value) {
			const source = record(value);
			if (source.ok === true) {
				exact(source, ["ok", "value"]);
				if (!Object.hasOwn(source, "value")) throw new TypeError("Invalid Vault response");
				return {
					ok: true,
					value: parseSuccess(request, source.value)
				};
			}
			if (source.ok === false) return parseError(source);
			throw new TypeError("Invalid Vault response");
		}
		function parseError(source) {
			exact(source, ["ok", "error"]);
			const error = record(source.error);
			exact(error, [
				"code",
				"message",
				"retryAt"
			]);
			const code = text(error.code, 64);
			text(error.message, 512);
			if (!HOST_ERROR_CODES.has(code)) throw new TypeError("Invalid Vault response");
			return failure(code, "Vault operation failed", error.retryAt === void 0 ? void 0 : finiteNumber(error.retryAt));
		}
		function createVaultApiClient(fetcher = globalThis.fetch) {
			return {
				async createGroupIntent(clientInstanceId, signal) {
					let response;
					try {
						response = await fetcher(ROUTE, {
							method: "POST",
							credentials: "same-origin",
							cache: "no-store",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								action: "group-create-intent",
								clientInstanceId
							}),
							...signal === void 0 ? {} : { signal }
						});
					} catch {
						return signal?.aborted ? failure("request-aborted", "Vault request aborted") : failure("host-unavailable", "Vault host unavailable");
					}
					if (!response.ok) return failure("host-unavailable", "Vault host unavailable");
					try {
						const body = record(await response.json());
						if (body.ok === false) return parseError(body);
						if (body.ok !== true) return failure("invalid-response", "Vault response refused");
						exact(body, ["ok", "value"]);
						return {
							ok: true,
							value: parseCreateIntent(body.value)
						};
					} catch {
						return failure("invalid-response", "Vault response refused");
					}
				},
				async call(request, signal) {
					let response;
					try {
						response = await fetcher(ROUTE, {
							method: "POST",
							credentials: "same-origin",
							cache: "no-store",
							headers: { "content-type": "application/json" },
							body: JSON.stringify(request),
							...signal === void 0 ? {} : { signal }
						});
					} catch {
						return signal?.aborted ? failure("request-aborted", "Vault request aborted") : failure("host-unavailable", "Vault host unavailable");
					}
					if (!response.ok) return failure("host-unavailable", "Vault host unavailable");
					let body;
					try {
						body = await response.json();
					} catch {
						return failure("invalid-response", "Vault response refused");
					}
					try {
						return parseResult(request, body);
					} catch {
						return failure("invalid-response", "Vault response refused");
					}
				}
			};
		}
		//#endregion
		//#region src/client/access/resolution.ts
		function directGroup(binding) {
			return binding?.mode === "direct" ? binding.passwordGroupId : void 0;
		}
		function groupState(snapshot, groupId) {
			if (!snapshot.groups.some((group) => group.id === groupId)) return {
				kind: "blocked",
				reason: "invalid protection binding"
			};
			return {
				kind: "protected",
				groupId
			};
		}
		function workspaceGroup(snapshot, workspaceId) {
			if (workspaceId === void 0) return { kind: "plain" };
			const binding = snapshot.bindings.find((candidate) => candidate.targetType === "workspace" && candidate.targetId === workspaceId);
			if (binding === void 0) return { kind: "plain" };
			const groupId = directGroup(binding);
			return groupId === void 0 ? {
				kind: "blocked",
				reason: "invalid workspace binding"
			} : groupState(snapshot, groupId);
		}
		function resolveVaultTarget(snapshot, target, context) {
			if (snapshot.host !== "ready") return {
				kind: "blocked",
				reason: snapshot.host === "offline" ? "Vault host unavailable" : "Vault protection loading"
			};
			if (target.type === "workspace") return workspaceGroup(snapshot, target.id);
			const sessionBindings = snapshot.bindings.filter((candidate) => candidate.targetType === "session" && candidate.targetId === target.id);
			const direct = sessionBindings.find((candidate) => candidate.mode === "direct");
			const directGroupId = directGroup(direct);
			if (direct !== void 0) return directGroupId === void 0 ? {
				kind: "blocked",
				reason: "invalid session binding"
			} : groupState(snapshot, directGroupId);
			if (sessionBindings.some((candidate) => candidate.mode === "no-inherit")) return { kind: "plain" };
			if (sessionBindings.some((candidate) => candidate.mode === "inherit")) {
				if (target.workspaceId === void 0) return {
					kind: "blocked",
					reason: "invalid session binding"
				};
				return workspaceGroup(snapshot, target.workspaceId);
			}
			if (target.workspaceId === void 0) {
				if (context?.workspaceAbsent === true) return { kind: "plain" };
				return snapshot.bindings.some((candidate) => candidate.targetType === "workspace") ? {
					kind: "blocked",
					reason: "invalid session binding"
				} : { kind: "plain" };
			}
			return workspaceGroup(snapshot, target.workspaceId);
		}
		//#endregion
		//#region src/client/rows/presentation.ts
		const MAX_REMEMBERED_SESSIONS = 500;
		const sessionWorkspaceIds = /* @__PURE__ */ new Map();
		function rememberWorkspaceIdForSession(sessionId, workspaceId) {
			if (workspaceId === void 0) return;
			sessionWorkspaceIds.delete(sessionId);
			if (workspaceId === null) return;
			sessionWorkspaceIds.set(sessionId, workspaceId);
			if (sessionWorkspaceIds.size > MAX_REMEMBERED_SESSIONS) {
				const oldest = sessionWorkspaceIds.keys().next().value;
				if (oldest !== void 0) sessionWorkspaceIds.delete(oldest);
			}
		}
		function workspaceIdForSession(sessionId) {
			return sessionWorkspaceIds.get(sessionId);
		}
		//#endregion
		//#region src/client/access/provider.ts
		function targetState(store, target, workspaceAbsent = false) {
			const snapshot = store.getSnapshot();
			const resolution = resolveVaultTarget(snapshot, target, { workspaceAbsent });
			if (resolution.kind === "plain") return { kind: "allow" };
			if (resolution.kind === "blocked") return {
				kind: "blocked",
				reason: resolution.reason
			};
			if (snapshot.host !== "ready" || !store.hasUnlockedGroup(resolution.groupId)) return {
				kind: "blocked",
				reason: snapshot.host === "offline" ? "Vault host unavailable" : "Vault group locked"
			};
			return { kind: "allow" };
		}
		function protectedResolution(store, target) {
			return resolveVaultTarget(store.getSnapshot(), target);
		}
		function decisionWithoutPrompt(store, target) {
			const resolution = protectedResolution(store, target);
			if (resolution.kind === "plain") return Promise.resolve({ allow: true });
			if (resolution.kind === "blocked") return Promise.resolve({
				allow: false,
				handled: true
			});
			return Promise.resolve({ allow: true });
		}
		function createVaultAccessProvider(store) {
			const listeners = /* @__PURE__ */ new Set();
			const sessionTarget = (id, ...context) => {
				const workspaceId = context[0];
				rememberWorkspaceIdForSession(id, context.length > 0 ? workspaceId ?? null : void 0);
				if (workspaceId === null) return {
					target: {
						type: "session",
						id
					},
					workspaceAbsent: true
				};
				const resolvedWorkspaceId = workspaceId ?? workspaceIdForSession(id);
				return resolvedWorkspaceId === void 0 ? {
					target: {
						type: "session",
						id
					},
					workspaceAbsent: false
				} : {
					target: {
						type: "session",
						id,
						workspaceId: resolvedWorkspaceId
					},
					workspaceAbsent: false
				};
			};
			const matchesSession = (id, ...context) => {
				const { target, workspaceAbsent } = sessionTarget(id, ...context);
				return resolveVaultTarget(store.getSnapshot(), target, { workspaceAbsent }).kind !== "plain";
			};
			const unsubscribe = store.subscribe(() => {
				for (const listener of [...listeners]) listener();
			});
			const requestSession = (id, ...context) => {
				sessionTarget(id, ...context);
				return Promise.resolve({ allow: true });
			};
			return {
				matchesWorkspace: (id) => protectedResolution(store, {
					type: "workspace",
					id
				}).kind !== "plain",
				matchesSession,
				workspaceState: (id) => targetState(store, {
					type: "workspace",
					id
				}),
				sessionState: (id, ...context) => {
					const { target, workspaceAbsent } = sessionTarget(id, ...context);
					return targetState(store, target, workspaceAbsent);
				},
				requestWorkspace: (id) => decisionWithoutPrompt(store, {
					type: "workspace",
					id
				}),
				requestSession,
				subscribe: (listener) => {
					listeners.add(listener);
					let active = true;
					return () => {
						if (active) {
							active = false;
							listeners.delete(listener);
						}
					};
				},
				dispose: unsubscribe
			};
		}
		//#endregion
		//#region src/client/store.ts
		const SAFE_ERROR_CODES = /* @__PURE__ */ new Set([
			"body-too-large",
			"busy",
			"state-lock-busy",
			"state-lock-recovery-required",
			"cooldown",
			"duplicate-name",
			"host-unavailable",
			"invalid-binding",
			"invalid-credentials",
			"invalid-request",
			"invalid-response",
			"method-not-allowed",
			"operation-failed",
			"origin-refused",
			"persistence-failed",
			"request-aborted",
			"revision-conflict",
			"unsupported-media-type"
		]);
		function failed(code, message, retryAt) {
			return {
				ok: false,
				error: {
					code,
					message,
					...retryAt === void 0 ? {} : { retryAt }
				}
			};
		}
		function safeFailure(value) {
			if (value !== null && typeof value === "object") {
				const source = value;
				if (typeof source.code === "string" && SAFE_ERROR_CODES.has(source.code)) {
					const retryAt = typeof source.retryAt === "number" && Number.isFinite(source.retryAt) && source.retryAt >= 0 ? source.retryAt : void 0;
					const message = source.code === "host-unavailable" ? "Vault host unavailable" : source.code === "invalid-response" ? "Vault response refused" : source.code === "request-aborted" ? "Vault request aborted" : "Vault operation failed";
					return failed(source.code, message, retryAt);
				}
			}
			return failed("invalid-response", "Vault response refused");
		}
		function isUnavailable(result) {
			return !result.ok && (result.error.code === "host-unavailable" || result.error.code === "invalid-response" || result.error.code === "request-aborted");
		}
		var ImmutableStringSet = class {
			#values;
			constructor(values) {
				this.#values = new Set(values);
				Object.freeze(this);
			}
			get size() {
				return this.#values.size;
			}
			has(value) {
				return this.#values.has(value);
			}
			entries() {
				return this.#values.entries();
			}
			keys() {
				return this.#values.keys();
			}
			values() {
				return this.#values.values();
			}
			[Symbol.iterator]() {
				return this.#values[Symbol.iterator]();
			}
			get [Symbol.toStringTag]() {
				return "ReadonlySet";
			}
			forEach(callback, thisArg) {
				for (const value of this.#values) callback.call(thisArg, value, value, this);
			}
		};
		function immutableSnapshot(host, revision, groups, bindings, policy, unlockedGroupIds, prompt = null) {
			const frozenGroups = Object.freeze(groups.map((group) => Object.freeze({ ...group })));
			const frozenBindings = Object.freeze(bindings.map((binding) => Object.freeze({ ...binding })));
			const frozenPrompt = prompt === null ? null : Object.freeze({
				...prompt,
				target: Object.freeze({ ...prompt.target })
			});
			return Object.freeze({
				host,
				revision,
				groups: frozenGroups,
				bindings: frozenBindings,
				policy: Object.freeze({
					...policy,
					failedAttemptProtection: Object.freeze({ ...policy.failedAttemptProtection })
				}),
				unlockedGroupIds: new ImmutableStringSet(unlockedGroupIds),
				prompt: frozenPrompt
			});
		}
		function sameProof(left, right) {
			return left?.groupId === right.groupId && left.credentialVersion === right.credentialVersion && left.token === right.token;
		}
		var VaultClientStoreImplementation = class {
			#clientInstanceId;
			#api;
			#grants = /* @__PURE__ */ new Map();
			#grantExpiries = /* @__PURE__ */ new Map();
			#listeners = /* @__PURE__ */ new Set();
			#unlockGeneration = 0;
			#pendingUnlock;
			#refreshGeneration = 0;
			#snapshot = immutableSnapshot("loading", 0, [], [], {
				autoLockMinutes: 15,
				lockOnSystemSleep: true,
				lockedNameVisibility: "workspace-visible-session-hidden",
				failedAttemptProtection: {
					enabled: true,
					maxAttempts: 3,
					cooldownSeconds: 300
				},
				passwordPolicy: {
					minLength: 8,
					requireUppercase: false,
					requireLowercase: false,
					requireNumber: false,
					requireSymbol: false
				}
			}, []);
			constructor(api) {
				const randomUUID = globalThis.crypto?.randomUUID;
				if (typeof randomUUID !== "function") throw new TypeError("Secure UUID generation is unavailable");
				this.#clientInstanceId = randomUUID.call(globalThis.crypto);
				this.#api = api;
			}
			get clientInstanceId() {
				return this.#clientInstanceId;
			}
			getSnapshot() {
				return this.#snapshot;
			}
			hasUnlockedGroup(groupId) {
				this.#syncSnapshotUnlockState();
				return this.#snapshot.unlockedGroupIds.has(groupId);
			}
			requestUnlock(groupId, target) {
				this.#syncSnapshotUnlockState();
				const snapshot = this.#snapshot;
				if (snapshot.host !== "ready" || !snapshot.groups.some((group) => group.id === groupId)) return Promise.resolve(false);
				if (snapshot.unlockedGroupIds.has(groupId)) return Promise.resolve(true);
				if (this.#pendingUnlock !== void 0) return this.#pendingUnlock.groupId === groupId ? this.#pendingUnlock.promise : Promise.resolve(false);
				this.#invalidateUnlocks();
				let resolve;
				const promise = new Promise((res) => {
					resolve = res;
				});
				this.#pendingUnlock = {
					groupId,
					resolve,
					promise
				};
				this.#publish("ready", snapshot.unlockedGroupIds, {
					groupId,
					target
				}, true);
				return promise;
			}
			settleUnlock(groupId) {
				if (this.#pendingUnlock?.groupId !== groupId) return;
				this.#finishUnlock(this.#snapshot.host === "ready" && this.#snapshot.unlockedGroupIds.has(groupId));
			}
			cancelUnlock(groupId) {
				if (this.#pendingUnlock?.groupId !== groupId) return;
				this.#invalidateUnlocks();
				this.#finishUnlock(false);
			}
			subscribe(listener) {
				this.#listeners.add(listener);
				let active = true;
				return () => {
					if (!active) return;
					active = false;
					this.#listeners.delete(listener);
				};
			}
			async refresh(signal) {
				const generation = ++this.#refreshGeneration;
				const response = await this.#call({
					action: "snapshot",
					clientInstanceId: this.clientInstanceId
				}, signal);
				if (!this.#isCurrentRefresh(generation)) return response.ok ? {
					ok: true,
					value: this.#snapshot
				} : response;
				if (!response.ok) {
					this.#markOffline();
					return response;
				}
				if (!this.#acceptSnapshot(response.value, [])) return this.#invalidResponse();
				const validation = await this.#validateGrants(signal, generation);
				if (!validation.ok) return validation;
				return {
					ok: true,
					value: this.#snapshot
				};
			}
			async validateGrants(signal) {
				return this.#validateGrants(signal);
			}
			async #validateGrants(signal, generation) {
				if (!this.#isCurrentRefresh(generation)) return {
					ok: true,
					value: { valid: true }
				};
				const candidates = [...this.#grants.entries()];
				if (candidates.length === 0) {
					this.#publish(this.#snapshot.host, [], this.#snapshot.prompt, this.#pendingUnlock !== void 0);
					return {
						ok: true,
						value: { valid: true }
					};
				}
				const groups = new Map(this.#snapshot.groups.map((group) => [group.id, group]));
				const validGroupIds = [];
				let allValid = true;
				for (const [groupId, proof] of candidates) {
					if (!this.#isCurrentRefresh(generation)) return {
						ok: true,
						value: { valid: allValid }
					};
					const group = groups.get(groupId);
					if (group === void 0 || group.credentialVersion !== proof.credentialVersion) {
						if (sameProof(this.#grants.get(groupId), proof)) this.#grants.delete(groupId);
						allValid = false;
						continue;
					}
					const response = await this.#call({
						action: "grants-validate",
						clientInstanceId: this.clientInstanceId,
						grants: [proof]
					}, signal);
					if (!this.#isCurrentRefresh(generation)) return response;
					if (!response.ok) {
						this.#markOffline();
						return response;
					}
					if (!response.value.valid) {
						if (sameProof(this.#grants.get(groupId), proof)) this.#grants.delete(groupId);
						allValid = false;
						continue;
					}
					if (sameProof(this.#grants.get(groupId), proof)) validGroupIds.push(groupId);
				}
				if (!this.#isCurrentRefresh(generation)) return {
					ok: true,
					value: { valid: allValid }
				};
				this.#publish("ready", validGroupIds, this.#snapshot.prompt, this.#pendingUnlock !== void 0);
				return {
					ok: true,
					value: { valid: allValid }
				};
			}
			async touchActivity(signal) {
				const proofs = this.#proofs();
				if (proofs.length === 0) return {
					ok: true,
					value: {
						valid: true,
						touched: false
					}
				};
				const response = await this.#call({
					action: "activity-touch",
					clientInstanceId: this.clientInstanceId,
					grants: proofs
				}, signal);
				if (!response.ok) {
					if (isUnavailable(response)) this.#markOffline();
					return response;
				}
				if (!response.value.valid) this.#grants.clear();
				this.#publish("ready", response.value.valid ? this.#validLocalGroupIds() : []);
				return response;
			}
			async unlock(groupId, password, signal) {
				const generation = this.#unlockGeneration;
				const response = await this.#call({
					action: "unlock",
					clientInstanceId: this.clientInstanceId,
					groupId,
					password
				}, signal);
				if (!response.ok) {
					if (isUnavailable(response)) this.#markOffline();
					return response;
				}
				if (generation !== this.#unlockGeneration) return response;
				const group = this.#snapshot.groups.find((candidate) => candidate.id === groupId);
				const proof = response.value.grant;
				if (group === void 0 || proof.groupId !== groupId || proof.credentialVersion !== group.credentialVersion) return this.#invalidResponse();
				this.#grants.set(groupId, Object.freeze({ ...proof }));
				this.#grantExpiries.set(groupId, response.value.expiresAt);
				this.#publish("ready", this.#validLocalGroupIds());
				return response;
			}
			async lockGroup(groupId, signal) {
				this.#invalidateUnlocks();
				this.#grants.delete(groupId);
				this.#grantExpiries.delete(groupId);
				if (this.#pendingUnlock?.groupId === groupId) this.#finishUnlock(false);
				this.#publish(this.#snapshot.host, this.#validLocalGroupIds());
				const response = await this.#call({
					action: "lock-group",
					clientInstanceId: this.clientInstanceId,
					groupId
				}, signal);
				if (!response.ok && isUnavailable(response)) this.#markOffline();
				return response;
			}
			async lockAll(signal) {
				this.#invalidateUnlocks();
				this.#grants.clear();
				this.#grantExpiries.clear();
				if (this.#pendingUnlock !== void 0) this.#finishUnlock(false);
				this.#publish(this.#snapshot.host, []);
				const response = await this.#call({
					action: "lock-all",
					clientInstanceId: this.clientInstanceId
				}, signal);
				if (!response.ok && isUnavailable(response)) this.#markOffline();
				return response;
			}
			async createGroup(input, signal) {
				const intent = await this.#api.createGroupIntent(this.clientInstanceId, signal);
				if (!intent.ok) {
					if (isUnavailable(intent)) this.#markOffline();
					return intent;
				}
				const response = await this.#call({
					action: "group-create",
					clientInstanceId: this.clientInstanceId,
					expectedRevision: this.#snapshot.revision,
					grants: this.#proofs(),
					input,
					intent: intent.value.intent
				}, signal);
				if (!response.ok) {
					if (isUnavailable(response)) this.#markOffline();
					return response;
				}
				this.#grants.clear();
				this.#reconcileCredentialSnapshot(response.value.snapshot);
				return response;
			}
			async changePassword(input, signal) {
				const response = await this.#call({
					action: "group-change-password",
					clientInstanceId: this.clientInstanceId,
					expectedRevision: this.#snapshot.revision,
					input
				}, signal);
				if (!response.ok) {
					if (isUnavailable(response)) this.#markOffline();
					return response;
				}
				this.#grants.delete(input.groupId);
				this.#reconcileCredentialSnapshot(response.value.snapshot);
				return response;
			}
			async recoverGroup(input, signal) {
				const response = await this.#call({
					action: "group-recover",
					clientInstanceId: this.clientInstanceId,
					expectedRevision: this.#snapshot.revision,
					input
				}, signal);
				if (!response.ok) {
					if (isUnavailable(response)) this.#markOffline();
					return response;
				}
				this.#grants.delete(input.groupId);
				this.#reconcileCredentialSnapshot(response.value.snapshot);
				return response;
			}
			async updateBindings(input, signal) {
				const response = await this.#call({
					action: "bindings-update",
					clientInstanceId: this.clientInstanceId,
					expectedRevision: this.#snapshot.revision,
					grants: this.#proofs(),
					input
				}, signal);
				if (!response.ok) {
					if (isUnavailable(response)) this.#markOffline();
					return response;
				}
				this.#grants.clear();
				if (!this.#acceptSnapshot(response.value, [])) return this.#invalidResponse();
				return response;
			}
			async #call(request, signal) {
				try {
					const result = await this.#api.call(request, signal);
					if (result === null || typeof result !== "object" || typeof result.ok !== "boolean") return failed("invalid-response", "Vault response refused");
					if (!result.ok) return safeFailure(result.error);
					if (!Object.hasOwn(result, "value")) return failed("invalid-response", "Vault response refused");
					return result;
				} catch {
					return signal?.aborted ? failed("request-aborted", "Vault request aborted") : failed("host-unavailable", "Vault host unavailable");
				}
			}
			#proofs() {
				return this.#validLocalGroupIds().map((groupId) => ({ ...this.#grants.get(groupId) }));
			}
			#isCurrentRefresh(generation) {
				return generation === void 0 || generation === this.#refreshGeneration;
			}
			#validLocalGroupIds(snapshot = this.#snapshot) {
				const groups = new Map(snapshot.groups.map((group) => [group.id, group.credentialVersion]));
				const valid = [];
				const now = Date.now();
				for (const [groupId, proof] of this.#grants) {
					const expiresAt = this.#grantExpiries.get(groupId);
					if (expiresAt === void 0 || expiresAt !== 0 && now >= expiresAt || groups.get(groupId) !== proof.credentialVersion) {
						this.#grants.delete(groupId);
						this.#grantExpiries.delete(groupId);
						continue;
					}
					valid.push(groupId);
				}
				return valid;
			}
			#reconcileCredentialSnapshot(snapshot) {
				if (snapshot.revision < this.#snapshot.revision) {
					this.#publish(this.#snapshot.host, this.#validLocalGroupIds());
					return;
				}
				if (!this.#acceptSnapshot(snapshot, this.#validLocalGroupIds(snapshot))) this.#markOffline();
			}
			#acceptSnapshot(snapshot, unlockedGroupIds, prompt = this.#snapshot.prompt) {
				try {
					if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < this.#snapshot.revision) return false;
					this.#snapshot = immutableSnapshot("ready", snapshot.revision, snapshot.groups, snapshot.bindings, snapshot.policy, unlockedGroupIds, prompt);
					this.#notify();
					return true;
				} catch {
					return false;
				}
			}
			#publish(host, unlockedGroupIds, prompt = this.#snapshot.prompt, preservePending = false) {
				const ids = [...unlockedGroupIds];
				if (!preservePending && this.#pendingUnlock !== void 0 && (host !== "ready" || !ids.includes(this.#pendingUnlock.groupId))) {
					this.#finishUnlock(false);
					prompt = null;
				}
				this.#snapshot = immutableSnapshot(host, this.#snapshot.revision, this.#snapshot.groups, this.#snapshot.bindings, this.#snapshot.policy, ids, prompt);
				this.#notify();
			}
			#markOffline() {
				if (this.#pendingUnlock !== void 0) this.#finishUnlock(false);
				this.#publish("offline", []);
			}
			#finishUnlock(allow) {
				const pending = this.#pendingUnlock;
				if (pending === void 0) return;
				this.#pendingUnlock = void 0;
				this.#snapshot = immutableSnapshot(this.#snapshot.host, this.#snapshot.revision, this.#snapshot.groups, this.#snapshot.bindings, this.#snapshot.policy, this.#snapshot.unlockedGroupIds, null);
				this.#notify();
				pending.resolve(allow);
			}
			#invalidateUnlocks() {
				this.#unlockGeneration += 1;
			}
			#syncSnapshotUnlockState() {
				const unlockedGroupIds = this.#validLocalGroupIds();
				const currentGroupIds = [...this.#snapshot.unlockedGroupIds];
				if (currentGroupIds.length === unlockedGroupIds.length && currentGroupIds.every((groupId, index) => groupId === unlockedGroupIds[index])) return;
				this.#snapshot = immutableSnapshot(this.#snapshot.host, this.#snapshot.revision, this.#snapshot.groups, this.#snapshot.bindings, this.#snapshot.policy, unlockedGroupIds, this.#snapshot.prompt);
				this.#notify();
			}
			#invalidResponse() {
				this.#markOffline();
				return failed("invalid-response", "Vault response refused");
			}
			#notify() {
				for (const listener of [...this.#listeners]) try {
					listener();
				} catch {}
			}
		};
		function createVaultClientStore(api = createVaultApiClient()) {
			return new VaultClientStoreImplementation(api);
		}
		//#endregion
		//#region src/client/i18n/errors.ts
		function vaultOperationError(code, fallback = "操作失败，请稍后重试") {
			switch (code) {
				case "busy": return "保险箱验证繁忙，请稍后重试。";
				case "state-lock-busy": return "保险箱状态正在使用，请稍后重试。";
				case "state-lock-recovery-required": return "保险箱状态锁需要管理员检查并恢复。请勿直接删除状态文件。";
				default: return fallback;
			}
		}
		//#endregion
		//#region src/client/unlock/controller.ts
		let activeStore;
		function createVaultUnlockController(store) {
			return {
				attach() {
					activeStore = store;
				},
				detach() {
					if (activeStore === store) activeStore = void 0;
				},
				getStore() {
					return activeStore;
				}
			};
		}
		function useVaultStore(explicit) {
			return explicit ?? activeStore;
		}
		function useVaultSnapshot(store) {
			return (0, react.useSyncExternalStore)((listener) => typeof store?.subscribe === "function" ? store.subscribe(listener) : () => void 0, () => store?.getSnapshot(), () => store?.getSnapshot());
		}
		function sessionInherited(snapshot, sessionId, workspaceId) {
			if (snapshot.bindings.find((binding) => binding.targetType === "session" && binding.targetId === sessionId && binding.mode === "direct") !== void 0) return false;
			if (snapshot.bindings.some((binding) => binding.targetType === "session" && binding.targetId === sessionId && binding.mode === "inherit")) return true;
			return workspaceId !== void 0;
		}
		function resolveRowLockState(store, kind, workspaceId, sessionId) {
			if (store === void 0 || kind === void 0) return {
				locked: false,
				inherited: false
			};
			const snapshot = store.getSnapshot();
			const target = kind === "workspace" ? workspaceId === void 0 ? void 0 : {
				type: "workspace",
				id: workspaceId
			} : sessionId === void 0 ? void 0 : {
				type: "session",
				id: sessionId,
				...workspaceId === void 0 ? {} : { workspaceId }
			};
			if (target === void 0) return {
				locked: false,
				inherited: false
			};
			const resolution = resolveVaultTarget(snapshot, target);
			if (resolution.kind !== "protected" || snapshot.host !== "ready" || store.hasUnlockedGroup(resolution.groupId)) return {
				locked: false,
				inherited: false,
				...resolution.kind === "protected" ? { groupId: resolution.groupId } : {}
			};
			return {
				locked: true,
				inherited: kind === "session" && sessionId !== void 0 ? sessionInherited(snapshot, sessionId, workspaceId) : false,
				groupId: resolution.groupId
			};
		}
		function resolvePromptSnapshot(snapshot) {
			if (snapshot?.prompt === null || snapshot?.prompt === void 0) return null;
			const resolution = resolveVaultTarget(snapshot, snapshot.prompt.target);
			return {
				snapshot,
				prompt: snapshot.prompt,
				resolution
			};
		}
		function unlockMessage(code, retryAt) {
			if (code === "invalid-credentials") return "密码不正确，请重试";
			if (code === "cooldown") {
				if (retryAt === void 0) return "尝试过于频繁，请稍后重试";
				return `尝试过于频繁，请在 ${Math.max(1, Math.ceil((retryAt - Date.now()) / 1e3))} 秒后重试`;
			}
			if (code === "host-unavailable" || code === "invalid-response" || code === "request-aborted") return "保险箱暂时不可用，请稍后重试";
			return vaultOperationError(code, "解锁失败，请重试");
		}
		//#endregion
		//#region src/client/components/LockIcon.tsx
		function LockIcon({ className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				"aria-hidden": "true",
				className,
				viewBox: "0 0 16 16",
				fill: "none",
				focusable: "false",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M5 7V5.75a3 3 0 0 1 6 0V7",
						stroke: "currentColor",
						strokeWidth: "1.5",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "3.75",
						y: "6.75",
						width: "8.5",
						height: "6.5",
						rx: "1.5",
						stroke: "currentColor",
						strokeWidth: "1.5"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M8 9.25v1.5",
						stroke: "currentColor",
						strokeWidth: "1.5",
						strokeLinecap: "round"
					})
				]
			});
		}
		//#endregion
		//#region src/client/unlock/UnlockDialog.tsx
		function usePrompt(store) {
			const snapshot = useVaultSnapshot(store);
			return (0, react.useMemo)(() => resolvePromptSnapshot(snapshot), [snapshot]);
		}
		function UnlockDialog({ store: storeProp }) {
			const store = useVaultStore(storeProp);
			const promptState = usePrompt(store);
			const passwordId = (0, react.useId)();
			const descriptionId = (0, react.useId)();
			const errorId = (0, react.useId)();
			const inputRef = (0, react.useRef)(null);
			const [password, setPassword] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)(null);
			const [pending, setPending] = (0, react.useState)(false);
			const groupId = promptState?.prompt.groupId;
			const group = (0, react.useMemo)(() => {
				if (promptState === null || groupId === void 0) return void 0;
				return promptState.snapshot.groups.find((candidate) => candidate.id === groupId);
			}, [promptState, groupId]);
			(0, react.useEffect)(() => {
				if (promptState === null) {
					setPassword("");
					setError(null);
					setPending(false);
					return;
				}
				inputRef.current?.focus();
			}, [promptState]);
			(0, react.useEffect)(() => () => {
				setPassword("");
				setError(null);
			}, []);
			if (store === void 0 || promptState === null || groupId === void 0) return null;
			const close = () => {
				setPassword("");
				setError(null);
				setPending(false);
				store.cancelUnlock(groupId);
			};
			const submit = (event) => {
				event.preventDefault();
				if (password.length === 0 || pending) return;
				setPending(true);
				setError(null);
				store.unlock(groupId, password).then((result) => {
					if (result.ok) {
						setPassword("");
						setError(null);
						store.settleUnlock(groupId);
						return;
					}
					setError(unlockMessage(result.error.code, result.error.retryAt));
				}).catch(() => {
					setError(unlockMessage("host-unavailable"));
				}).finally(() => {
					setPending(false);
				});
			};
			const dialog = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-vault-dialog-backdrop",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					className: "dsh-vault-dialog",
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": descriptionId,
					"aria-describedby": error === null ? descriptionId : `${descriptionId} ${errorId}`,
					onSubmit: submit,
					onKeyDown: (event) => {
						if (event.key === "Escape") close();
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LockIcon, { className: "dsh-vault-dialog-icon" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							id: descriptionId,
							className: "dsh-vault-dialog-title",
							children: "已上锁"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-vault-dialog-copy",
							children: "需要解锁才能查看内容"
						}),
						group?.recoveryConfigured === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-vault-dialog-support",
							children: "受保护"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "dsh-vault-field",
							htmlFor: passwordId,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "密码" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								ref: inputRef,
								id: passwordId,
								type: "password",
								autoComplete: "current-password",
								value: password,
								onChange: (event) => {
									setPassword(event.currentTarget.value);
									if (error !== null) setError(null);
								}
							})]
						}),
						error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-vault-dialog-error",
							id: errorId,
							role: "alert",
							children: error
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-vault-dialog-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-vault-button",
								onClick: close,
								children: "取消"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								className: "dsh-vault-button dsh-vault-button-primary",
								disabled: password.length === 0 || pending,
								children: "解锁"
							})]
						})
					]
				})
			});
			return typeof document === "undefined" ? dialog : (0, react_dom.createPortal)(dialog, document.body);
		}
		//#endregion
		//#region src/client/dialogs/recovery-delivery.ts
		function createRecoveryDelivery() {
			let queue = [];
			let active = true;
			const listeners = /* @__PURE__ */ new Set();
			const notify = () => {
				for (const listener of listeners) listener();
			};
			return {
				getSnapshot: () => queue[0] ?? null,
				subscribe(listener) {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				deliver(key) {
					if (!active) return;
					queue = [...queue, { key }];
					notify();
				},
				acknowledge(delivery) {
					if (queue[0] !== delivery) return;
					queue = queue.slice(1);
					notify();
				},
				dispose() {
					active = false;
					queue = [];
					notify();
					listeners.clear();
				}
			};
		}
		const deliveries = /* @__PURE__ */ new WeakMap();
		function recoveryDeliveryFor(store) {
			let delivery = deliveries.get(store);
			if (delivery === void 0) {
				delivery = createRecoveryDelivery();
				deliveries.set(store, delivery);
			}
			return delivery;
		}
		//#endregion
		//#region src/client/dialogs/VaultOverlays.tsx
		function RecoveryOverlay({ store }) {
			const delivery = recoveryDeliveryFor(store);
			const pending = (0, react.useSyncExternalStore)(delivery.subscribe, delivery.getSnapshot, delivery.getSnapshot);
			const confirm = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (pending === null) return;
				const previous = document.activeElement;
				confirm.current?.focus();
				const warn = (event) => {
					event.preventDefault();
					event.returnValue = "";
				};
				window.addEventListener("beforeunload", warn);
				return () => {
					window.removeEventListener("beforeunload", warn);
					if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
				};
			}, [pending]);
			if (pending === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UnlockDialog, { store });
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-vault-dialog-backdrop",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: "dsh-vault-dialog",
					role: "dialog",
					"aria-modal": "true",
					"aria-label": "请保存恢复密钥",
					onKeyDown: (event) => {
						if (event.key === "Escape" || event.key === "Tab") {
							event.preventDefault();
							event.stopPropagation();
							confirm.current?.focus();
						}
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "请保存恢复密钥" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "保护已生效。请将恢复密钥保存在安全位置，确认后不再显示。" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("output", {
							className: "dsh-vault-recovery-key",
							children: pending.key
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "刷新或关闭页面会丢失本次展示，服务器无法再次读取旧密钥。若未保存但仍记得密码，可在修改密码时轮换恢复密钥。" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							ref: confirm,
							type: "button",
							className: "dsh-vault-button dsh-vault-button-primary",
							onClick: () => delivery.acknowledge(pending),
							children: "我已保存恢复密钥"
						})
					]
				})
			}), document.body);
		}
		function VaultOverlays({ store: explicit }) {
			const store = useVaultStore(explicit);
			return store === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RecoveryOverlay, { store });
		}
		//#endregion
		//#region src/shared/password-policy.ts
		function passwordPolicyError(password, policy) {
			if (Array.from(password).length < policy.minLength) return `密码至少需要 ${policy.minLength} 个字符`;
			if (policy.requireUppercase && !/[A-Z]/u.test(password)) return "密码必须包含大写字母";
			if (policy.requireLowercase && !/[a-z]/u.test(password)) return "密码必须包含小写字母";
			if (policy.requireNumber && !/[0-9]/u.test(password)) return "密码必须包含数字";
			if (policy.requireSymbol && !/[^A-Za-z0-9]/u.test(password)) return "密码必须包含符号";
		}
		//#endregion
		//#region src/client/rows/VaultRowAction.tsx
		const inheritedWorkspaceProtectionError = {
			title: "此对话已继承工作区保护",
			detail: "无需再次设置密码。请在工作区级别管理保护。",
			blocksSubmit: true
		};
		function VaultRowAction({ locked: lockedProp, kind: kindProp, workspaceId, sessionId, store: storeProp, onUnlock, onLock }) {
			const [dialogOpen, setDialogOpen] = (0, react.useState)(null);
			const [password, setPassword] = (0, react.useState)("");
			const [confirmation, setConfirmation] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)(null);
			const [pending, setPending] = (0, react.useState)(false);
			const store = useVaultStore(storeProp);
			const liveSnapshot = useVaultSnapshot(store);
			const kind = kindProp ?? (sessionId !== void 0 ? "session" : workspaceId !== void 0 ? "workspace" : void 0);
			const resolvedWorkspaceId = kind === "session" && sessionId !== void 0 ? workspaceId ?? workspaceIdForSession(sessionId) : workspaceId;
			if (kind === "session" && sessionId !== void 0) rememberWorkspaceIdForSession(sessionId, resolvedWorkspaceId);
			const state = resolveRowLockState(store, kind, resolvedWorkspaceId, sessionId);
			const locked = lockedProp ?? state.locked;
			const snapshot = liveSnapshot;
			const passwordPolicy = snapshot?.policy.passwordPolicy ?? {
				minLength: 8,
				requireUppercase: false,
				requireLowercase: false,
				requireNumber: false,
				requireSymbol: false
			};
			const target = kind === "workspace" && workspaceId !== void 0 ? {
				type: "workspace",
				id: workspaceId
			} : kind === "session" && sessionId !== void 0 ? {
				type: "session",
				id: sessionId,
				...resolvedWorkspaceId === void 0 ? {} : { workspaceId: resolvedWorkspaceId }
			} : void 0;
			const binding = snapshot?.bindings.find((candidate) => candidate.targetType === kind && candidate.targetId === target?.id);
			const inheritsWorkspaceProtection = kind === "session" && resolvedWorkspaceId !== void 0 && snapshot?.bindings.some((candidate) => candidate.targetType === "workspace" && candidate.targetId === resolvedWorkspaceId && candidate.mode === "direct") === true;
			const workspaceContextIsUnavailable = kind === "session" && resolvedWorkspaceId === void 0 && snapshot?.bindings.some((candidate) => candidate.targetType === "workspace" && candidate.mode === "direct") === true;
			const collapseWorkspace = () => {
				if (kind !== "workspace" || typeof document === "undefined") return;
				const row = document.activeElement?.closest("[role=\"treeitem\"]");
				if (row?.getAttribute("aria-expanded") === "true") row.click();
			};
			if (locked) return null;
			if (!locked && target === void 0 && onLock === void 0) return null;
			const groupNameBase = target?.type === "workspace" ? "工作区保护" : "对话保护";
			const groupName = (() => {
				const names = new Set(snapshot?.groups.map((group) => group.name) ?? []);
				if (!names.has(groupNameBase)) return groupNameBase;
				for (let suffix = 2; suffix < 1e3; suffix += 1) {
					const candidate = `${groupNameBase} (${suffix})`.slice(0, 128);
					if (!names.has(candidate)) return candidate;
				}
				return `${groupNameBase.slice(0, 120)} (new)`;
			})();
			const save = () => {
				if (store === void 0 || target === void 0 || pending) return;
				const passwordError = passwordPolicyError(password, passwordPolicy);
				if (passwordError !== void 0) {
					setError({ title: passwordError });
					return;
				}
				if (password !== confirmation) {
					setError({ title: "两次密码不一致" });
					return;
				}
				setPending(true);
				setError(null);
				const now = (/* @__PURE__ */ new Date()).toISOString();
				const bindingInput = {
					targetType: target.type,
					targetId: target.id,
					mode: "direct",
					...target.type === "session" && target.workspaceId !== void 0 ? { workspaceId: target.workspaceId } : {},
					createdAt: now,
					updatedAt: now
				};
				const delivery = recoveryDeliveryFor(store);
				store.createGroup({
					name: groupName,
					password,
					bindings: [bindingInput]
				}).then((result) => {
					if (result.ok) {
						delivery.deliver(result.value.recoveryKey);
						setDialogOpen(null);
						setPassword("");
						setConfirmation("");
					} else setError(result.error.code === "invalid-binding" ? inheritedWorkspaceProtectionError : result.error.code === "duplicate-name" ? { title: "该对话已有同名保护记录" } : result.error.code === "weak-password" ? { title: "密码不符合当前策略" } : { title: vaultOperationError(result.error.code, "创建失败，请重试") });
				}).catch(() => setError({
					title: "保险箱暂时不可用",
					detail: "请稍后重试。"
				})).finally(() => setPending(false));
			};
			const toggle = (event) => {
				event.stopPropagation();
				if (locked) {
					if (onUnlock !== void 0) {
						onUnlock();
						return;
					}
					if (store !== void 0 && state.groupId !== void 0 && target !== void 0) store.requestUnlock(state.groupId, target);
					return;
				}
				if (onLock !== void 0) {
					onLock();
					collapseWorkspace();
					return;
				}
				if (binding?.passwordGroupId !== void 0 && store !== void 0) {
					store.lockGroup(binding.passwordGroupId).then((result) => {
						if (result.ok) collapseWorkspace();
					});
					return;
				}
				if (inheritsWorkspaceProtection) {
					setDialogOpen("inherited-workspace");
					setError(null);
					return;
				}
				if (workspaceContextIsUnavailable) {
					setDialogOpen("unresolved-workspace");
					setError(null);
					return;
				}
				setDialogOpen("password");
				setError(null);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "dsh-vault-row-action",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsh-vault-row-action-button",
					"aria-label": locked ? "解锁" : "上锁",
					onClick: toggle,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LockIcon, { className: "dsh-vault-lock-icon" })
				}), dialogOpen !== null && typeof document !== "undefined" ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-vault-dialog-backdrop",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: "dsh-vault-dialog dsh-vault-quick-lock-dialog",
						role: "dialog",
						"aria-label": dialogOpen === "password" ? "设置密码并上锁" : "不能单独上锁",
						"aria-modal": "true",
						children: dialogOpen === "inherited-workspace" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "不能单独上锁" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "此对话已继承工作区保护。" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-vault-quick-lock-error",
								role: "status",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "无需再次设置密码" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "请在工作区级别管理保护。" })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-vault-dialog-actions",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-vault-button dsh-vault-button-primary",
									onClick: () => setDialogOpen(null),
									children: "知道了"
								})
							})
						] }) : dialogOpen === "unresolved-workspace" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "不能单独上锁" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "无法确认此对话的工作区归属。" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-vault-quick-lock-error",
								role: "status",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "为避免重复创建保护" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "请在工作区级别管理保护。" })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-vault-dialog-actions",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-vault-button dsh-vault-button-primary",
									onClick: () => setDialogOpen(null),
									children: "知道了"
								})
							})
						] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "设置密码并上锁" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "保存后将立即锁定当前对话。" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-vault-field",
								htmlFor: "dsh-vault-quick-password",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "密码" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "dsh-vault-quick-password",
									type: "password",
									minLength: passwordPolicy.minLength,
									value: password,
									onChange: (event) => setPassword(event.currentTarget.value)
								})]
							}),
							password.length > 0 && passwordPolicyError(password, passwordPolicy) !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsh-vault-settings-warning",
								role: "note",
								children: passwordPolicyError(password, passwordPolicy)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-vault-field",
								htmlFor: "dsh-vault-quick-confirm",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "确认密码" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "dsh-vault-quick-confirm",
									type: "password",
									value: confirmation,
									onChange: (event) => {
										setConfirmation(event.currentTarget.value);
										if (error?.title === "两次密码不一致") setError(null);
									}
								})]
							}),
							error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-vault-quick-lock-error",
								role: "alert",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: error.title }), error.detail !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: error.detail })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-vault-dialog-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-vault-button",
									onClick: () => setDialogOpen(null),
									children: "取消"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-vault-button dsh-vault-button-primary",
									disabled: pending || error?.blocksSubmit === true || password.length === 0 || confirmation.length === 0,
									onClick: save,
									children: "保存并上锁"
								})]
							})
						] })
					})
				}), document.body) : null]
			});
		}
		//#endregion
		//#region src/client/settings/GroupCredentials.tsx
		function GroupCredentials({ mode, groupId, groupName, store, onClose }) {
			const [credential, setCredential] = (0, react.useState)("");
			const [password, setPassword] = (0, react.useState)("");
			const [confirmation, setConfirmation] = (0, react.useState)("");
			const [rotateRecovery, setRotateRecovery] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [pending, setPending] = (0, react.useState)(false);
			const passwordPolicy = typeof store.getSnapshot === "function" ? store.getSnapshot().policy.passwordPolicy : {
				minLength: 8,
				requireUppercase: false,
				requireLowercase: false,
				requireNumber: false,
				requireSymbol: false
			};
			const clearSecrets = () => {
				setCredential("");
				setPassword("");
				setConfirmation("");
			};
			const close = () => {
				clearSecrets();
				setError(null);
				onClose?.();
			};
			const submit = (event) => {
				event.preventDefault();
				if (password !== confirmation) {
					setError("两次密码不一致");
					return;
				}
				const passwordError = passwordPolicyError(password, passwordPolicy);
				if (passwordError !== void 0) {
					setError(passwordError);
					return;
				}
				if (credential.length === 0 || password.length === 0 || pending) return;
				const delivery = recoveryDeliveryFor(store);
				setPending(true);
				setError(null);
				(mode === "change" ? store.changePassword({
					groupId,
					currentPassword: credential,
					newPassword: password,
					rotateRecovery
				}) : store.recoverGroup({
					groupId,
					recoveryKey: credential,
					newPassword: password
				})).then((result) => {
					if (!result.ok) {
						setError(result.error.code === "invalid-credentials" ? "凭据无效" : result.error.code === "weak-password" ? "密码不符合当前策略" : vaultOperationError(result.error.code, "操作失败，请刷新后重试"));
						return;
					}
					if (result.value.recoveryKey !== void 0) delivery.deliver(result.value.recoveryKey);
					onClose?.();
				}).catch(() => setError("保险箱暂时不可用，请稍后重试")).finally(() => {
					clearSecrets();
					setPending(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				className: "dsh-vault-settings-panel",
				onSubmit: submit,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", { children: [
						mode === "change" ? "修改密码" : "恢复密码组",
						"：",
						groupName
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "dsh-vault-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: mode === "change" ? "当前密码" : "恢复密钥" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "password",
							autoComplete: "off",
							"aria-label": mode === "change" ? "当前密码" : "恢复密钥",
							value: credential,
							onChange: (event) => setCredential(event.currentTarget.value)
						})]
					}),
					password.length > 0 && passwordPolicyError(password, passwordPolicy) !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-vault-settings-warning",
						role: "note",
						children: passwordPolicyError(password, passwordPolicy)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "dsh-vault-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "新密码" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "password",
							autoComplete: "new-password",
							"aria-label": "新密码",
							value: password,
							onChange: (event) => setPassword(event.currentTarget.value)
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "dsh-vault-field",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "确认新密码" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "password",
							autoComplete: "new-password",
							"aria-label": "确认新密码",
							value: confirmation,
							onChange: (event) => setConfirmation(event.currentTarget.value)
						})]
					}),
					mode === "change" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "dsh-vault-checkbox",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: rotateRecovery,
							onChange: (event) => setRotateRecovery(event.currentTarget.checked)
						}), "同时轮换恢复密钥"]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-vault-settings-warning",
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-vault-dialog-actions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-vault-button",
							onClick: close,
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							className: "dsh-vault-button dsh-vault-button-primary",
							disabled: pending || credential.length === 0 || password.length === 0,
							children: mode === "change" ? "保存新密码" : "恢复密码组"
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/settings/GroupsPanel.tsx
		function GroupsPanel({ store }) {
			const snapshot = useVaultSnapshot(store) ?? store.getSnapshot();
			const [credentialAction, setCredentialAction] = (0, react.useState)(null);
			const [deleteAction, setDeleteAction] = (0, react.useState)(null);
			const groupName = (id) => {
				const index = snapshot.groups.findIndex((group) => group.id === id);
				const group = snapshot.groups[index];
				return group !== void 0 && snapshot.host === "ready" && snapshot.unlockedGroupIds.has(id) ? group.name : "受保护密码组 " + (index + 1);
			};
			const [error, setError] = (0, react.useState)(null);
			if (credentialAction !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupCredentials, {
				mode: credentialAction.mode,
				groupId: credentialAction.groupId,
				groupName: groupName(credentialAction.groupId),
				store,
				onClose: () => setCredentialAction(null)
			});
			if (deleteAction !== null) {
				const source = snapshot.groups.find((group) => group.id === deleteAction.groupId);
				const targets = snapshot.groups.filter((group) => group.id !== deleteAction.groupId);
				const target = {
					type: "workspace",
					id: "vault-group-management"
				};
				const execute = async (mutation, groupIds) => {
					setError(null);
					for (const groupId of groupIds) if (!store.hasUnlockedGroup(groupId) && !await store.requestUnlock(groupId, target)) {
						setError("请先解锁对应密码组");
						return;
					}
					const result = await store.updateBindings(mutation);
					if (result.ok) {
						setDeleteAction(null);
						return;
					}
					if (result.error.code === "revision-conflict") {
						await store.refresh();
						setError("配置已变化，已刷新，请重试");
						return;
					}
					setError(vaultOperationError(result.error.code, "删除失败，请重试"));
				};
				if (source === void 0) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: "dsh-vault-settings-panel",
					"aria-labelledby": "dsh-vault-delete-title",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
							id: "dsh-vault-delete-title",
							children: ["删除密码组：", groupName(deleteAction.groupId)]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "必须迁移成员或解除全部保护，不能直接删除。" }),
						targets.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "dsh-vault-button",
							onClick: () => {
								execute({
									kind: "delete-group",
									groupId: source.id,
									moveToGroupId: group.id
								}, [source.id, group.id]);
							},
							children: ["迁移到 ", groupName(group.id)]
						}, group.id)),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-vault-button",
							onClick: () => {
								execute({
									kind: "delete-group",
									groupId: source.id,
									removeProtection: true
								}, [source.id]);
							},
							children: "解除全部保护并删除"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-vault-button",
							onClick: () => setDeleteAction(null),
							children: "取消"
						}),
						error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-vault-settings-warning",
							role: "alert",
							children: error
						})
					]
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				className: "dsh-vault-settings-panel",
				"aria-label": "密码组",
				children: snapshot.groups.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "尚未创建密码组" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: "dsh-vault-group-list",
					children: snapshot.groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: groupName(group.id) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [group.memberCount, " 个保护对象"] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-vault-dialog-actions",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-vault-button",
									"aria-label": `锁定 ${groupName(group.id)}`,
									onClick: () => {
										store.lockGroup(group.id);
									},
									children: "锁定"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-vault-button",
									"aria-label": `修改密码 ${groupName(group.id)}`,
									onClick: () => setCredentialAction({
										mode: "change",
										groupId: group.id
									}),
									children: "修改密码"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-vault-button",
									"aria-label": `恢复 ${groupName(group.id)}`,
									onClick: () => setCredentialAction({
										mode: "recover",
										groupId: group.id
									}),
									children: "恢复"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-vault-button",
									"aria-label": "删除 " + groupName(group.id),
									onClick: () => setDeleteAction({ groupId: group.id }),
									children: "删除"
								})
							]
						})
					] }, group.id))
				})
			});
		}
		//#endregion
		//#region src/client/settings/PolicyPanel.tsx
		function PolicyPanel({ policy, onChange, onLockAll, pending = false, saveError = null }) {
			const [value, setValue] = (0, react.useState)(policy);
			const [numbers, setNumbers] = (0, react.useState)(() => numericDraft(policy));
			const [error, setError] = (0, react.useState)(null);
			const dirty = (0, react.useRef)(false);
			const saving = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!dirty.current && !saving.current) {
					setValue(policy);
					setNumbers(numericDraft(policy));
				}
			}, [policy]);
			const update = (next) => {
				dirty.current = true;
				setError(null);
				setValue(next);
			};
			const updateNumber = (field, next) => {
				dirty.current = true;
				setError(null);
				setNumbers((current) => ({
					...current,
					[field]: next
				}));
			};
			const save = async () => {
				if (pending || saving.current || onChange === void 0) return;
				const minLength = Number(numbers.minLength);
				const maxAttempts = Number(numbers.maxAttempts);
				const cooldownSeconds = Number(numbers.cooldownSeconds);
				if (numbers.minLength.trim() === "" || !Number.isSafeInteger(minLength) || minLength < 4 || minLength > 128) {
					setError("密码最小长度必须为 4–128 的整数");
					return;
				}
				if (numbers.maxAttempts.trim() === "" || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || numbers.cooldownSeconds.trim() === "" || !Number.isSafeInteger(cooldownSeconds) || cooldownSeconds < 1) {
					setError("最大尝试次数和暂停时间必须为大于 0 的整数");
					return;
				}
				const next = {
					...value,
					passwordPolicy: {
						...value.passwordPolicy,
						minLength
					},
					failedAttemptProtection: {
						...value.failedAttemptProtection,
						maxAttempts,
						cooldownSeconds
					}
				};
				saving.current = true;
				setError(null);
				try {
					await onChange(next);
					dirty.current = false;
					setValue(next);
					setNumbers(numericDraft(next));
				} catch {} finally {
					saving.current = false;
				}
			};
			const protection = value.failedAttemptProtection;
			const passwordPolicy = value.passwordPolicy;
			const updatePasswordPolicy = (next) => update({
				...value,
				passwordPolicy: next
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dsh-vault-settings-panel",
				"aria-label": "锁定策略",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
						disabled: pending,
						style: {
							border: 0,
							padding: 0,
							margin: 0,
							minWidth: 0
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-vault-field",
								htmlFor: "dsh-vault-auto-lock",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "自动锁定" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									id: "dsh-vault-auto-lock",
									value: value.autoLockMinutes,
									onChange: (event) => update({
										...value,
										autoLockMinutes: Number(event.currentTarget.value)
									}),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "0",
											children: "不自动锁定"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "15",
											children: "15 分钟"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "30",
											children: "30 分钟"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "60",
											children: "60 分钟"
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-vault-checkbox",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: value.lockOnSystemSleep,
									onChange: (event) => update({
										...value,
										lockOnSystemSleep: event.currentTarget.checked
									})
								}), "系统休眠时上锁"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-vault-checkbox",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									"aria-label": "失败尝试保护",
									checked: protection.enabled,
									onChange: (event) => update({
										...value,
										failedAttemptProtection: {
											...protection,
											enabled: event.currentTarget.checked
										}
									})
								}), "失败尝试保护"]
							}),
							protection.enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-vault-policy-fields",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dsh-vault-field",
									htmlFor: "dsh-vault-max-attempts",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "最大尝试次数" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										id: "dsh-vault-max-attempts",
										type: "number",
										min: "1",
										value: numbers.maxAttempts,
										onChange: (event) => updateNumber("maxAttempts", event.currentTarget.value)
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dsh-vault-field",
									htmlFor: "dsh-vault-cooldown",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "暂停时间（秒）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										id: "dsh-vault-cooldown",
										type: "number",
										min: "1",
										value: numbers.cooldownSeconds,
										onChange: (event) => updateNumber("cooldownSeconds", event.currentTarget.value)
									})]
								})]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsh-vault-settings-warning",
								role: "note",
								children: "关闭后不会累计失败次数或进入暂停期"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-vault-field",
								htmlFor: "dsh-vault-password-min-length",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "密码最小长度" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "dsh-vault-password-min-length",
									type: "number",
									min: "4",
									max: "128",
									value: numbers.minLength,
									onChange: (event) => updateNumber("minLength", event.currentTarget.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-vault-checkbox",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									"aria-label": "要求大写字母",
									checked: passwordPolicy.requireUppercase,
									onChange: (event) => updatePasswordPolicy({
										...passwordPolicy,
										requireUppercase: event.currentTarget.checked
									})
								}), "要求大写字母"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-vault-checkbox",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									"aria-label": "要求小写字母",
									checked: passwordPolicy.requireLowercase,
									onChange: (event) => updatePasswordPolicy({
										...passwordPolicy,
										requireLowercase: event.currentTarget.checked
									})
								}), "要求小写字母"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-vault-checkbox",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									"aria-label": "要求数字",
									checked: passwordPolicy.requireNumber,
									onChange: (event) => updatePasswordPolicy({
										...passwordPolicy,
										requireNumber: event.currentTarget.checked
									})
								}), "要求数字"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-vault-checkbox",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									"aria-label": "要求符号",
									checked: passwordPolicy.requireSymbol,
									onChange: (event) => updatePasswordPolicy({
										...passwordPolicy,
										requireSymbol: event.currentTarget.checked
									})
								}), "要求符号"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsh-vault-settings-warning",
								role: "note",
								children: passwordPolicyError("示例密码", passwordPolicy) ?? "当前密码策略已满足最低要求"
							})
						]
					}),
					(error ?? saveError) !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-vault-settings-warning",
						role: "alert",
						children: error ?? saveError
					}),
					pending && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: "保存中，请稍候…"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-vault-button dsh-vault-button-primary",
						disabled: pending || onChange === void 0,
						onClick: () => {
							save();
						},
						children: pending ? "保存中…" : "保存策略"
					}),
					onLockAll !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-vault-settings-heading dsh-vault-settings-heading-actions-only",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-vault-button dsh-vault-button-primary",
							onClick: onLockAll,
							children: "立即全部上锁"
						})
					})
				]
			});
		}
		function numericDraft(policy) {
			return {
				minLength: String(policy.passwordPolicy.minLength),
				maxAttempts: String(policy.failedAttemptProtection.maxAttempts),
				cooldownSeconds: String(policy.failedAttemptProtection.cooldownSeconds)
			};
		}
		//#endregion
		//#region src/client/settings/VaultSettingsCard.tsx
		const policySaves = /* @__PURE__ */ new WeakMap();
		const policyFields = [
			"autoLockMinutes",
			"lockOnSystemSleep",
			"lockedNameVisibility",
			"failedAttemptProtection",
			"passwordPolicy"
		];
		var PolicyConflict = class extends Error {};
		function mergeLeaves(baseline, draft, current) {
			const merged = { ...current };
			for (const field of Object.keys(baseline)) {
				if (Object.is(draft[field], baseline[field])) continue;
				if (!Object.is(current[field], baseline[field]) && !Object.is(current[field], draft[field])) throw new PolicyConflict(`策略字段 ${String(field)} 存在冲突，尚未写入。草稿已保留；请载入最新策略后重新编辑。`);
				merged[field] = draft[field];
			}
			return merged;
		}
		function mergePolicy(baseline, draft, current) {
			const { passwordPolicy: basePassword, failedAttemptProtection: baseAttempts, ...baseScalars } = baseline;
			const { passwordPolicy: draftPassword, failedAttemptProtection: draftAttempts, ...draftScalars } = draft;
			const { passwordPolicy: currentPassword, failedAttemptProtection: currentAttempts, ...currentScalars } = current;
			return {
				...mergeLeaves(baseScalars, draftScalars, currentScalars),
				passwordPolicy: mergeLeaves(basePassword, draftPassword, currentPassword),
				failedAttemptProtection: mergeLeaves(baseAttempts, draftAttempts, currentAttempts)
			};
		}
		function PolicyDraft({ policy, pending, saveError, onSave, onLockAll }) {
			const baseline = (0, react.useRef)(null);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				onChangeCapture: () => {
					baseline.current ??= policy;
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PolicyPanel, {
					policy,
					pending,
					saveError,
					onLockAll,
					...onSave === void 0 ? {} : { onChange: (draft) => onSave(draft, baseline.current ?? policy) }
				})
			});
		}
		function NativeChevron() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dsh-vault-settings-card-chevron",
				"aria-hidden": "true"
			});
		}
		function VaultSettingsCard({ store: storeProp, policyScope }) {
			const store = useVaultStore(storeProp);
			const liveSnapshot = useVaultSnapshot(store);
			const [tab, setTab] = (0, react.useState)("policy");
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [pending, setPending] = (0, react.useState)(false);
			const [saveError, setSaveError] = (0, react.useState)(null);
			const [conflict, setConflict] = (0, react.useState)(false);
			const [draftVersion, setDraftVersion] = (0, react.useState)(0);
			const saving = (0, react.useRef)(false);
			if (store === void 0 || liveSnapshot === void 0) return null;
			const snapshot = liveSnapshot;
			const persistPolicy = async (next, baseline) => {
				if (policyScope === void 0 || saving.current) throw new Error("Policy save unavailable");
				saving.current = true;
				setPending(true);
				setSaveError(null);
				setConflict(false);
				const operation = (policySaves.get(store) ?? Promise.resolve()).catch(() => void 0).then(async () => {
					try {
						if (!(await store.refresh()).ok) throw new Error("Policy refresh failed");
						const current = store.getSnapshot().policy;
						const merged = mergePolicy(baseline, next, current);
						for (const field of policyFields) if (JSON.stringify(merged[field]) !== JSON.stringify(current[field])) await policyScope.set(field, merged[field]);
						if (!(await store.refresh()).ok) throw new Error("Policy verification failed");
					} catch (error) {
						if (error instanceof PolicyConflict) throw error;
						await store.refresh().catch(() => void 0);
						throw new Error("Policy save failed");
					}
				});
				policySaves.set(store, operation);
				try {
					await operation;
					setDraftVersion((value) => value + 1);
				} catch (error) {
					setConflict(error instanceof PolicyConflict);
					setSaveError(error instanceof PolicyConflict ? error.message : "保存未完成，部分设置可能已生效。请检查连接后重试；未保存的草稿已保留。");
					throw new Error("Policy save failed");
				} finally {
					if (policySaves.get(store) === operation) policySaves.delete(store);
					saving.current = false;
					setPending(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: `dsh-vault-settings-card${expanded ? " dsh-vault-settings-card-open" : ""}`,
				"aria-label": "保险箱",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "dsh-vault-settings-card-header",
					disabled: pending,
					"aria-expanded": expanded,
					"aria-label": `${expanded ? "收起设置" : "展开设置"}: 保险箱`,
					onClick: () => setExpanded((value) => !value),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dsh-vault-settings-card-heading",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "保险箱" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "保护会话和工作区访问" })]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NativeChevron, {})]
				}), expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-vault-settings-card-body",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-vault-settings-tabs",
							role: "tablist",
							children: [["policy", "锁定策略"], ["groups", "密码组"]].map(([id, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "tab",
								disabled: pending,
								"aria-selected": tab === id,
								onClick: () => setTab(id),
								children: label
							}, id))
						}),
						tab === "policy" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PolicyDraft, {
							policy: snapshot.policy,
							pending,
							saveError,
							...policyScope === void 0 ? {} : { onSave: persistPolicy },
							onLockAll: () => void store.lockAll()
						}, draftVersion), conflict && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-vault-button",
							disabled: pending,
							onClick: () => {
								setSaveError(null);
								setConflict(false);
								setDraftVersion((value) => value + 1);
							},
							children: "放弃草稿并载入最新策略"
						})] }),
						tab === "groups" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupsPanel, { store })
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/client/activity/clock.ts
		const performanceClock = { now: () => globalThis.performance?.now() ?? Date.now() };
		//#endregion
		//#region src/client/activity/monitor.ts
		const ACTIVITY_EVENTS = [
			"keydown",
			"pointerdown",
			"touchstart",
			"scroll",
			"focus"
		];
		function createActivityMonitor(store, options = {}) {
			const clock = { now: options.now ?? performanceClock.now };
			const intervalMs = options.intervalMs ?? 1e3;
			const touchThrottleMs = options.touchThrottleMs ?? 6e4;
			let timer;
			let started = false;
			let lastTick = 0;
			let lastActivity = 0;
			let lastTouch = Number.NEGATIVE_INFINITY;
			const touch = () => {
				const now = clock.now();
				lastActivity = now;
				if (now - lastTouch < touchThrottleMs) return;
				lastTouch = now;
				store.touchActivity();
			};
			const tick = () => {
				if (!started) return;
				const now = clock.now();
				const drift = now - lastTick;
				lastTick = now;
				if (drift > intervalMs * 2 && store.getSnapshot().policy.lockOnSystemSleep) {
					store.lockAll();
					lastActivity = now;
					return;
				}
				const minutes = store.getSnapshot().policy.autoLockMinutes;
				if (minutes !== 0 && now - lastActivity >= minutes * 6e4) {
					store.lockAll();
					lastActivity = now;
				}
			};
			const onVisibilityChange = () => {
				if (document.visibilityState === "visible") touch();
			};
			return {
				start() {
					if (started) return;
					started = true;
					lastTick = clock.now();
					lastActivity = lastTick;
					for (const event of ACTIVITY_EVENTS) window.addEventListener(event, touch, { passive: true });
					document.addEventListener("visibilitychange", onVisibilityChange);
					timer = globalThis.setInterval(tick, intervalMs);
				},
				stop() {
					if (!started) return;
					started = false;
					for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, touch);
					document.removeEventListener("visibilitychange", onVisibilityChange);
					if (timer !== void 0) globalThis.clearInterval(timer);
					timer = void 0;
				}
			};
		}
		//#endregion
		//#region src/client/index.ts
		const inject = [
			"slots",
			"locale",
			"configForms",
			"sessions",
			"workspaces"
		];
		function apply(ctx) {
			const store = createVaultClientStore(createVaultApiClient());
			const unlock = createVaultUnlockController(store);
			const activity = createActivityMonitor(store);
			const form = ctx.configForms.get("dsh-vault");
			const policyScope = { set: async (field, value) => {
				const { revision } = form.getSnapshot();
				if (!await form.mutate([{
					op: "set",
					path: [field],
					value
				}], revision)) throw new Error("Vault policy update was rejected");
			} };
			unlock.attach();
			activity.start();
			store.refresh();
			ctx.effect(() => {
				const access = createVaultAccessProvider(store);
				const disposeAccess = ctx.sessions.openingAccess.register(async (sessionId) => {
					const workspaceId = ctx.workspaces.list.getSnapshot().items.find((workspace) => workspace.sessionIds.some((id) => String(id) === sessionId))?.workspaceId ?? null;
					const state = access.sessionState(sessionId, workspaceId);
					if (state.kind === "blocked") throw new Error(state.reason);
				});
				const disposeUnlock = ctx.slots.inject("shell.overlay", () => ctx.slots.register({
					name: "shell.overlay",
					id: "dsh-vault-unlock",
					order: 40
				}, VaultOverlays));
				const disposeSessionAction = ctx.slots.inject("sidebar.workspaces.session.row.action", () => ctx.slots.register({
					name: "sidebar.workspaces.session.row.action",
					id: "dsh-vault-session-action",
					order: 400,
					inject: () => ({ store })
				}, VaultRowAction));
				const disposeSettings = ctx.configForms.whileServed(["dsh-vault"], () => ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
					name: "settings.plugins.tab",
					id: "dsh-vault",
					order: 90,
					label: "保险箱",
					inject: () => ({
						store,
						policyScope
					})
				}, VaultSettingsCard)));
				return () => {
					access.dispose?.();
					disposeAccess();
					disposeUnlock();
					disposeSessionAction();
					disposeSettings();
					recoveryDeliveryFor(store).dispose();
					unlock.detach();
					activity.stop();
				};
			}, "dsh-vault/client");
		}
		apply.inject = inject;
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map