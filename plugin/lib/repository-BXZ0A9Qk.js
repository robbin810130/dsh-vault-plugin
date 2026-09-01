import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";
//#region src/config.ts
const AbsolutePathSchema = z.transform(z.string(), (value, options) => {
	if (!isAbsolute(value)) throw new z.ValidationError("expected an absolute path", options);
	return value;
});
const ConfigSchema = z.object({ stateDir: AbsolutePathSchema });
const Config = ConfigSchema;
function resolveStateDirectory(stateDir, environment = process.env) {
	const supplied = [
		["explicit state directory", stateDir],
		["DSH_VAULT_STATE_DIR", environment.DSH_VAULT_STATE_DIR],
		["DSH_HOME", environment.DSH_HOME]
	];
	for (const [label, value] of supplied) if (value !== void 0 && !isAbsolute(value)) throw new TypeError(`Vault ${label} must be absolute`);
	if (stateDir !== void 0) return stateDir;
	if (environment.DSH_VAULT_STATE_DIR !== void 0) return environment.DSH_VAULT_STATE_DIR;
	if (environment.DSH_HOME !== void 0) return join(environment.DSH_HOME, "vault-lock");
	return join(homedir(), ".dsh", "vault-lock");
}
const VaultPolicySchema = z.object({
	autoLockMinutes: z.union([
		0,
		15,
		30,
		60
	]).default(15),
	lockOnSystemSleep: z.boolean().default(true),
	lockedNameVisibility: z.union([
		"workspace-visible-session-hidden",
		"all-visible",
		"all-hidden"
	]).default("workspace-visible-session-hidden"),
	failedAttemptProtection: z.object({
		enabled: z.boolean().default(true),
		maxAttempts: z.number().step(1).min(1).default(3),
		cooldownSeconds: z.number().step(1).min(1).default(300)
	}),
	passwordPolicy: z.object({
		minLength: z.number().step(1).min(4).max(128).default(8),
		requireUppercase: z.boolean().default(false),
		requireLowercase: z.boolean().default(false),
		requireNumber: z.boolean().default(false),
		requireSymbol: z.boolean().default(false)
	})
});
//#endregion
//#region src/host/state/schema.ts
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const STABLE_SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
function invalid(path, message) {
	throw new TypeError(`Invalid vault state at ${path}: ${message}`);
}
function record(value, path) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(path, "expected an object");
	return value;
}
function exactKeys(value, allowed, path) {
	const unknown = Object.keys(value).find((key) => !allowed.includes(key));
	if (unknown) invalid(path, `unknown field ${JSON.stringify(unknown)}`);
}
function string(value, path) {
	if (typeof value !== "string" || value.length === 0) invalid(path, "expected a non-empty string");
	return value;
}
function nonNegativeInteger(value, path) {
	if (!Number.isSafeInteger(value) || value < 0) invalid(path, "expected a non-negative safe integer");
	return value;
}
function positiveInteger(value, path) {
	const parsed = nonNegativeInteger(value, path);
	if (parsed === 0) invalid(path, "expected a positive safe integer");
	return parsed;
}
function canonicalBase64(value, path, byteLength) {
	const encoded = string(value, path);
	if (!BASE64.test(encoded)) invalid(path, "expected canonical base64");
	const decoded = Buffer.from(encoded, "base64");
	if (decoded.toString("base64") !== encoded) invalid(path, "expected canonical base64");
	if (decoded.length !== byteLength) invalid(path, `expected ${byteLength} bytes`);
	return encoded;
}
function stableSlug(value, path) {
	const parsed = string(value, path);
	if (!STABLE_SLUG.test(parsed)) invalid(path, "expected a stable lowercase slug");
	return parsed;
}
function secretVerifier(value, path) {
	const source = record(value, path);
	exactKeys(source, [
		"salt",
		"verifier",
		"kdf",
		"parameters"
	], path);
	const parameters = record(source.parameters, `${path}.parameters`);
	exactKeys(parameters, [
		"cost",
		"blockSize",
		"parallelization",
		"keyLength"
	], `${path}.parameters`);
	if (source.kdf !== "scrypt") invalid(`${path}.kdf`, "expected scrypt");
	if (parameters.cost !== 32768 || parameters.blockSize !== 8 || parameters.parallelization !== 1 || parameters.keyLength !== 32) invalid(`${path}.parameters`, "unsupported scrypt parameters");
	return {
		salt: canonicalBase64(source.salt, `${path}.salt`, 16),
		verifier: canonicalBase64(source.verifier, `${path}.verifier`, 32),
		kdf: "scrypt",
		parameters: {
			cost: 32768,
			blockSize: 8,
			parallelization: 1,
			keyLength: 32
		}
	};
}
function passwordGroup(value, path) {
	const source = record(value, path);
	exactKeys(source, [
		"id",
		"name",
		"password",
		"recovery",
		"credentialVersion",
		"createdAt",
		"updatedAt"
	], path);
	const recoverySource = record(source.recovery, `${path}.recovery`);
	exactKeys(recoverySource, [
		"salt",
		"verifier",
		"kdf",
		"parameters",
		"generatedAt",
		"lastVerifiedAt"
	], `${path}.recovery`);
	const recoveryVerifier = secretVerifier({
		salt: recoverySource.salt,
		verifier: recoverySource.verifier,
		kdf: recoverySource.kdf,
		parameters: recoverySource.parameters
	}, `${path}.recovery`);
	const lastVerifiedAt = recoverySource.lastVerifiedAt === void 0 ? {} : { lastVerifiedAt: string(recoverySource.lastVerifiedAt, `${path}.recovery.lastVerifiedAt`) };
	return {
		id: string(source.id, `${path}.id`),
		name: string(source.name, `${path}.name`),
		password: secretVerifier(source.password, `${path}.password`),
		recovery: {
			...recoveryVerifier,
			generatedAt: string(recoverySource.generatedAt, `${path}.recovery.generatedAt`),
			...lastVerifiedAt
		},
		credentialVersion: positiveInteger(source.credentialVersion, `${path}.credentialVersion`),
		createdAt: string(source.createdAt, `${path}.createdAt`),
		updatedAt: string(source.updatedAt, `${path}.updatedAt`)
	};
}
function protectionBinding(value, path) {
	const source = record(value, path);
	exactKeys(source, [
		"targetType",
		"targetId",
		"mode",
		"passwordGroupId",
		"workspaceId",
		"createdAt",
		"updatedAt"
	], path);
	if (source.targetType !== "workspace" && source.targetType !== "session") invalid(`${path}.targetType`, "expected workspace or session");
	if (source.mode !== "direct" && source.mode !== "inherit" && source.mode !== "no-inherit") invalid(`${path}.mode`, "expected direct, inherit, or no-inherit");
	return {
		targetType: source.targetType,
		targetId: string(source.targetId, `${path}.targetId`),
		mode: source.mode,
		...source.passwordGroupId === void 0 ? {} : { passwordGroupId: string(source.passwordGroupId, `${path}.passwordGroupId`) },
		...source.workspaceId === void 0 ? {} : { workspaceId: string(source.workspaceId, `${path}.workspaceId`) },
		createdAt: string(source.createdAt, `${path}.createdAt`),
		updatedAt: string(source.updatedAt, `${path}.updatedAt`)
	};
}
function emptyVaultState() {
	return {
		schemaVersion: 1,
		revision: 0,
		groups: {},
		bindings: []
	};
}
function parseVaultState(value) {
	const source = record(value, "$");
	if (source.schemaVersion !== 1) throw new TypeError(`Unsupported vault state schema version: ${String(source.schemaVersion)}`);
	exactKeys(source, [
		"schemaVersion",
		"revision",
		"groups",
		"bindings"
	], "$");
	const groupsSource = record(source.groups, "$.groups");
	const groups = Object.fromEntries(Object.entries(groupsSource).map(([id, group]) => {
		const parsed = passwordGroup(group, `$.groups.${JSON.stringify(id)}`);
		if (parsed.id !== id) invalid(`$.groups.${JSON.stringify(id)}.id`, "must match its group key");
		return [id, parsed];
	}));
	if (!Array.isArray(source.bindings)) invalid("$.bindings", "expected an array");
	const bindings = source.bindings.map((binding, index) => protectionBinding(binding, `$.bindings[${index}]`));
	const targets = /* @__PURE__ */ new Set();
	for (const [index, binding] of bindings.entries()) {
		const path = `$.bindings[${index}]`;
		const targetKey = `${binding.targetType}\0${binding.targetId}`;
		if (targets.has(targetKey)) invalid(path, "duplicate target binding");
		targets.add(targetKey);
		if (binding.targetType === "workspace") {
			if (binding.mode !== "direct") invalid(`${path}.mode`, "workspace binding must use direct mode");
			if (binding.workspaceId !== void 0) invalid(`${path}.workspaceId`, "workspace binding must not include workspaceId");
		}
		if (binding.mode === "direct") {
			if (binding.passwordGroupId === void 0) invalid(`${path}.passwordGroupId`, "direct binding requires a password group id");
			if (!Object.hasOwn(groups, binding.passwordGroupId)) invalid(`${path}.passwordGroupId`, "password group does not exist");
		} else if (binding.passwordGroupId !== void 0) invalid(`${path}.passwordGroupId`, `${binding.mode} binding must not include a password group id`);
	}
	return {
		schemaVersion: 1,
		revision: nonNegativeInteger(source.revision, "$.revision"),
		groups,
		bindings
	};
}
function parseAuditEvent(value) {
	const source = record(value, "$audit");
	exactKeys(source, [
		"timestamp",
		"action",
		"clientInstanceId",
		"groupId",
		"targetType",
		"targetId",
		"workspaceId",
		"revision",
		"credentialVersion",
		"count",
		"result",
		"reasonCode"
	], "$audit");
	if (source.targetType !== void 0 && source.targetType !== "workspace" && source.targetType !== "session") invalid("$audit.targetType", "expected workspace or session");
	if (source.result !== void 0 && source.result !== "success" && source.result !== "denied" && source.result !== "failure") invalid("$audit.result", "expected success, denied, or failure");
	return {
		timestamp: string(source.timestamp, "$audit.timestamp"),
		action: stableSlug(source.action, "$audit.action"),
		...source.clientInstanceId === void 0 ? {} : { clientInstanceId: string(source.clientInstanceId, "$audit.clientInstanceId") },
		...source.groupId === void 0 ? {} : { groupId: string(source.groupId, "$audit.groupId") },
		...source.targetType === void 0 ? {} : { targetType: source.targetType },
		...source.targetId === void 0 ? {} : { targetId: string(source.targetId, "$audit.targetId") },
		...source.workspaceId === void 0 ? {} : { workspaceId: string(source.workspaceId, "$audit.workspaceId") },
		...source.revision === void 0 ? {} : { revision: nonNegativeInteger(source.revision, "$audit.revision") },
		...source.credentialVersion === void 0 ? {} : { credentialVersion: positiveInteger(source.credentialVersion, "$audit.credentialVersion") },
		...source.count === void 0 ? {} : { count: nonNegativeInteger(source.count, "$audit.count") },
		...source.result === void 0 ? {} : { result: source.result },
		...source.reasonCode === void 0 ? {} : { reasonCode: stableSlug(source.reasonCode, "$audit.reasonCode") }
	};
}
//#endregion
//#region src/host/state/repository.ts
const DIRECTORY_MODE = 448;
const FILE_MODE = 384;
const LOCK_RETRY_ATTEMPTS = 100;
const LOCK_RETRY_DELAY_MS = 10;
const CLEANUP_ATTEMPTS = 3;
const STATE_TEMP_PREFIX = ".state.json.tmp-";
const BACKUP_TEMP_PREFIX = ".state.json.bak.tmp-";
const STATE_RESTORE_TEMP_PREFIX = ".state.json.restore.tmp-";
const BACKUP_RESTORE_TEMP_PREFIX = ".state.json.bak.restore.tmp-";
function hasCode(error, code) {
	return error instanceof Error && "code" in error && error.code === code;
}
function freezeDeep(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freezeDeep(child);
		Object.freeze(value);
	}
	return value;
}
function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function closeAfter(handle, operation) {
	let failed = false;
	try {
		await operation();
	} catch (error) {
		failed = true;
		throw error;
	} finally {
		try {
			await handle.close();
		} catch (error) {
			if (!failed) throw error;
		}
	}
}
var VaultStateRepository = class {
	stateDirectory;
	fileSystem;
	#statePath;
	#backupPath;
	#auditPath;
	#lockPath;
	#snapshot;
	#tail = Promise.resolve();
	constructor(stateDirectory, fileSystem = nodeFs) {
		this.stateDirectory = stateDirectory;
		this.fileSystem = fileSystem;
		if (!isAbsolute(stateDirectory)) throw new TypeError("Vault state directory must be absolute");
		this.#statePath = join(stateDirectory, "state.json");
		this.#backupPath = join(stateDirectory, "state.json.bak");
		this.#auditPath = join(stateDirectory, "audit.jsonl");
		this.#lockPath = join(stateDirectory, "state.lock");
	}
	load() {
		return this.#exclusive(async () => {
			const loaded = await this.#withStateLock(() => this.#loadFromDiskLocked());
			this.#snapshot = loaded;
			return this.#snapshot;
		});
	}
	commit(expectedRevision, next) {
		return this.#exclusive(async () => {
			const committed = await this.#withStateLock(async () => {
				const current = await this.#loadFromDiskLocked();
				if (current.revision !== expectedRevision) return {
					result: {
						ok: false,
						code: "revision-conflict"
					},
					snapshot: current
				};
				const candidate = parseVaultState(structuredClone(next));
				if (candidate.revision !== expectedRevision + 1) throw new TypeError("Next vault state revision must increment expectedRevision by one");
				await this.#persist(candidate, true);
				return {
					result: {
						ok: true,
						revision: candidate.revision
					},
					snapshot: freezeDeep(candidate)
				};
			});
			this.#snapshot = committed.snapshot;
			return committed.result;
		});
	}
	commitWithAudit(expectedRevision, next, attempt, success) {
		return this.#exclusive(async () => {
			const committed = await this.#withStateLock(async () => {
				const current = await this.#loadFromDiskLocked();
				if (current.revision !== expectedRevision) {
					await this.#appendAuditLocked(attempt);
					return {
						result: {
							ok: false,
							code: "revision-conflict"
						},
						snapshot: current
					};
				}
				const candidate = parseVaultState(structuredClone(next));
				if (candidate.revision !== expectedRevision + 1) throw new TypeError("Next vault state revision must increment expectedRevision by one");
				const stateBefore = await this.fileSystem.readFile(this.#statePath, "utf8");
				const backupBefore = await this.#readOptional(this.#backupPath);
				await this.#appendAuditLocked(attempt);
				await this.#persist(candidate, true);
				try {
					await this.#appendAuditLocked(success);
				} catch (error) {
					try {
						await this.#restoreStateFilesLocked(stateBefore, backupBefore);
					} catch (rollbackError) {
						throw new AggregateError([error, rollbackError], "Vault audit commit rollback failed");
					}
					throw error;
				}
				return {
					result: {
						ok: true,
						revision: candidate.revision
					},
					snapshot: freezeDeep(candidate)
				};
			});
			this.#snapshot = committed.snapshot;
			return committed.result;
		});
	}
	appendAudit(event) {
		return this.#exclusive(() => this.#withStateLock(() => this.#appendAuditLocked(event)));
	}
	async #appendAuditLocked(event) {
		const parsed = parseAuditEvent(structuredClone(event));
		const line = `${JSON.stringify(parsed)}\n`;
		const original = await this.#readOptional(this.#auditPath);
		const originalLength = original === void 0 ? 0 : Buffer.byteLength(original);
		try {
			let handle;
			try {
				handle = await this.fileSystem.open(this.#auditPath, "ax", FILE_MODE);
			} catch (error) {
				if (!hasCode(error, "EEXIST")) throw error;
				handle = await this.fileSystem.open(this.#auditPath, "a", FILE_MODE);
			}
			await closeAfter(handle, async () => {
				await this.fileSystem.chmod(this.#auditPath, FILE_MODE);
				await handle.writeFile(line);
				await handle.sync();
			});
			await this.#syncDirectory();
		} catch (error) {
			try {
				await this.#restoreAuditLocked(original !== void 0, originalLength);
			} catch (rollbackError) {
				throw new AggregateError([error, rollbackError], "Vault audit append rollback failed");
			}
			throw error;
		}
	}
	#exclusive(operation) {
		const result = this.#tail.then(operation, operation);
		this.#tail = result.then(() => void 0, () => void 0);
		return result;
	}
	async #ensureDirectory() {
		await this.fileSystem.mkdir(this.stateDirectory, {
			recursive: true,
			mode: DIRECTORY_MODE
		});
		await this.fileSystem.chmod(this.stateDirectory, DIRECTORY_MODE);
	}
	async #withStateLock(operation) {
		await this.#ensureDirectory();
		await this.#acquireStateLock();
		let result;
		let operationError;
		try {
			await this.#cleanupStaleTemps();
			result = await operation();
		} catch (error) {
			operationError = error;
		}
		try {
			await this.#unlinkWithRetries(this.#lockPath, "state lock");
		} catch (cleanupError) {
			if (operationError !== void 0) throw new AggregateError([operationError, cleanupError], "Vault state operation failed and state lock cleanup failed");
			throw cleanupError;
		}
		if (operationError !== void 0) throw operationError;
		return result;
	}
	async #acquireStateLock() {
		for (let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS; attempt += 1) try {
			const handle = await this.fileSystem.open(this.#lockPath, "wx", FILE_MODE);
			try {
				await handle.close();
			} catch (error) {
				await this.#unlinkWithRetries(this.#lockPath, "state lock");
				throw error;
			}
			return;
		} catch (error) {
			if (!hasCode(error, "EEXIST")) throw error;
			if (attempt === LOCK_RETRY_ATTEMPTS) throw new Error("Vault state lock is busy; refusing unsafe concurrent access", { cause: error });
			await delay(LOCK_RETRY_DELAY_MS);
		}
	}
	async #loadFromDiskLocked() {
		await this.#ensureDirectory();
		const backupExists = await this.#secureBackupIfPresent();
		let source;
		try {
			await this.fileSystem.chmod(this.#statePath, FILE_MODE);
			source = await this.fileSystem.readFile(this.#statePath, "utf8");
		} catch (error) {
			if (!hasCode(error, "ENOENT")) throw error;
			if (backupExists) throw new Error("Vault state is missing while a backup exists; explicit recovery is required");
			const initial = freezeDeep(emptyVaultState());
			await this.#persist(initial, false);
			return initial;
		}
		let decoded;
		try {
			decoded = JSON.parse(source);
		} catch (error) {
			throw new SyntaxError("Corrupt vault state JSON", { cause: error });
		}
		return freezeDeep(parseVaultState(decoded));
	}
	async #secureBackupIfPresent() {
		try {
			await this.fileSystem.chmod(this.#backupPath, FILE_MODE);
			return true;
		} catch (error) {
			if (hasCode(error, "ENOENT")) return false;
			throw error;
		}
	}
	async #persist(next, currentExists) {
		await this.#ensureDirectory();
		const suffix = `${process.pid}-${randomUUID()}`;
		const stateTempPath = join(this.stateDirectory, `${STATE_TEMP_PREFIX}${suffix}`);
		const backupTempPath = join(this.stateDirectory, `${BACKUP_TEMP_PREFIX}${suffix}`);
		let stateTempExists = false;
		let backupTempExists = false;
		let stateReplaced = false;
		let backupPublished = false;
		try {
			const stateTemp = await this.fileSystem.open(stateTempPath, "wx", FILE_MODE);
			stateTempExists = true;
			await closeAfter(stateTemp, async () => {
				await this.fileSystem.chmod(stateTempPath, FILE_MODE);
				await stateTemp.writeFile(`${JSON.stringify(next)}\n`);
				await stateTemp.sync();
			});
			if (currentExists) {
				const reservedBackupTemp = await this.fileSystem.open(backupTempPath, "wx", FILE_MODE);
				backupTempExists = true;
				await reservedBackupTemp.close();
				await this.fileSystem.copyFile(this.#statePath, backupTempPath);
				await this.fileSystem.chmod(backupTempPath, FILE_MODE);
				const backupTemp = await this.fileSystem.open(backupTempPath, "r+");
				await closeAfter(backupTemp, () => backupTemp.sync());
			}
			await this.fileSystem.rename(stateTempPath, this.#statePath);
			stateTempExists = false;
			stateReplaced = true;
			await this.#syncDirectory();
			if (currentExists) {
				await this.fileSystem.rename(backupTempPath, this.#backupPath);
				backupTempExists = false;
				backupPublished = true;
				await this.#syncDirectory();
			}
		} catch (error) {
			const cleanupErrors = [];
			if (stateReplaced && backupPublished) try {
				await this.fileSystem.copyFile(this.#backupPath, this.#statePath);
				await this.fileSystem.chmod(this.#statePath, FILE_MODE);
				await this.#syncFile(this.#statePath);
				stateReplaced = false;
				backupPublished = false;
				await this.#syncDirectory();
			} catch (rollbackError) {
				cleanupErrors.push(new Error("Vault state rollback failed", { cause: rollbackError }));
			}
			else if (stateReplaced && backupTempExists) try {
				await this.fileSystem.rename(backupTempPath, this.#statePath);
				backupTempExists = false;
				stateReplaced = false;
				await this.#syncDirectory();
			} catch (rollbackError) {
				cleanupErrors.push(new Error("Vault state rollback failed", { cause: rollbackError }));
			}
			if (backupTempExists) try {
				await this.#unlinkWithRetries(backupTempPath, "backup temp");
			} catch (cleanupError) {
				cleanupErrors.push(cleanupError);
			}
			if (stateTempExists) try {
				await this.#unlinkWithRetries(stateTempPath, "state temp");
			} catch (cleanupError) {
				cleanupErrors.push(cleanupError);
			}
			if (cleanupErrors.length > 0) throw new AggregateError([error, ...cleanupErrors], "Vault persistence failed and sensitive temp cleanup failed");
			throw error;
		}
	}
	async #syncDirectory() {
		const directory = await this.fileSystem.open(this.stateDirectory, "r");
		await closeAfter(directory, () => directory.sync());
	}
	async #syncFile(path) {
		const file = await this.fileSystem.open(path, "r+");
		await closeAfter(file, () => file.sync());
	}
	async #readOptional(path) {
		try {
			return await this.fileSystem.readFile(path, "utf8");
		} catch (error) {
			if (hasCode(error, "ENOENT")) return void 0;
			throw error;
		}
	}
	async #restoreAuditLocked(originalExists, originalLength) {
		if (originalExists) {
			await this.fileSystem.truncate(this.#auditPath, originalLength);
			await this.#syncFile(this.#auditPath);
		} else await this.#unlinkWithRetries(this.#auditPath, "audit rollback");
		await this.#syncDirectory();
	}
	async #restoreStateFilesLocked(stateBefore, backupBefore) {
		await this.#ensureDirectory();
		const suffix = `${process.pid}-${randomUUID()}`;
		const stateRestorePath = join(this.stateDirectory, `${STATE_RESTORE_TEMP_PREFIX}${suffix}`);
		const backupRestorePath = join(this.stateDirectory, `${BACKUP_RESTORE_TEMP_PREFIX}${suffix}`);
		let stateRestoreExists = false;
		let backupRestoreExists = false;
		try {
			const stateRestore = await this.fileSystem.open(stateRestorePath, "wx", FILE_MODE);
			stateRestoreExists = true;
			await closeAfter(stateRestore, async () => {
				await this.fileSystem.chmod(stateRestorePath, FILE_MODE);
				await stateRestore.writeFile(stateBefore);
				await stateRestore.sync();
			});
			if (backupBefore !== void 0) {
				const backupRestore = await this.fileSystem.open(backupRestorePath, "wx", FILE_MODE);
				backupRestoreExists = true;
				await closeAfter(backupRestore, async () => {
					await this.fileSystem.chmod(backupRestorePath, FILE_MODE);
					await backupRestore.writeFile(backupBefore);
					await backupRestore.sync();
				});
			}
			await this.fileSystem.rename(stateRestorePath, this.#statePath);
			stateRestoreExists = false;
			await this.#syncDirectory();
			if (backupBefore !== void 0) {
				await this.fileSystem.rename(backupRestorePath, this.#backupPath);
				backupRestoreExists = false;
				await this.#syncDirectory();
			} else {
				await this.#unlinkWithRetries(this.#backupPath, "backup rollback");
				await this.#syncDirectory();
			}
		} catch (error) {
			const cleanupErrors = [];
			if (stateRestoreExists) try {
				await this.#unlinkWithRetries(stateRestorePath, "state restore temp");
			} catch (cleanupError) {
				cleanupErrors.push(cleanupError);
			}
			if (backupRestoreExists) try {
				await this.#unlinkWithRetries(backupRestorePath, "backup restore temp");
			} catch (cleanupError) {
				cleanupErrors.push(cleanupError);
			}
			if (cleanupErrors.length > 0) throw new AggregateError([error, ...cleanupErrors], "Vault state restore failed and sensitive temp cleanup failed");
			throw error;
		}
	}
	async #cleanupStaleTemps() {
		const staleNames = (await this.fileSystem.readdir(this.stateDirectory)).filter((name) => name.startsWith(STATE_TEMP_PREFIX) || name.startsWith(BACKUP_TEMP_PREFIX) || name.startsWith(STATE_RESTORE_TEMP_PREFIX) || name.startsWith(BACKUP_RESTORE_TEMP_PREFIX));
		if (staleNames.length === 0) return;
		for (const name of staleNames) await this.#unlinkWithRetries(join(this.stateDirectory, name), "stale temp");
		await this.#syncDirectory();
	}
	async #unlinkWithRetries(path, label) {
		let lastError;
		for (let attempt = 1; attempt <= CLEANUP_ATTEMPTS; attempt += 1) try {
			await this.fileSystem.unlink(path);
			return;
		} catch (error) {
			if (hasCode(error, "ENOENT")) return;
			lastError = error;
		}
		throw new Error(`Vault ${label} cleanup failed after ${CLEANUP_ATTEMPTS} attempts`, { cause: lastError });
	}
};
//#endregion
export { resolveStateDirectory as a, VaultPolicySchema as i, Config as n, ConfigSchema as r, VaultStateRepository as t };

//# sourceMappingURL=repository-BXZ0A9Qk.js.map