#!/usr/bin/env node
import { a as resolveStateDirectory, t as VaultStateRepository } from "./repository-BXZ0A9Qk.js";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
//#region src/cli.ts
var MemoryRepository = class {
	state;
	audit;
	constructor(state) {
		this.state = state;
	}
	async load() {
		return this.state;
	}
	async commit(expectedRevision, next) {
		if (this.state.revision !== expectedRevision) return {
			ok: false,
			code: "revision-conflict"
		};
		this.state = next;
		return {
			ok: true,
			revision: next.revision
		};
	}
	async appendAudit(event) {
		this.audit = event;
	}
	async commitWithAudit(expectedRevision, next, attempt, success) {
		this.audit = attempt;
		if (this.state.revision !== expectedRevision) return {
			ok: false,
			code: "revision-conflict"
		};
		const previous = this.state;
		this.state = next;
		try {
			this.audit = success;
		} catch (error) {
			this.state = previous;
			throw error;
		}
		return {
			ok: true,
			revision: next.revision
		};
	}
};
async function firstInputLine(input) {
	if (input !== void 0 && Symbol.asyncIterator in Object(input)) {
		const next = await input[Symbol.asyncIterator]().next();
		return next.done ? void 0 : String(next.value).trim();
	}
	const source = input;
	if (source === void 0) return void 0;
	const reader = createInterface({ input: source });
	try {
		for await (const line of reader) return line.trim();
		return;
	} finally {
		reader.close();
	}
}
function parseGroupId(argv) {
	return parseArguments(argv)?.groupId;
}
function parseArguments(argv) {
	if (argv[0] !== "protection" || argv[1] !== "remove") return void 0;
	let groupId;
	let stateDir;
	for (let index = 2; index < argv.length; index += 1) {
		const option = argv[index];
		const value = argv[index + 1];
		if ((option === "--group" || option === "--state-dir") && (value === void 0 || value.startsWith("--"))) return void 0;
		if (option === "--group" && groupId === void 0) {
			groupId = value;
			index += 1;
			continue;
		}
		if (option === "--state-dir" && stateDir === void 0) {
			stateDir = value;
			index += 1;
			continue;
		}
		return;
	}
	return groupId === void 0 || groupId.length === 0 ? void 0 : {
		groupId,
		...stateDir === void 0 ? {} : { stateDir }
	};
}
function failure(exitCode, output = "") {
	return {
		exitCode,
		output,
		error: "Vault operation failed.\n"
	};
}
function isCliEntrypoint(moduleUrl, argv1 = process.argv[1]) {
	if (argv1 === void 0) return false;
	const modulePath = fileURLToPath(moduleUrl);
	try {
		return realpathSync(modulePath) === realpathSync(argv1);
	} catch {
		return resolve(modulePath) === resolve(argv1);
	}
}
async function runCli(argv, options = {}) {
	try {
		const parsed = parseArguments(argv);
		const groupId = parsed?.groupId ?? parseGroupId(argv);
		if (groupId === void 0) return failure(2);
		const memoryRepository = options.state === void 0 ? void 0 : new MemoryRepository(options.state);
		const repository = options.repository ?? memoryRepository ?? new VaultStateRepository(resolveStateDirectory(parsed?.stateDir ?? options.stateDir, options.environment));
		const now = options.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
		const state = await repository.load();
		const group = state.groups[groupId];
		if (group === void 0) {
			const result = failure(2);
			return memoryRepository === void 0 ? result : {
				...result,
				state: memoryRepository.state
			};
		}
		const memberCount = state.bindings.filter((binding) => binding.passwordGroupId === groupId).length;
		const output = "Group: " + group.name + "\nMembers: " + memberCount + "\nType the full group ID to confirm: ";
		if (await firstInputLine(options.stdin ?? process.stdin) !== groupId) {
			const result = failure(2, output);
			return memoryRepository === void 0 ? result : {
				...result,
				state: memoryRepository.state
			};
		}
		const attemptAudit = {
			timestamp: now(),
			action: "protection-removal-attempt",
			groupId,
			count: memberCount,
			reasonCode: "pending-commit"
		};
		const next = {
			...state,
			revision: state.revision + 1,
			bindings: state.bindings.filter((binding) => binding.passwordGroupId !== groupId)
		};
		const audit = {
			timestamp: now(),
			action: "protection-removed",
			groupId,
			count: memberCount,
			revision: next.revision,
			result: "success"
		};
		if (repository.commitWithAudit === void 0) {
			await repository.appendAudit(attemptAudit);
			return failure(1, output);
		}
		if (!(await repository.commitWithAudit(state.revision, next, attemptAudit, audit)).ok) {
			const result = failure(1, output);
			return memoryRepository === void 0 ? result : {
				...result,
				state: memoryRepository.state
			};
		}
		return {
			exitCode: 0,
			output: output + "\nProtection removed.\n",
			error: "",
			...memoryRepository === void 0 ? {} : {
				state: memoryRepository.state,
				audit: memoryRepository.audit
			}
		};
	} catch {
		return failure(1);
	}
}
async function main(argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr) {
	const result = await runCli(argv);
	if (result.output) stdout.write(result.output);
	if (result.error) stderr.write(result.error);
	return result.exitCode;
}
if (isCliEntrypoint(import.meta.url)) main().then((exitCode) => {
	process.exitCode = exitCode;
});
//#endregion
export { isCliEntrypoint, main, runCli };

//# sourceMappingURL=cli.js.map