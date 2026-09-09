import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";
//#region node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.3/node_modules/@deepseek-ai/cosmokit/lib/index.js
/** Return true when a value is `null` or `undefined`. */
function isNullable(value) {
	return value === null || value === void 0;
}
/** Return true for non-array object values. */
function isPlainObject(data) {
	return data && typeof data === "object" && !Array.isArray(data);
}
/** Filter object entries and return a new object. */
function filterKeys(object, filter) {
	return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
/** Map object values while preserving the original key set. */
function mapValues(object, transform) {
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
/** Pick selected keys from an object, optionally including `undefined` values. */
function pick(source, keys, forced) {
	if (!keys) return { ...source };
	const result = {};
	for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
	return result;
}
/** Test values using `instanceof` with a `toStringTag` fallback. */
function is(type, value) {
	if (arguments.length === 1) return (value) => is(type, value);
	return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
	return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
	return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
/** Binary source detection and base64/hex conversion helpers. */
var Binary;
(function(Binary) {
	Binary.is = isArrayBufferLike;
	Binary.isSource = isArrayBufferSource;
	function fromSource(source) {
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		else return source;
	}
	Binary.fromSource = fromSource;
	function toBase64(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
		let binary = "";
		const bytes = new Uint8Array(source);
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}
	Binary.toBase64 = toBase64;
	function fromBase64(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
		return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
	}
	Binary.fromBase64 = fromBase64;
	function toHex(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
		return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	Binary.toHex = toHex;
	function fromHex(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
		const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
		const buffer = [];
		for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
		return Uint8Array.from(buffer).buffer;
	}
	Binary.fromHex = fromHex;
})(Binary || (Binary = {}));
Binary.fromBase64;
Binary.toBase64;
Binary.fromHex;
Binary.toHex;
/** Deep-clone common JavaScript values while preserving prototypes and cycles. */
function clone(source, refs = /* @__PURE__ */ new Map()) {
	if (!source || typeof source !== "object") return source;
	if (is("Date", source)) return new Date(source.valueOf());
	if (is("RegExp", source)) return new RegExp(source.source, source.flags);
	if (isArrayBufferLike(source)) return source.slice(0);
	if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
	const cached = refs.get(source);
	if (cached) return cached;
	if (Array.isArray(source)) {
		const result = [];
		refs.set(source, result);
		source.forEach((value, index) => {
			result[index] = Reflect.apply(clone, null, [value, refs]);
		});
		return result;
	}
	const result = Object.create(Object.getPrototypeOf(source));
	refs.set(source, result);
	for (const key of Reflect.ownKeys(source)) {
		const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
		if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
		Reflect.defineProperty(result, key, descriptor);
	}
	return result;
}
/** Deeply compare arrays, dates, regexps, buffers, and plain object fields. */
function deepEqual(a, b, strict) {
	if (a === b) return true;
	if (!strict && isNullable(a) && isNullable(b)) return true;
	if (typeof a !== typeof b) return false;
	if (typeof a !== "object") return false;
	if (!a || !b) return false;
	function check(test, then) {
		return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
	}
	return check(Array.isArray, (a, b) => a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
		if (a.byteLength !== b.byteLength) return false;
		const viewA = new Uint8Array(a);
		const viewB = new Uint8Array(b);
		for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
		return true;
	}) ?? Object.keys({
		...a,
		...b
	}).every((key) => deepEqual(a[key], b[key], strict));
}
/** Time constants plus parsing and formatting helpers. */
var Time;
(function(Time) {
	Time.millisecond = 1;
	Time.second = 1e3;
	Time.minute = Time.second * 60;
	Time.hour = Time.minute * 60;
	Time.day = Time.hour * 24;
	Time.week = Time.day * 7;
	let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
	function setTimezoneOffset(offset) {
		timezoneOffset = offset;
	}
	Time.setTimezoneOffset = setTimezoneOffset;
	function getTimezoneOffset() {
		return timezoneOffset;
	}
	Time.getTimezoneOffset = getTimezoneOffset;
	function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
		if (typeof date === "number") date = new Date(date);
		if (offset === void 0) offset = timezoneOffset;
		return Math.floor((date.valueOf() / Time.minute - offset) / 1440);
	}
	Time.getDateNumber = getDateNumber;
	function fromDateNumber(value, offset) {
		const date = new Date(value * Time.day);
		if (offset === void 0) offset = timezoneOffset;
		return new Date(+date + offset * Time.minute);
	}
	Time.fromDateNumber = fromDateNumber;
	const numeric = /\d+(?:\.\d+)?/.source;
	const timeRegExp = new RegExp(`^${[
		"w(?:eek(?:s)?)?",
		"d(?:ay(?:s)?)?",
		"h(?:our(?:s)?)?",
		"m(?:in(?:ute)?(?:s)?)?",
		"s(?:ec(?:ond)?(?:s)?)?"
	].map((unit) => `(${numeric}${unit})?`).join("")}$`);
	function parseTime(source) {
		const capture = timeRegExp.exec(source);
		if (!capture) return 0;
		return (parseFloat(capture[1]) * Time.week || 0) + (parseFloat(capture[2]) * Time.day || 0) + (parseFloat(capture[3]) * Time.hour || 0) + (parseFloat(capture[4]) * Time.minute || 0) + (parseFloat(capture[5]) * Time.second || 0);
	}
	Time.parseTime = parseTime;
	function parseDate(date) {
		const parsed = parseTime(date);
		if (parsed) date = Date.now() + parsed;
		else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
		else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
		return date ? new Date(date) : /* @__PURE__ */ new Date();
	}
	Time.parseDate = parseDate;
	function format(ms) {
		const abs = Math.abs(ms);
		if (abs >= Time.day - Time.hour / 2) return Math.round(ms / Time.day) + "d";
		else if (abs >= Time.hour - Time.minute / 2) return Math.round(ms / Time.hour) + "h";
		else if (abs >= Time.minute - Time.second / 2) return Math.round(ms / Time.minute) + "m";
		else if (abs >= Time.second) return Math.round(ms / Time.second) + "s";
		return ms + "ms";
	}
	Time.format = format;
	function toDigits(source, length = 2) {
		return source.toString().padStart(length, "0");
	}
	Time.toDigits = toDigits;
	function template(template, time = /* @__PURE__ */ new Date()) {
		return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
	}
	Time.template = template;
})(Time || (Time = {}));
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+schemastery@3.18.2/node_modules/@deepseek-ai/schemastery/lib/index.mjs
const kSchema = Symbol.for("schemastery");
const kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
	options;
	name = "ValidationError";
	constructor(message, options) {
		let prefix = "$";
		for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
		else if (typeof segment === "number") prefix += "[" + segment + "]";
		else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
		if (prefix.startsWith(".")) prefix = prefix.slice(1);
		super((prefix === "$" ? "" : `${prefix} `) + message);
		this.options = options;
	}
	static is(error) {
		return !!error?.[kValidationError];
	}
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
const Schema = function(options) {
	const schema = function(data, options = {}) {
		return Schema.resolve(data, schema, options)[0];
	};
	if (options.refs) {
		const refs = mapValues(options.refs, (options) => new Schema(options));
		const getRef = (uid) => refs[uid];
		for (const key in refs) {
			const options = refs[key];
			options.sKey = getRef(options.sKey);
			options.inner = getRef(options.inner);
			options.list = options.list && options.list.map(getRef);
			options.dict = options.dict && mapValues(options.dict, getRef);
		}
		return refs[options.uid];
	}
	Object.assign(schema, options);
	if (typeof schema.callback === "string") try {
		schema.callback = new Function("return " + schema.callback)();
	} catch {}
	Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
	Object.setPrototypeOf(schema, Schema.prototype);
	schema.meta ||= {};
	schema.toString = schema.toString.bind(schema);
	return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
	return {
		version: 1,
		vendor: "schemastery",
		validate: (value) => {
			try {
				return { value: Schema.resolve(value, this, {})[0] };
			} catch (error) {
				if (ValidationError.is(error)) return { issues: [{
					message: error.message,
					path: error.options.path
				}] };
				throw error;
			}
		}
	};
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
	if (globalThis.__schemastery_refs__) {
		globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
		return this.uid;
	}
	globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
	globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
	const result = {
		uid: this.uid,
		refs: globalThis.__schemastery_refs__
	};
	globalThis.__schemastery_refs__ = void 0;
	return result;
};
Schema.prototype.set = function set(key, value) {
	this.dict[key] = value;
	return this;
};
Schema.prototype.push = function push(value) {
	this.list.push(value);
	return this;
};
function mergeDesc(original, messages) {
	const result = typeof original === "string" ? { "": original } : { ...original };
	for (const locale in messages) {
		const value = messages[locale];
		if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
		else if (typeof value === "string") result[locale] = value;
	}
	return result;
}
function getInner(value) {
	return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
	return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
	const schema = Schema(this);
	const desc = mergeDesc(schema.meta.description, messages);
	if (Object.keys(desc).length) schema.meta.description = desc;
	if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
		return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
	});
	if (schema.list) schema.list = schema.list.map((inner, index) => {
		return inner.i18n(mapValues(messages, (data = {}) => {
			if (Array.isArray(getInner(data))) return getInner(data)[index];
			if (Array.isArray(data)) return data[index];
			return extractKeys(data);
		}));
	});
	if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
		if (getInner(data)) return getInner(data);
		return extractKeys(data);
	}));
	if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
	return schema;
};
Schema.prototype.extra = function extra(key, value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
};
for (const key of [
	"required",
	"disabled",
	"collapse",
	"hidden",
	"loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.deprecated = function deprecated() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "deprecated",
		type: "danger"
	});
	return schema;
};
Schema.prototype.experimental = function experimental() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "experimental",
		type: "warning"
	});
	return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
	const schema = Schema(this);
	const pattern = pick(regexp, ["source", "flags"]);
	schema.meta = {
		...schema.meta,
		pattern
	};
	return schema;
};
Schema.prototype.simplify = function simplify(value) {
	if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
	if (isNullable(value)) return value;
	if (this.type === "object" || this.type === "dict") {
		const result = {};
		for (const key in value) {
			const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
			if (this.type === "dict" || !isNullable(item)) result[key] = item;
		}
		if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
		return result;
	} else if (this.type === "array" || this.type === "tuple") {
		const result = [];
		value.forEach((value, index) => {
			const schema = this.type === "array" ? this.inner : this.list[index];
			const item = schema ? schema.simplify(value) : value;
			result.push(item);
		});
		return result;
	} else if (this.type === "intersect") {
		const result = {};
		for (const item of this.list) Object.assign(result, item.simplify(value));
		return result;
	} else if (this.type === "union") for (const schema of this.list) try {
		Schema.resolve(value, schema, {});
		return schema.simplify(value);
	} catch {}
	return value;
};
Schema.prototype.toString = function toString(inline) {
	return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		role,
		extra
	};
	return schema;
};
for (const key of [
	"default",
	"link",
	"comment",
	"description",
	"max",
	"min",
	"step"
]) Object.assign(Schema.prototype, { [key](value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
const resolvers = {};
Schema.extend = function extend(type, resolve) {
	resolvers[type] = resolve;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
	if (!schema) return [data];
	if (options.ignore?.(data, schema)) return [data];
	if (isNullable(data) && schema.type !== "lazy") {
		if (schema.meta.required) throw new ValidationError(`missing required value`, options);
		let current = schema;
		let fallback = schema.meta.default;
		while (current?.type === "intersect" && isNullable(fallback)) {
			current = current.list[0];
			fallback = current?.meta.default;
		}
		if (isNullable(fallback)) return [data];
		data = clone(fallback);
	}
	const callback = resolvers[schema.type];
	if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
	try {
		return callback(data, schema, options, strict);
	} catch (error) {
		if (!schema.meta.loose) throw error;
		return [schema.meta.default];
	}
};
Schema.from = function from(source) {
	if (isNullable(source)) return Schema.any();
	else if ([
		"string",
		"number",
		"boolean"
	].includes(typeof source)) return Schema.const(source).required();
	else if (source[kSchema]) return source;
	else if (typeof source === "function") switch (source) {
		case String: return Schema.string().required();
		case Number: return Schema.number().required();
		case Boolean: return Schema.boolean().required();
		case Function: return Schema.function().required();
		default: return Schema.is(source).required();
	}
	else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
	const toJSON = () => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
		}
		return schema.inner.toJSON();
	};
	const schema = new Schema({
		type: "lazy",
		builder,
		inner: { toJSON }
	});
	return schema;
};
Schema.natural = function natural() {
	return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
	return Schema.number().step(.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
	return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
		const date = new Date(value);
		if (isNaN(+date)) throw new ValidationError(`invalid date "${value}"`, options);
		return date;
	}, true)]);
};
Schema.regExp = function regExp(flag = "") {
	return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
		try {
			return new RegExp(value, flag);
		} catch (e) {
			throw new ValidationError(e.message, options);
		}
	}, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
	return Schema.union([
		Schema.is(ArrayBuffer),
		Schema.is(SharedArrayBuffer),
		Schema.transform(Schema.any(), (value, options) => {
			if (Binary.isSource(value)) return Binary.fromSource(value);
			throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
		}, true),
		...encoding ? [Schema.transform(Schema.string(), (value, options) => {
			try {
				return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)] : []
	]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
	if (!schema.inner[kSchema]) {
		schema.inner = schema.builder();
		schema.inner.meta = {
			...schema.meta,
			...schema.inner.meta
		};
	}
	return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
	return [data];
});
Schema.extend("never", (data, _, options) => {
	throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
	if (deepEqual(data, value)) return [value];
	throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
	const { max = Infinity, min = -Infinity } = meta;
	if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
	if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
	if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
	if (meta.pattern) {
		const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
		if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
	}
	checkWithinRange(data.length, meta, "string length", options);
	return [data];
});
function decimalShift(data, digits) {
	const str = data.toString();
	if (str.includes("e")) return data * Math.pow(10, digits);
	const index = str.indexOf(".");
	if (index === -1) return data * Math.pow(10, digits);
	const frac = str.slice(index + 1);
	const integer = str.slice(0, index);
	if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
	return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
	step = Math.abs(step);
	if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
	const index = step.toString().indexOf(".");
	const digits = step.toString().slice(index + 1).length;
	return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
	if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
	checkWithinRange(data, meta, "number", options);
	const { step } = meta;
	if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
	return [data];
});
Schema.extend("boolean", (data, _, options) => {
	if (typeof data === "boolean") return [data];
	throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
	let value = 0, keys = [];
	if (typeof data === "number") {
		value = data;
		for (const key in bits) if (data & bits[key]) keys.push(key);
	} else if (Array.isArray(data)) {
		keys = data;
		for (const key of keys) {
			if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
			if (key in bits) value |= bits[key];
		}
	} else throw new ValidationError(`expected number or array but got ${data}`, options);
	if (value === meta.default) return [value];
	return [value, keys];
});
Schema.extend("function", (data, _, options) => {
	if (typeof data === "function") return [data];
	throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
	if (typeof constructor === "function") {
		if (data instanceof constructor) return [data];
		throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
	} else {
		if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		let prototype = Object.getPrototypeOf(data);
		while (prototype) {
			if (prototype.constructor?.name === constructor) return [data];
			prototype = Object.getPrototypeOf(prototype);
		}
		throw new ValidationError(`expected ${constructor} but got ${data}`, options);
	}
});
function property(data, key, schema, options) {
	try {
		const [value, adapted] = Schema.resolve(data[key], schema, {
			...options,
			path: [...options.path || [], key]
		});
		if (adapted !== void 0) data[key] = adapted;
		return value;
	} catch (e) {
		if (!options?.autofix) throw e;
		delete data[key];
		return schema.meta.default;
	}
}
Schema.extend("array", (data, { inner, meta }, options) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
	return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in data) {
		let rKey;
		try {
			rKey = Schema.resolve(key, sKey, options)[0];
		} catch (error) {
			if (strict) continue;
			throw error;
		}
		result[rKey] = property(data, key, inner, options);
		data[rKey] = data[key];
		if (key !== rKey) delete data[key];
	}
	return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	const result = list.map((inner, index) => property(data, index, inner, options));
	if (strict) return [result];
	result.push(...data.slice(list.length));
	return [result];
});
function merge(result, data) {
	for (const key in data) {
		if (key in result) continue;
		result[key] = data[key];
	}
}
Schema.extend("object", (data, { dict }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in dict) {
		const value = property(data, key, dict[key], options);
		if (!isNullable(value) || key in data) result[key] = value;
	}
	if (!strict) merge(result, data);
	return [result];
});
Schema.extend("union", (data, { list, toString }, options, strict) => {
	const messages = [];
	for (const inner of list) try {
		return Schema.resolve(data, inner, options, strict);
	} catch (error) {
		messages.push(error);
	}
	throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString }, options, strict) => {
	if (!list.length) return [data];
	let result;
	for (const inner of list) {
		const value = Schema.resolve(data, inner, options, true)[0];
		if (isNullable(value)) continue;
		if (isNullable(result)) result = value;
		else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
		else if (typeof value === "object") merge(result ??= {}, value);
		else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
	}
	if (!strict && isPlainObject(data)) merge(result, data);
	return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
	const [result, adapted = data] = Schema.resolve(data, inner, options, true);
	if (preserve) return [callback(result)];
	else return [callback(result), callback(adapted)];
});
const formatters = {};
function defineMethod(name, keys, format) {
	formatters[name] = format;
	Object.assign(Schema, { [name](...args) {
		const schema = new Schema({ type: name });
		keys.forEach((key, index) => {
			switch (key) {
				case "sKey":
					schema.sKey = args[index] ?? Schema.string();
					break;
				case "inner":
					schema.inner = Schema.from(args[index]);
					break;
				case "list":
					schema.list = args[index].map(Schema.from);
					break;
				case "dict":
					schema.dict = mapValues(args[index], Schema.from);
					break;
				case "bits":
					schema.bits = {};
					for (const key in args[index]) {
						if (typeof args[index][key] !== "number") continue;
						schema.bits[key] = args[index][key];
					}
					break;
				case "callback": {
					const callback = schema.callback = args[index];
					callback["toJSON"] ||= () => callback.toString();
					break;
				}
				case "constructor": {
					const constructor = schema.constructor = args[index];
					if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
					break;
				}
				default: schema[key] = args[index];
			}
		});
		if (name === "object" || name === "dict") schema.meta.default = {};
		else if (name === "array" || name === "tuple") schema.meta.default = [];
		else if (name === "bitset") schema.meta.default = 0;
		return schema;
	} });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
	if (typeof constructor === "function") return constructor.name;
	else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
	if (Object.keys(dict).length === 0) return "{}";
	return `{ ${Object.entries(dict).map(([key, inner]) => {
		return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
	}).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
	const result = list.map(({ toString: format }) => format()).join(" | ");
	return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
	return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
	"inner",
	"callback",
	"preserve"
], ({ inner }, isInner) => inner.toString(isInner));
//#endregion
//#region src/config.ts
const AbsolutePathSchema = Schema.transform(Schema.string(), (value, options) => {
	if (!isAbsolute(value)) throw new Schema.ValidationError("expected an absolute path", options);
	return value;
});
const ConfigSchema = Schema.object({ stateDir: AbsolutePathSchema });
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
const VaultPolicySchema = Schema.object({
	autoLockMinutes: Schema.union([
		0,
		15,
		30,
		60
	]).default(15),
	lockOnSystemSleep: Schema.boolean().default(true),
	lockedNameVisibility: Schema.union([
		"workspace-visible-session-hidden",
		"all-visible",
		"all-hidden"
	]).default("workspace-visible-session-hidden"),
	failedAttemptProtection: Schema.object({
		enabled: Schema.boolean().default(true),
		maxAttempts: Schema.number().step(1).min(1).default(3),
		cooldownSeconds: Schema.number().step(1).min(1).default(300)
	}),
	passwordPolicy: Schema.object({
		minLength: Schema.number().step(1).min(4).max(128).default(8),
		requireUppercase: Schema.boolean().default(false),
		requireLowercase: Schema.boolean().default(false),
		requireNumber: Schema.boolean().default(false),
		requireSymbol: Schema.boolean().default(false)
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

//# sourceMappingURL=repository-BO9I8Swf.js.map