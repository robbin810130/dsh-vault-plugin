import { a as resolveStateDirectory, i as VaultPolicySchema, n as Config, r as ConfigSchema, t as VaultStateRepository } from "./repository-BXZ0A9Qk.js";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";
import { isDeepStrictEqual } from "node:util";
import { performance } from "node:perf_hooks";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
function record(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid request");
	return value;
}
function exact(source, keys) {
	if (Object.keys(source).some((key) => !keys.includes(key))) throw new TypeError("Invalid request");
}
function text(value, max, optional = false) {
	if (value === void 0 && optional) return void 0;
	if (typeof value !== "string" || value.length === 0 || value.length > max) throw new TypeError("Invalid request");
	return value;
}
function id(value) {
	return text(value, 128);
}
function revision(value) {
	if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Invalid request");
	return value;
}
function password(value) {
	const parsed = text(value, 512);
	if (Buffer.byteLength(parsed, "utf8") > 512 || Array.from(parsed).length === 0) throw new TypeError("Invalid request");
	return parsed;
}
function proof(value) {
	const source = record(value);
	exact(source, [
		"groupId",
		"credentialVersion",
		"token"
	]);
	const credentialVersion = revision(source.credentialVersion);
	const token = text(source.token, 256);
	if (credentialVersion === 0 || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new TypeError("Invalid request");
	return {
		groupId: id(source.groupId),
		credentialVersion,
		token
	};
}
function proofs(value) {
	if (!Array.isArray(value) || value.length > 256) throw new TypeError("Invalid request");
	return value.map(proof);
}
function binding(value) {
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
	if (source.targetType !== "workspace" && source.targetType !== "session") throw new TypeError("Invalid request");
	if (source.mode !== "direct" && source.mode !== "inherit" && source.mode !== "no-inherit") throw new TypeError("Invalid request");
	const passwordGroupId = text(source.passwordGroupId, 128, true);
	const workspaceId = text(source.workspaceId, 128, true);
	return {
		targetType: source.targetType,
		targetId: id(source.targetId),
		mode: source.mode,
		...passwordGroupId === void 0 ? {} : { passwordGroupId },
		...workspaceId === void 0 ? {} : { workspaceId },
		createdAt: text(source.createdAt, 128),
		updatedAt: text(source.updatedAt, 128)
	};
}
function bindings(value) {
	if (!Array.isArray(value) || value.length > 256) throw new TypeError("Invalid request");
	return value.map(binding);
}
function createInput(value) {
	const source = record(value);
	exact(source, [
		"name",
		"password",
		"bindings"
	]);
	return {
		name: text(source.name, 128),
		password: password(source.password),
		bindings: bindings(source.bindings)
	};
}
function changeInput(value) {
	const source = record(value);
	exact(source, [
		"groupId",
		"currentPassword",
		"recoveryKey",
		"newPassword",
		"rotateRecovery"
	]);
	if (typeof source.rotateRecovery !== "boolean") throw new TypeError("Invalid request");
	if (source.currentPassword === void 0 === (source.recoveryKey === void 0)) throw new TypeError("Invalid request");
	return {
		groupId: id(source.groupId),
		...source.currentPassword === void 0 ? {} : { currentPassword: password(source.currentPassword) },
		...source.recoveryKey === void 0 ? {} : { recoveryKey: password(source.recoveryKey) },
		newPassword: password(source.newPassword),
		rotateRecovery: source.rotateRecovery
	};
}
function recoverInput(value) {
	const source = record(value);
	exact(source, [
		"groupId",
		"recoveryKey",
		"newPassword"
	]);
	return {
		groupId: id(source.groupId),
		recoveryKey: password(source.recoveryKey),
		newPassword: password(source.newPassword)
	};
}
function mutation(value) {
	const source = record(value);
	const kind = text(source.kind, 32);
	if (kind === "replace") {
		exact(source, ["kind", "binding"]);
		return {
			kind,
			binding: binding(source.binding)
		};
	}
	if (kind === "remove") {
		exact(source, [
			"kind",
			"targetType",
			"targetId"
		]);
		if (source.targetType !== "workspace" && source.targetType !== "session") throw new TypeError("Invalid request");
		return {
			kind,
			targetType: source.targetType,
			targetId: id(source.targetId)
		};
	}
	if (kind === "delete-group") {
		exact(source, [
			"kind",
			"groupId",
			"moveToGroupId",
			"removeProtection"
		]);
		const moveToGroupId = text(source.moveToGroupId, 128, true);
		if (source.removeProtection !== void 0 && source.removeProtection !== true) throw new TypeError("Invalid request");
		return {
			kind,
			groupId: id(source.groupId),
			...moveToGroupId === void 0 ? {} : { moveToGroupId },
			...source.removeProtection === true ? { removeProtection: true } : {}
		};
	}
	throw new TypeError("Invalid request");
}
function parseVaultApiRequest(value) {
	const source = record(value);
	const action = text(source.action, 64);
	switch (action) {
		case "snapshot":
			exact(source, ["action", "clientInstanceId"]);
			return {
				action,
				clientInstanceId: id(source.clientInstanceId)
			};
		case "unlock":
			exact(source, [
				"action",
				"clientInstanceId",
				"groupId",
				"password"
			]);
			return {
				action,
				clientInstanceId: id(source.clientInstanceId),
				groupId: id(source.groupId),
				password: password(source.password)
			};
		case "grants-validate":
		case "activity-touch":
			exact(source, [
				"action",
				"clientInstanceId",
				"grants"
			]);
			return {
				action,
				clientInstanceId: id(source.clientInstanceId),
				grants: proofs(source.grants)
			};
		case "lock-group":
			exact(source, [
				"action",
				"clientInstanceId",
				"groupId"
			]);
			return {
				action,
				clientInstanceId: id(source.clientInstanceId),
				groupId: id(source.groupId)
			};
		case "lock-all":
			exact(source, ["action", "clientInstanceId"]);
			return {
				action,
				clientInstanceId: id(source.clientInstanceId)
			};
		case "group-create":
			exact(source, [
				"action",
				"clientInstanceId",
				"expectedRevision",
				"grants",
				"input",
				"intent"
			]);
			{
				const intent = text(source.intent, 128, true);
				return {
					action,
					clientInstanceId: id(source.clientInstanceId),
					expectedRevision: revision(source.expectedRevision),
					grants: proofs(source.grants),
					input: createInput(source.input),
					...intent === void 0 ? {} : { intent }
				};
			}
		case "group-change-password":
			exact(source, [
				"action",
				"clientInstanceId",
				"expectedRevision",
				"input"
			]);
			return {
				action,
				clientInstanceId: id(source.clientInstanceId),
				expectedRevision: revision(source.expectedRevision),
				input: changeInput(source.input)
			};
		case "group-recover":
			exact(source, [
				"action",
				"clientInstanceId",
				"expectedRevision",
				"input"
			]);
			return {
				action,
				clientInstanceId: id(source.clientInstanceId),
				expectedRevision: revision(source.expectedRevision),
				input: recoverInput(source.input)
			};
		case "bindings-update":
			exact(source, [
				"action",
				"clientInstanceId",
				"expectedRevision",
				"grants",
				"input"
			]);
			return {
				action,
				clientInstanceId: id(source.clientInstanceId),
				expectedRevision: revision(source.expectedRevision),
				grants: proofs(source.grants),
				input: mutation(source.input)
			};
		default: throw new TypeError("Invalid request");
	}
}
//#endregion
//#region src/host/api/handler.ts
const CREATE_INTENT_TTL_MS = 15e3;
var CreateIntentStore = class {
	entries = /* @__PURE__ */ new Map();
	issue(clientInstanceId, now = Date.now()) {
		const token = randomBytes(32).toString("base64url");
		this.entries.set(clientInstanceId, {
			token,
			expiresAt: now + CREATE_INTENT_TTL_MS
		});
		return token;
	}
	consume(clientInstanceId, token, now = Date.now()) {
		const entry = this.entries.get(clientInstanceId);
		this.entries.delete(clientInstanceId);
		return entry !== void 0 && entry.expiresAt >= now && token !== void 0 && entry.token === token;
	}
};
var BodyTooLargeError = class extends Error {};
function header(req, name) {
	const value = req.headers[name];
	if (Array.isArray(value)) return void 0;
	return value;
}
function loopbackAddress(address) {
	if (!address) return false;
	const normalized = address.toLowerCase();
	if (isIPv4(normalized)) return normalized.split(".")[0] === "127";
	if (normalized === "::1") return true;
	if (!isIPv6(normalized) || !normalized.startsWith("::ffff:")) return false;
	const suffix = normalized.slice(7);
	if (isIPv4(suffix)) return suffix.split(".")[0] === "127";
	const parts = suffix.split(":");
	if (parts.length !== 2 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return false;
	const first = Number.parseInt(parts[0], 16);
	const second = Number.parseInt(parts[1], 16);
	return Number.isInteger(first) && Number.isInteger(second) && first >>> 8 === 127;
}
function localHttpHostname(hostname) {
	const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (normalized === "localhost" || normalized === "::1") return true;
	return isIPv4(normalized) && normalized.split(".")[0] === "127";
}
function protocol(req) {
	return req.socket.encrypted ? "https" : "http";
}
function send(res, status, body) {
	res.statusCode = status;
	res.setHeader("Cache-Control", "no-store");
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.end(JSON.stringify(body));
}
function checkOrigin(req) {
	const host = header(req, "host");
	if (!host) return false;
	const scheme = protocol(req);
	const origin = header(req, "origin");
	if (origin === void 0) return false;
	if (host.includes(",") || origin.includes(",")) return false;
	if (scheme === "http" && !loopbackAddress(req.socket.remoteAddress)) return false;
	try {
		const expectedUrl = new URL(scheme + "://" + host);
		if (expectedUrl.username || expectedUrl.password || expectedUrl.pathname !== "/" || expectedUrl.search || expectedUrl.hash) return false;
		if (scheme === "http" && !localHttpHostname(expectedUrl.hostname)) return false;
		const originUrl = new URL(origin);
		if (originUrl.username || originUrl.password || originUrl.pathname !== "/" || originUrl.search || originUrl.hash) return false;
		return originUrl.origin === expectedUrl.origin;
	} catch {
		return false;
	}
}
async function readBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += data.byteLength;
		if (size > 262144) throw new BodyTooLargeError();
		chunks.push(data);
	}
	return Buffer.concat(chunks).toString("utf8");
}
function createVaultApiHandler(service) {
	const createIntents = new CreateIntentStore();
	return async (req, res) => {
		if (req.method !== "POST") return send(res, 405, {
			ok: false,
			error: {
				code: "method-not-allowed",
				message: "Request refused"
			}
		});
		if (!checkOrigin(req)) return send(res, 403, {
			ok: false,
			error: {
				code: "origin-refused",
				message: "Request refused"
			}
		});
		if (header(req, "content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return send(res, 415, {
			ok: false,
			error: {
				code: "unsupported-media-type",
				message: "Request refused"
			}
		});
		try {
			const body = JSON.parse(await readBody(req));
			const source = body !== null && typeof body === "object" && !Array.isArray(body) ? body : void 0;
			if (source !== void 0 && Object.keys(source).length === 2 && source.action === "group-create-intent" && typeof source.clientInstanceId === "string" && source.clientInstanceId.length > 0 && source.clientInstanceId.length <= 128) return send(res, 200, {
				ok: true,
				value: { intent: createIntents.issue(source.clientInstanceId) }
			});
			const parsed = parseVaultApiRequest(body);
			if (parsed.action === "group-create" && !createIntents.consume(parsed.clientInstanceId, parsed.intent)) return send(res, 400, {
				ok: false,
				error: {
					code: "create-intent-refused",
					message: "Request refused"
				}
			});
			send(res, 200, await service.handle(parsed));
		} catch (error) {
			if (error instanceof BodyTooLargeError) return send(res, 413, {
				ok: false,
				error: {
					code: "body-too-large",
					message: "Request refused"
				}
			});
			return send(res, 400, {
				ok: false,
				error: {
					code: "invalid-request",
					message: "Request refused"
				}
			});
		}
	};
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
//#region src/host/crypto/verifier.ts
const PARAMETERS = {
	cost: 32768,
	blockSize: 8,
	parallelization: 1,
	keyLength: 32
};
const MIN_SECRET_CHARACTERS = 8;
const MAX_SECRET_BYTES = 512;
const SALT_LENGTH = 16;
const SCRYPT_MAX_MEMORY = 67108864;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const COMPACT_RECOVERY_KEY = /^[A-Z2-7]{52}$/;
const GROUPED_RECOVERY_KEY = /^(?:[A-Z2-7]{4}-){12}[A-Z2-7]{4}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function prepareSecret(secret, minLength) {
	if (Buffer.byteLength(secret, "utf8") > MAX_SECRET_BYTES) throw new RangeError(`Secret must not exceed ${MAX_SECRET_BYTES} UTF-8 bytes`);
	if (minLength !== void 0 && (!Number.isSafeInteger(minLength) || minLength < 1 || Array.from(secret).length < minLength)) throw new RangeError(`Secret must contain at least ${minLength} Unicode code points`);
	if (COMPACT_RECOVERY_KEY.test(secret)) return secret;
	if (GROUPED_RECOVERY_KEY.test(secret)) return secret.replaceAll("-", "");
	return secret;
}
function derive(secret, salt, minLength) {
	return new Promise((resolve, reject) => {
		scrypt(prepareSecret(secret, minLength), salt, PARAMETERS.keyLength, {
			N: PARAMETERS.cost,
			r: PARAMETERS.blockSize,
			p: PARAMETERS.parallelization,
			maxmem: SCRYPT_MAX_MEMORY
		}, (error, derivedKey) => {
			if (error) reject(error);
			else resolve(derivedKey);
		});
	});
}
function decodeBase64(value) {
	if (value.length === 0 || !BASE64.test(value)) return void 0;
	const decoded = Buffer.from(value, "base64");
	return decoded.toString("base64") === value ? decoded : void 0;
}
function hasExpectedParameters(record) {
	return record.kdf === "scrypt" && record.parameters?.cost === PARAMETERS.cost && record.parameters.blockSize === PARAMETERS.blockSize && record.parameters.parallelization === PARAMETERS.parallelization && record.parameters.keyLength === PARAMETERS.keyLength;
}
async function createVerifier(secret, policy) {
	const salt = randomBytes(SALT_LENGTH);
	const verifier = await derive(secret, salt, policy?.minLength ?? MIN_SECRET_CHARACTERS);
	return {
		salt: salt.toString("base64"),
		verifier: verifier.toString("base64"),
		kdf: "scrypt",
		parameters: PARAMETERS
	};
}
async function verifySecret(secret, record) {
	if (!hasExpectedParameters(record)) return false;
	const salt = decodeBase64(record.salt);
	const expected = decodeBase64(record.verifier);
	if (salt?.length !== SALT_LENGTH || expected?.length !== PARAMETERS.keyLength) return false;
	let actual;
	try {
		actual = await derive(secret, salt);
	} catch (error) {
		if (error instanceof RangeError) return false;
		throw error;
	}
	if (actual.length !== expected.length) return false;
	return timingSafeEqual(actual, expected);
}
function encodeBase32(bytes) {
	let bits = 0;
	let value = 0;
	let encoded = "";
	for (const byte of bytes) {
		value = value << 8 | byte;
		bits += 8;
		while (bits >= 5) {
			encoded += BASE32_ALPHABET[value >>> bits - 5 & 31];
			bits -= 5;
		}
	}
	if (bits > 0) encoded += BASE32_ALPHABET[value << 5 - bits & 31];
	return encoded;
}
function generateRecoveryKey() {
	return encodeBase32(randomBytes(32)).match(/.{4}/g)?.join("-") ?? "";
}
//#endregion
//#region src/host/auth/attempts.ts
const defaults$1 = {
	monotonicNow: () => performance.now(),
	wallNow: () => Date.now()
};
var FailedAttemptStore = class {
	dependencies;
	groups = /* @__PURE__ */ new Map();
	lastMonotonicNow;
	constructor(dependencies = {}) {
		this.dependencies = {
			...defaults$1,
			...dependencies
		};
	}
	check(groupId, clientInstanceId, policy) {
		this.setPolicy(policy);
		const state = this.get(groupId, clientInstanceId);
		const now = this.readMonotonicNow();
		if (now === void 0) return {
			kind: "cooldown",
			retryAt: state?.retryAt ?? this.failClosedRetryAt()
		};
		if (state?.cooldownDeadline === void 0 || state.retryAt === void 0) return { kind: "allowed" };
		if (state.cooldownDeadline !== null && now >= state.cooldownDeadline) {
			this.delete(groupId, clientInstanceId);
			return { kind: "allowed" };
		}
		return {
			kind: "cooldown",
			retryAt: state.retryAt
		};
	}
	recordFailure(groupId, clientInstanceId, policy) {
		this.setPolicy(policy);
		const current = this.get(groupId, clientInstanceId);
		if (!policy.enabled) {
			if (current?.cooldownDeadline === void 0 || current.retryAt === void 0) return { kind: "rejected" };
			const now = this.readMonotonicNow();
			if (now === void 0 || current.cooldownDeadline === null || now < current.cooldownDeadline) return {
				kind: "cooldown",
				retryAt: current.retryAt
			};
			this.delete(groupId, clientInstanceId);
			return { kind: "rejected" };
		}
		const now = this.readMonotonicNow();
		if (now === void 0) {
			if (current?.cooldownDeadline !== void 0 && current.retryAt !== void 0) return {
				kind: "cooldown",
				retryAt: current.retryAt
			};
			return { kind: "rejected" };
		}
		if (current?.cooldownDeadline !== void 0 && current.retryAt !== void 0) {
			if (current.cooldownDeadline === null || now < current.cooldownDeadline) return {
				kind: "cooldown",
				retryAt: current.retryAt
			};
			this.delete(groupId, clientInstanceId);
		}
		const nextFailures = ((current?.cooldownDeadline === void 0 ? current?.failures : void 0) ?? 0) + 1;
		if (nextFailures >= policy.maxAttempts) {
			const cooldownMs = policy.cooldownSeconds * 1e3;
			const cooldownDeadline = this.deadlineFrom(now, cooldownMs);
			const wallNow = this.dependencies.wallNow();
			const retryAtCandidate = wallNow + cooldownMs;
			const retryAt = Number.isFinite(retryAtCandidate) ? retryAtCandidate : Number.isFinite(wallNow) ? wallNow : 0;
			this.set(groupId, clientInstanceId, {
				failures: nextFailures,
				cooldownDeadline,
				retryAt
			});
			return {
				kind: "cooldown",
				retryAt
			};
		}
		this.set(groupId, clientInstanceId, { failures: nextFailures });
		return {
			kind: "rejected",
			remainingAttempts: policy.maxAttempts - nextFailures
		};
	}
	setPolicy(policy) {
		if (policy.enabled) return;
		for (const [groupId, clients] of this.groups) {
			for (const [clientInstanceId, state] of clients) if (state.cooldownDeadline === void 0 || state.retryAt === void 0) clients.delete(clientInstanceId);
			if (clients.size === 0) this.groups.delete(groupId);
		}
	}
	recordSuccess(groupId, clientInstanceId) {
		this.delete(groupId, clientInstanceId);
	}
	resetGroup(groupId) {
		this.groups.delete(groupId);
	}
	resetClient(clientInstanceId) {
		for (const [groupId, clients] of this.groups) {
			clients.delete(clientInstanceId);
			if (clients.size === 0) this.groups.delete(groupId);
		}
	}
	clear() {
		this.groups.clear();
	}
	get(groupId, clientInstanceId) {
		return this.groups.get(groupId)?.get(clientInstanceId);
	}
	set(groupId, clientInstanceId, state) {
		const clients = this.groups.get(groupId) ?? /* @__PURE__ */ new Map();
		clients.set(clientInstanceId, state);
		this.groups.set(groupId, clients);
	}
	delete(groupId, clientInstanceId) {
		const clients = this.groups.get(groupId);
		if (!clients) return;
		clients.delete(clientInstanceId);
		if (clients.size === 0) this.groups.delete(groupId);
	}
	readMonotonicNow() {
		const now = this.dependencies.monotonicNow();
		if (!Number.isFinite(now) || this.lastMonotonicNow !== void 0 && now < this.lastMonotonicNow) return;
		this.lastMonotonicNow = now;
		return now;
	}
	failClosedRetryAt() {
		const retryAt = this.dependencies.wallNow();
		return Number.isFinite(retryAt) ? retryAt : 0;
	}
	deadlineFrom(now, cooldownMs) {
		const deadline = now + cooldownMs;
		return Number.isFinite(cooldownMs) && cooldownMs > 0 && Number.isFinite(deadline) && deadline > now ? deadline : null;
	}
};
const defaults = {
	monotonicNow: () => performance.now(),
	wallNow: () => Date.now(),
	randomBytes
};
var InMemoryGrantStore = class {
	dependencies;
	grants = /* @__PURE__ */ new Map();
	lastMonotonicNow;
	constructor(dependencies = {}) {
		this.dependencies = {
			...defaults,
			...dependencies
		};
	}
	issue(groupId, credentialVersion, clientInstanceId, ttlMs) {
		if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new RangeError("Grant TTL must be a non-negative finite number");
		const monotonicNow = this.readMonotonicNow();
		if (monotonicNow === void 0) throw new RangeError("Grant monotonic clock is invalid");
		const deadline = this.deadlineFrom(monotonicNow, ttlMs);
		if (ttlMs > 0 && deadline === void 0) {
			this.grants.clear();
			throw new RangeError("Grant deadline is invalid");
		}
		const entropy = this.dependencies.randomBytes(32);
		if (entropy.byteLength !== 32) throw new RangeError("Grant token source must return exactly 32 bytes");
		const token = Buffer.from(entropy).toString("base64url");
		const issuedAt = this.dependencies.wallNow();
		this.grants.set(this.digestKey(token), {
			groupId,
			credentialVersion,
			clientInstanceId,
			deadline
		});
		return {
			token,
			groupId,
			credentialVersion,
			clientInstanceId,
			issuedAt,
			expiresAt: this.displayExpiresAt(issuedAt, ttlMs)
		};
	}
	authorize(token, groupId, credentialVersion, clientInstanceId) {
		const monotonicNow = this.readMonotonicNow();
		if (monotonicNow === void 0) return false;
		const digest = this.digestKey(token);
		const grant = this.grants.get(digest);
		if (!grant) return false;
		if (grant.deadline !== void 0 && monotonicNow >= grant.deadline) {
			this.grants.delete(digest);
			return false;
		}
		return grant.groupId === groupId && grant.credentialVersion === credentialVersion && grant.clientInstanceId === clientInstanceId;
	}
	touch(token, groupId, credentialVersion, clientInstanceId, ttlMs) {
		if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new RangeError("Grant TTL must be a non-negative finite number");
		const monotonicNow = this.readMonotonicNow();
		if (monotonicNow === void 0) return { authorized: false };
		const digest = this.digestKey(token);
		const grant = this.grants.get(digest);
		if (!grant) return { authorized: false };
		if (grant.deadline !== void 0 && monotonicNow >= grant.deadline) {
			this.grants.delete(digest);
			return { authorized: false };
		}
		if (grant.groupId !== groupId || grant.credentialVersion !== credentialVersion || grant.clientInstanceId !== clientInstanceId) return { authorized: false };
		const deadline = this.deadlineFrom(monotonicNow, ttlMs);
		if (ttlMs > 0 && deadline === void 0) {
			this.grants.delete(digest);
			return { authorized: false };
		}
		this.grants.set(digest, {
			...grant,
			deadline
		});
		const wallNow = this.dependencies.wallNow();
		return {
			authorized: true,
			expiresAt: this.displayExpiresAt(wallNow, ttlMs)
		};
	}
	revokeGroup(groupId) {
		for (const [digest, grant] of this.grants) if (grant.groupId === groupId) this.grants.delete(digest);
	}
	revokeGroupForClient(groupId, clientInstanceId) {
		for (const [digest, grant] of this.grants) if (grant.groupId === groupId && grant.clientInstanceId === clientInstanceId) this.grants.delete(digest);
	}
	revokeClient(clientInstanceId) {
		for (const [digest, grant] of this.grants) if (grant.clientInstanceId === clientInstanceId) this.grants.delete(digest);
	}
	clear() {
		this.grants.clear();
	}
	digestKey(token) {
		return createHash("sha256").update(token, "utf8").digest("hex");
	}
	readMonotonicNow() {
		const now = this.dependencies.monotonicNow();
		if (!Number.isFinite(now) || this.lastMonotonicNow !== void 0 && now < this.lastMonotonicNow) {
			this.grants.clear();
			return;
		}
		this.lastMonotonicNow = now;
		return now;
	}
	deadlineFrom(now, ttlMs) {
		if (ttlMs === 0) return void 0;
		const deadline = now + ttlMs;
		return Number.isFinite(deadline) && deadline > now ? deadline : void 0;
	}
	displayExpiresAt(wallNow, ttlMs) {
		return ttlMs === 0 ? 0 : wallNow + ttlMs;
	}
};
//#endregion
//#region src/host/bindings/mutations.ts
function missingGroup(groupId) {
	return /* @__PURE__ */ new TypeError(`Missing password group: ${groupId}`);
}
function assertBinding(binding, state) {
	if (binding.targetId.length === 0) throw new TypeError("Binding target id must not be empty");
	if (binding.targetType === "workspace") {
		if (binding.mode !== "direct") throw new TypeError("Workspace binding must use direct mode");
		if (binding.workspaceId !== void 0) throw new TypeError("Workspace binding must not include workspaceId");
	}
	if (binding.mode === "direct") {
		if (binding.passwordGroupId === void 0) throw new TypeError("Direct binding requires a password group id");
		if (state.groups[binding.passwordGroupId] === void 0) throw missingGroup(binding.passwordGroupId);
		return;
	}
	if (binding.passwordGroupId !== void 0) throw new TypeError(`${binding.mode} binding must not include a password group id`);
}
function replaceBinding(bindings, replacement) {
	const matches = (binding) => binding.targetType === replacement.targetType && binding.targetId === replacement.targetId;
	const firstIndex = bindings.findIndex(matches);
	if (firstIndex === -1) return [...bindings, replacement];
	return bindings.flatMap((binding, index) => {
		if (!matches(binding)) return [binding];
		return index === firstIndex ? [replacement] : [];
	});
}
function deleteGroup(state, mutation, now) {
	if (state.groups[mutation.groupId] === void 0) throw missingGroup(mutation.groupId);
	const targetGroupId = mutation.moveToGroupId;
	const movesMembers = targetGroupId !== void 0;
	if (movesMembers === (mutation.removeProtection === true)) throw new TypeError("Group deletion requires exactly one of moveToGroupId or removeProtection");
	if (movesMembers) {
		if (targetGroupId === mutation.groupId) throw new TypeError("Group deletion cannot migrate members to the group being deleted");
		if (state.groups[targetGroupId] === void 0) throw missingGroup(targetGroupId);
	}
	const groups = { ...state.groups };
	delete groups[mutation.groupId];
	let bindings;
	if (movesMembers) {
		const updatedAt = now();
		bindings = state.bindings.map((binding) => binding.passwordGroupId === mutation.groupId ? {
			...binding,
			passwordGroupId: targetGroupId,
			updatedAt
		} : binding);
	} else bindings = state.bindings.filter((binding) => binding.passwordGroupId !== mutation.groupId);
	return {
		...state,
		revision: state.revision + 1,
		groups,
		bindings
	};
}
function applyBindingMutation(state, mutation, now) {
	if (mutation.kind === "delete-group") return deleteGroup(state, mutation, now);
	if (mutation.kind === "replace") {
		assertBinding(mutation.binding, state);
		return {
			...state,
			revision: state.revision + 1,
			bindings: replaceBinding(state.bindings, mutation.binding)
		};
	}
	return {
		...state,
		revision: state.revision + 1,
		bindings: state.bindings.filter((binding) => !(binding.targetType === mutation.targetType && binding.targetId === mutation.targetId))
	};
}
//#endregion
//#region src/host/bindings/resolver.ts
function directGroup(binding) {
	if (binding?.mode !== "direct") return void 0;
	return binding.passwordGroupId;
}
function resolveSessionProtection(sessionId, workspaceId, bindings) {
	const sessionBindings = bindings.filter((binding) => binding.targetType === "session" && binding.targetId === sessionId);
	const sessionGroupId = directGroup(sessionBindings.find((binding) => binding.mode === "direct"));
	if (sessionGroupId !== void 0) return {
		protected: true,
		groupId: sessionGroupId,
		source: "session"
	};
	if (sessionBindings.some((binding) => binding.mode === "no-inherit")) return { protected: false };
	if (workspaceId !== void 0) {
		const workspaceGroupId = directGroup(bindings.find((binding) => binding.targetType === "workspace" && binding.targetId === workspaceId && binding.mode === "direct"));
		if (workspaceGroupId !== void 0) return {
			protected: true,
			groupId: workspaceGroupId,
			source: "workspace"
		};
	}
	return { protected: false };
}
//#endregion
//#region src/host/service.ts
const SAFE_ERROR = {
	ok: false,
	error: {
		code: "operation-failed",
		message: "Vault operation failed"
	}
};
function failed(code, retryAt) {
	return {
		ok: false,
		error: {
			code,
			message: code === "cooldown" ? "Too many attempts" : code === "invalid-credentials" ? "Invalid credentials" : code === "revision-conflict" ? "Vault revision changed" : code === "weak-password" ? "Password does not meet the configured strength policy" : "Vault operation failed",
			...retryAt === void 0 ? {} : { retryAt }
		}
	};
}
function deepFreeze(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) deepFreeze(child);
	}
	return value;
}
var VaultService = class {
	repository;
	#policy;
	grants;
	attempts;
	#now;
	#wallNow;
	#state;
	#lastTouch = /* @__PURE__ */ new Map();
	constructor(dependencies) {
		this.repository = dependencies.repository;
		this.#policy = deepFreeze(dependencies.policy);
		this.grants = dependencies.grants ?? new InMemoryGrantStore();
		this.attempts = dependencies.attempts ?? new FailedAttemptStore();
		this.#now = dependencies.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
		this.#wallNow = dependencies.wallNow ?? (() => Date.now());
	}
	get policy() {
		return this.#policy;
	}
	setPolicy(policy) {
		this.#policy = deepFreeze(policy);
		this.attempts.setPolicy(policy.failedAttemptProtection);
	}
	async snapshot() {
		return this.redacted(await this.state());
	}
	async handle(request) {
		try {
			await this.state();
			switch (request.action) {
				case "snapshot": return {
					ok: true,
					value: await this.snapshot()
				};
				case "unlock": return await this.unlock(request.clientInstanceId, request.groupId, request.password);
				case "grants-validate": return {
					ok: true,
					value: this.validateGrants(request.clientInstanceId, request.grants)
				};
				case "activity-touch": return {
					ok: true,
					value: this.touchActivity(request.clientInstanceId, request.grants)
				};
				case "lock-group": return this.lockGroup(request.clientInstanceId, request.groupId);
				case "lock-all": return this.lockAll(request.clientInstanceId);
				case "group-create": return await this.createGroup(request.clientInstanceId, request.expectedRevision, request.grants, request.input);
				case "group-change-password": return await this.changePassword(request.clientInstanceId, request.expectedRevision, request.input);
				case "group-recover": return await this.recoverGroup(request.clientInstanceId, request.expectedRevision, request.input);
				case "bindings-update": return await this.updateBindings(request.clientInstanceId, request.expectedRevision, request.grants, request.input);
			}
		} catch {
			return SAFE_ERROR;
		}
	}
	validateGrants(clientInstanceId, proofs) {
		const state = this.#state;
		if (!state || proofs.length === 0) return { valid: false };
		return { valid: proofs.every((proof) => {
			const group = state.groups[proof.groupId];
			return group !== void 0 && proof.credentialVersion === group.credentialVersion && this.grants.authorize(proof.token, group.id, group.credentialVersion, clientInstanceId);
		}) };
	}
	touchActivity(clientInstanceId, proofs) {
		if (!this.validateGrants(clientInstanceId, proofs).valid) return {
			valid: false,
			touched: false
		};
		const now = this.#wallNow();
		const last = this.#lastTouch.get(clientInstanceId);
		if (last !== void 0 && Number.isFinite(now) && now - last < 6e4) return {
			valid: true,
			touched: false
		};
		const state = this.#state;
		if (!state) return {
			valid: false,
			touched: false
		};
		const touched = proofs.every((proof) => {
			const group = state.groups[proof.groupId];
			return group !== void 0 && this.grants.touch(proof.token, group.id, group.credentialVersion, clientInstanceId, this.ttlMs()).authorized;
		});
		if (touched) this.#lastTouch.set(clientInstanceId, now);
		return {
			valid: touched,
			touched
		};
	}
	lockGroup(clientInstanceId, groupId) {
		this.grants.revokeGroupForClient(groupId, clientInstanceId);
		return {
			ok: true,
			value: null
		};
	}
	lockAll(clientInstanceId) {
		this.grants.revokeClient(clientInstanceId);
		this.#lastTouch.delete(clientInstanceId);
		return {
			ok: true,
			value: null
		};
	}
	dispose() {
		this.invalidateVolatileState();
	}
	invalidateVolatileState() {
		this.grants.clear();
		this.attempts.clear();
		this.#lastTouch.clear();
		this.#state = void 0;
	}
	async unlock(clientInstanceId, groupId, password) {
		const group = (await this.state()).groups[groupId];
		if (!group) return failed("invalid-credentials");
		const availability = this.attempts.check(groupId, clientInstanceId, this.policy.failedAttemptProtection);
		if (availability.kind === "cooldown") return failed("cooldown", availability.retryAt);
		let valid = false;
		try {
			valid = await verifySecret(password, group.password);
		} catch {
			valid = false;
		}
		if (!valid) {
			const decision = this.attempts.recordFailure(groupId, clientInstanceId, this.policy.failedAttemptProtection);
			await this.safeAudit({
				action: "unlock",
				groupId,
				clientInstanceId,
				credentialVersion: group.credentialVersion,
				result: "denied",
				reasonCode: decision.kind === "cooldown" ? "cooldown" : "invalid-credentials"
			});
			return decision.kind === "cooldown" ? failed("cooldown", decision.retryAt) : failed("invalid-credentials");
		}
		this.attempts.recordSuccess(groupId, clientInstanceId);
		try {
			const grant = this.grants.issue(group.id, group.credentialVersion, clientInstanceId, this.ttlMs());
			const result = {
				grant: {
					groupId: grant.groupId,
					credentialVersion: grant.credentialVersion,
					token: grant.token
				},
				expiresAt: grant.expiresAt
			};
			await this.safeAudit({
				action: "unlock",
				groupId: group.id,
				clientInstanceId,
				credentialVersion: group.credentialVersion,
				result: "success"
			});
			return {
				ok: true,
				value: result
			};
		} catch {
			return SAFE_ERROR;
		}
	}
	async createGroup(clientInstanceId, expectedRevision, proofs, input) {
		const state = await this.state();
		if (passwordPolicyError(input.password, this.policy.passwordPolicy) !== void 0) return failed("weak-password");
		if (state.revision !== expectedRevision) return failed("revision-conflict");
		if (Object.values(state.groups).some((group) => group.name === input.name)) return failed("duplicate-name");
		if (input.bindings.some((binding) => binding.targetType === "session" && binding.mode === "direct" && state.bindings.some((candidate) => candidate.targetType === "workspace" && candidate.mode === "direct" && (binding.workspaceId === void 0 || candidate.targetId === binding.workspaceId)))) return failed("invalid-binding");
		const now = this.#now();
		const id = "group-" + randomUUID();
		const recoveryKey = generateRecoveryKey();
		const group = {
			id,
			name: input.name,
			password: await createVerifier(input.password, this.policy.passwordPolicy),
			recovery: {
				...await createVerifier(recoveryKey),
				generatedAt: now
			},
			credentialVersion: 1,
			createdAt: now,
			updatedAt: now
		};
		let next = {
			...state,
			revision: expectedRevision,
			groups: {
				...state.groups,
				[id]: group
			},
			bindings: state.bindings
		};
		const affectedGroups = /* @__PURE__ */ new Set();
		for (const candidate of input.bindings) {
			const binding = candidate.mode === "direct" ? {
				...candidate,
				passwordGroupId: candidate.passwordGroupId ?? id
			} : candidate;
			if (binding.mode === "direct" && binding.passwordGroupId !== id) return failed("invalid-binding");
			const mutation = {
				kind: "replace",
				binding
			};
			const updated = applyBindingMutation(next, mutation, () => now);
			for (const groupId of this.bindingAffectedGroups(next, updated, mutation, state)) if (state.groups[groupId] !== void 0) affectedGroups.add(groupId);
			next = updated;
		}
		if (!this.authorizeAffectedGroups(state, affectedGroups, clientInstanceId, proofs)) return failed("invalid-credentials");
		next = {
			...next,
			revision: expectedRevision + 1
		};
		const committed = await this.commit(expectedRevision, next);
		if (committed === "conflict") return failed("revision-conflict");
		if (committed === "failed") return failed("persistence-failed");
		for (const groupId of affectedGroups) this.grants.revokeGroup(groupId);
		await this.safeAudit({
			action: "group-created",
			groupId: id,
			credentialVersion: group.credentialVersion,
			revision: next.revision,
			result: "success"
		});
		return {
			ok: true,
			value: {
				snapshot: this.redacted(next),
				recoveryKey
			}
		};
	}
	async changePassword(clientInstanceId, expectedRevision, input) {
		const state = await this.state();
		if (passwordPolicyError(input.newPassword, this.policy.passwordPolicy) !== void 0) return failed("weak-password");
		if (state.revision !== expectedRevision) return failed("revision-conflict");
		const group = state.groups[input.groupId];
		if (!group) return failed("invalid-credentials");
		const availability = this.attempts.check(group.id, clientInstanceId, this.policy.failedAttemptProtection);
		if (availability.kind === "cooldown") return failed("cooldown", availability.retryAt);
		let valid = false;
		try {
			valid = await this.authorizeCredential(group, input);
		} catch {
			valid = false;
		}
		if (!valid) {
			const decision = this.attempts.recordFailure(group.id, clientInstanceId, this.policy.failedAttemptProtection);
			return decision.kind === "cooldown" ? failed("cooldown", decision.retryAt) : failed("invalid-credentials");
		}
		const now = this.#now();
		const recoveryKey = input.rotateRecovery ? generateRecoveryKey() : void 0;
		const nextGroup = {
			...group,
			password: await createVerifier(input.newPassword, this.policy.passwordPolicy),
			recovery: input.rotateRecovery ? {
				...await createVerifier(recoveryKey),
				generatedAt: now
			} : group.recovery,
			credentialVersion: group.credentialVersion + 1,
			updatedAt: now
		};
		const next = {
			...state,
			revision: expectedRevision + 1,
			groups: {
				...state.groups,
				[group.id]: nextGroup
			}
		};
		const committed = await this.commit(expectedRevision, next);
		if (committed === "conflict") return failed("revision-conflict");
		if (committed === "failed") return failed("persistence-failed");
		this.grants.revokeGroup(group.id);
		this.attempts.recordSuccess(group.id, clientInstanceId);
		await this.safeAudit({
			action: "password-changed",
			groupId: group.id,
			credentialVersion: nextGroup.credentialVersion,
			revision: next.revision,
			result: "success"
		});
		return {
			ok: true,
			value: {
				snapshot: this.redacted(next),
				...recoveryKey === void 0 ? {} : { recoveryKey }
			}
		};
	}
	async recoverGroup(clientInstanceId, expectedRevision, input) {
		const state = await this.state();
		if (passwordPolicyError(input.newPassword, this.policy.passwordPolicy) !== void 0) return failed("weak-password");
		if (state.revision !== expectedRevision) return failed("revision-conflict");
		const group = state.groups[input.groupId];
		if (!group) return failed("invalid-credentials");
		const availability = this.attempts.check(group.id, clientInstanceId, this.policy.failedAttemptProtection);
		if (availability.kind === "cooldown") return failed("cooldown", availability.retryAt);
		let valid = false;
		try {
			valid = await verifySecret(input.recoveryKey, group.recovery);
		} catch {
			valid = false;
		}
		if (!valid) {
			const decision = this.attempts.recordFailure(group.id, clientInstanceId, this.policy.failedAttemptProtection);
			return decision.kind === "cooldown" ? failed("cooldown", decision.retryAt) : failed("invalid-credentials");
		}
		const now = this.#now();
		const recoveryKey = generateRecoveryKey();
		const nextGroup = {
			...group,
			password: await createVerifier(input.newPassword, this.policy.passwordPolicy),
			recovery: {
				...await createVerifier(recoveryKey),
				generatedAt: now,
				lastVerifiedAt: now
			},
			credentialVersion: group.credentialVersion + 1,
			updatedAt: now
		};
		const next = {
			...state,
			revision: expectedRevision + 1,
			groups: {
				...state.groups,
				[group.id]: nextGroup
			}
		};
		const committed = await this.commit(expectedRevision, next);
		if (committed === "conflict") return failed("revision-conflict");
		if (committed === "failed") return failed("persistence-failed");
		this.grants.revokeGroup(group.id);
		this.attempts.recordSuccess(group.id, clientInstanceId);
		await this.safeAudit({
			action: "group-recovered",
			groupId: group.id,
			credentialVersion: nextGroup.credentialVersion,
			revision: next.revision,
			result: "success"
		});
		return {
			ok: true,
			value: {
				snapshot: this.redacted(next),
				recoveryKey
			}
		};
	}
	async updateBindings(clientInstanceId, expectedRevision, proofs, mutation) {
		const state = await this.state();
		if (state.revision !== expectedRevision) return failed("revision-conflict");
		const committed = {
			...applyBindingMutation(state, mutation, this.#now),
			revision: expectedRevision + 1
		};
		const affectedGroups = this.bindingAffectedGroups(state, committed, mutation);
		if (!this.authorizeAffectedGroups(state, affectedGroups, clientInstanceId, proofs)) return failed("invalid-credentials");
		const commitResult = await this.commit(expectedRevision, committed);
		if (commitResult === "conflict") return failed("revision-conflict");
		if (commitResult === "failed") return failed("persistence-failed");
		for (const groupId of affectedGroups) this.grants.revokeGroup(groupId);
		if (mutation.kind === "delete-group") {
			this.attempts.resetGroup(mutation.groupId);
			if (mutation.moveToGroupId !== void 0) await this.safeAudit({
				action: "members-migrated",
				groupId: mutation.groupId,
				revision: committed.revision,
				result: "success",
				count: state.bindings.filter((binding) => binding.passwordGroupId === mutation.groupId).length
			});
		}
		return {
			ok: true,
			value: this.redacted(committed)
		};
	}
	authorizeAffectedGroups(state, groupIds, clientInstanceId, proofs) {
		for (const groupId of groupIds) {
			const group = state.groups[groupId];
			if (group === void 0) continue;
			if (!proofs.some((proof) => proof.groupId === group.id && proof.credentialVersion === group.credentialVersion && this.grants.authorize(proof.token, group.id, group.credentialVersion, clientInstanceId))) return false;
		}
		return true;
	}
	bindingAffectedGroups(state, next, mutation, authorizationState = state) {
		const affected = /* @__PURE__ */ new Set();
		if (mutation.kind === "delete-group") {
			affected.add(mutation.groupId);
			if (mutation.moveToGroupId !== void 0) affected.add(mutation.moveToGroupId);
			return affected;
		}
		const targetType = mutation.kind === "replace" ? mutation.binding.targetType : mutation.targetType;
		const targetId = mutation.kind === "replace" ? mutation.binding.targetId : mutation.targetId;
		if (targetType === "workspace") {
			const collect = (candidate) => {
				for (const binding of candidate.bindings) {
					if (binding.targetType === "workspace" && binding.targetId === targetId && binding.mode === "direct" && binding.passwordGroupId !== void 0) affected.add(binding.passwordGroupId);
					if (binding.targetType !== "session" || binding.workspaceId !== targetId) continue;
					const protection = resolveSessionProtection(binding.targetId, binding.workspaceId, candidate.bindings);
					if (protection.protected && protection.source === "workspace") affected.add(protection.groupId);
				}
			};
			collect(state);
			collect(next);
			return affected;
		}
		const oldBinding = state.bindings.find((binding) => binding.targetType === "session" && binding.targetId === targetId);
		const newBinding = next.bindings.find((binding) => binding.targetType === "session" && binding.targetId === targetId);
		if (oldBinding?.mode === "direct" && oldBinding.passwordGroupId !== void 0) affected.add(oldBinding.passwordGroupId);
		if (newBinding?.mode === "direct" && newBinding.passwordGroupId !== void 0) affected.add(newBinding.passwordGroupId);
		if ((oldBinding?.mode ?? "absent") !== (newBinding?.mode ?? "absent")) {
			for (const binding of authorizationState.bindings) if (binding.targetType === "workspace" && binding.mode === "direct" && binding.passwordGroupId !== void 0) affected.add(binding.passwordGroupId);
		}
		return affected;
	}
	async authorizeCredential(group, input) {
		if (input.currentPassword !== void 0) return verifySecret(input.currentPassword, group.password);
		if (input.recoveryKey !== void 0) return verifySecret(input.recoveryKey, group.recovery);
		return false;
	}
	ttlMs() {
		return this.policy.autoLockMinutes === 0 ? 0 : this.policy.autoLockMinutes * 6e4;
	}
	async state() {
		return this.refreshState();
	}
	async refreshState() {
		let loaded;
		try {
			loaded = await this.repository.load();
		} catch (error) {
			this.invalidateVolatileState();
			throw error;
		}
		const previous = this.#state;
		if (previous === void 0) {
			this.#state = loaded;
			return loaded;
		}
		if (loaded.revision < previous.revision || loaded.revision === previous.revision && !isDeepStrictEqual(loaded, previous)) {
			this.invalidateVolatileState();
			throw new Error("Vault state refresh is not monotonic");
		}
		if (loaded.revision > previous.revision) this.reconcileExternalState(previous, loaded);
		this.#state = loaded;
		return loaded;
	}
	reconcileExternalState(previous, next) {
		this.grants.clear();
		const groupIds = /* @__PURE__ */ new Set([...Object.keys(previous.groups), ...Object.keys(next.groups)]);
		for (const groupId of groupIds) {
			const previousGroup = previous.groups[groupId];
			const nextGroup = next.groups[groupId];
			const previousBindings = previous.bindings.filter((binding) => binding.passwordGroupId === groupId);
			const nextBindings = next.bindings.filter((binding) => binding.passwordGroupId === groupId);
			if (nextGroup === void 0 || previousGroup?.credentialVersion !== nextGroup.credentialVersion || JSON.stringify(previousBindings) !== JSON.stringify(nextBindings)) this.grants.revokeGroup(groupId);
		}
	}
	async commit(expectedRevision, next) {
		try {
			if (!(await this.repository.commit(expectedRevision, next)).ok) {
				this.invalidateVolatileState();
				await this.refreshState();
				return "conflict";
			}
			this.#state = next;
			return "ok";
		} catch {
			return "failed";
		}
	}
	async audit(fields) {
		await this.repository.appendAudit({
			timestamp: this.#now(),
			...fields
		});
	}
	async safeAudit(fields) {
		try {
			await this.audit(fields);
		} catch {}
	}
	redacted(state) {
		return deepFreeze({
			revision: state.revision,
			policy: this.policy,
			groups: Object.values(state.groups).map((group) => ({
				id: group.id,
				name: group.name,
				credentialVersion: group.credentialVersion,
				recoveryConfigured: true,
				recoveryGeneratedAt: group.recovery.generatedAt,
				...group.recovery.lastVerifiedAt === void 0 ? {} : { recoveryLastVerifiedAt: group.recovery.lastVerifiedAt },
				memberCount: state.bindings.filter((binding) => binding.passwordGroupId === group.id).length
			})),
			bindings: [...state.bindings]
		});
	}
};
//#endregion
//#region src/host/settings.ts
const DEFAULT_VAULT_POLICY = Object.freeze(VaultPolicySchema({}));
function createVaultPolicySettings(service) {
	return { onChange: (policy) => service.setPolicy(policy) };
}
function installVaultPolicySettings(ctx, service, entry = DEFAULT_VAULT_POLICY) {
	let source = () => entry;
	const controller = createVaultPolicySettings(service);
	installSettingsSection(ctx, settingsNamespace("dsh-vault"), VaultPolicySchema, entry, {
		setSource: (current) => {
			source = current;
		},
		onChange: () => controller.onChange(source())
	});
	controller.onChange(source());
}
//#endregion
//#region src/index.ts
const inject = ["webServer"];
const name = "dsh-vault";
function apply(ctx, config) {
	const stateDirectory = resolveStateDirectory(config.stateDir);
	const service = new VaultService({
		repository: new VaultStateRepository(stateDirectory),
		policy: DEFAULT_VAULT_POLICY
	});
	installVaultPolicySettings(ctx, service);
	ctx.provide("vault", service);
	ctx.effect(() => {
		const disposeRoute = ctx.webServer.register({
			kind: "exact",
			path: "/dsh-vault/api",
			handler: createVaultApiHandler(service)
		});
		return () => {
			disposeRoute();
			service.dispose();
		};
	}, "dsh-vault/api");
}
apply.inject = inject;
//#endregion
export { Config, ConfigSchema, DEFAULT_VAULT_POLICY, VaultPolicySchema, apply, createVaultPolicySettings, inject, installVaultPolicySettings, name, resolveStateDirectory };

//# sourceMappingURL=index.js.map