// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Checks Google API traffic against the trimmed Discovery specs in specs/ (closed JSON Schema)
// and against required.ts (the fields the plugin reads, which Discovery never marks required).
// Dependency-free so the fake can run in a plain node:24 container.

import fs from 'node:fs';
import path from 'node:path';

import {REQUIRED_RESPONSE_FIELDS, missingPaths} from './required.ts';
import type {ApiSpec, JsonSchema, MethodSpec} from './types.ts';

export type MethodMatch = {
    api: string;
    id: string;
    spec: MethodSpec;
    upload: boolean;
    pathParams: Record<string, string>;
};

// Parameters every Google API accepts (Discovery lists them once at the top level, not per method).
const STANDARD_PARAMETERS = new Set([
    '$.xgafv', 'access_token', 'alt', 'callback', 'fields', 'key', 'oauth_token',
    'prettyPrint', 'quotaUser', 'upload_protocol', 'uploadType', 'userIp',
]);

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

type Route = {api: string; id: string; spec: MethodSpec; upload: boolean; pattern: RegExp; names: string[]};

export class ContractValidator {
    private readonly specs = new Map<string, ApiSpec>();
    private readonly routes: Route[] = [];

    constructor(specsDir = path.join(import.meta.dirname, 'specs')) {
        for (const file of fs.readdirSync(specsDir).filter((f) => f.endsWith('.json'))) {
            const api = path.basename(file, '.json');
            const spec: ApiSpec = JSON.parse(fs.readFileSync(path.join(specsDir, file), 'utf8'));
            this.specs.set(api, spec);
            for (const [id, method] of Object.entries(spec.methods)) {
                this.routes.push({api, id, spec: method, upload: false, ...compile(method.path)});
                if (method.uploadPath) {
                    this.routes.push({api, id, spec: method, upload: true, ...compile(method.uploadPath)});
                }
            }
        }
    }

    /** The documented method for a request, or null when the contract does not cover it. */
    match(httpMethod: string, pathname: string): MethodMatch | null {
        for (const route of this.routes) {
            if (route.spec.httpMethod !== httpMethod) {
                continue;
            }
            const found = route.pattern.exec(pathname);
            if (found) {
                const pathParams = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(found[i + 1])]));
                return {api: route.api, id: route.id, spec: route.spec, upload: route.upload, pathParams};
            }
        }
        return null;
    }

    validateRequest(match: MethodMatch, query: URLSearchParams, body: unknown): string[] {
        const errors: string[] = [];
        const params = match.spec.parameters;
        for (const key of new Set(query.keys())) {
            const param = params[key];
            if (!param) {
                if (!STANDARD_PARAMETERS.has(key)) {
                    errors.push(`${match.id}: undocumented query parameter "${key}"`);
                }
                continue;
            }
            if (param.location !== 'query') {
                errors.push(`${match.id}: "${key}" is a ${param.location} parameter, not a query parameter`);
            }
            const values = query.getAll(key);
            if (values.length > 1 && !param.repeated) {
                errors.push(`${match.id}: "${key}" is not repeatable`);
            }
            for (const value of values) {
                const problem = checkParameterValue(param.type, param.enum, value);
                if (problem) {
                    errors.push(`${match.id}: query "${key}" ${problem}`);
                }
            }
        }
        for (const [key, param] of Object.entries(params)) {
            if (param.required && param.location === 'query' && !query.has(key)) {
                errors.push(`${match.id}: missing required query parameter "${key}"`);
            }
        }
        if (match.upload && query.get('uploadType') !== 'multipart' && query.get('uploadType') !== 'media') {
            errors.push(`${match.id}: upload with unsupported uploadType "${query.get('uploadType')}"`);
        }
        if (match.spec.request && body !== undefined) {
            errors.push(...this.validateSchema(match.api, match.spec.request, body).map((e) => `${match.id} request: ${e}`));
        } else if (!match.spec.request && body !== undefined) {
            errors.push(`${match.id}: takes no request body`);
        }
        return errors;
    }

    validateResponse(match: MethodMatch, query: URLSearchParams, status: number, body: unknown): string[] {
        if (status >= 300) {
            return missingPaths(body, ['error.code', 'error.message']).map((p) => `${match.id} error ${status}: missing ${p}`);
        }
        const errors: string[] = [];
        if (match.spec.response) {
            errors.push(...this.validateSchema(match.api, match.spec.response, body).map((e) => `${match.id} response: ${e}`));
        }
        for (const rule of REQUIRED_RESPONSE_FIELDS[match.id] ?? []) {
            if (rule.when(query)) {
                errors.push(...missingPaths(body, rule.paths).map((p) => `${match.id} response: missing ${p} (${rule.why})`));
            }
        }
        return errors;
    }

    validateSchema(api: string, schemaName: string, value: unknown): string[] {
        const spec = this.specs.get(api);
        if (!spec?.schemas[schemaName]) {
            return [`unknown schema ${api}.${schemaName}`];
        }
        const errors: string[] = [];
        validate(spec, {$ref: schemaName}, value, '', errors);
        return errors;
    }
}

function compile(template: string): {pattern: RegExp; names: string[]} {
    const names: string[] = [];
    const source = template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\+?([^}]+)\}/g, (_, name: string) => {
        names.push(name);
        return '([^/]+)';
    });
    return {pattern: new RegExp(`^${source}$`), names};
}

function checkParameterValue(type: string, allowed: string[] | undefined, value: string): string | null {
    if (allowed && !allowed.includes(value)) {
        return `must be one of ${allowed.join(', ')}, got "${value}"`;
    }
    if (type === 'boolean' && value !== 'true' && value !== 'false') {
        return `must be true or false, got "${value}"`;
    }
    if (type === 'integer' && !/^-?\d+$/.test(value)) {
        return `must be an integer, got "${value}"`;
    }
    return null;
}

function validate(spec: ApiSpec, schema: JsonSchema, value: unknown, at: string, errors: string[]) {
    const where = at || '/';
    if (schema.$ref) {
        validate(spec, spec.schemas[schema.$ref], value, at, errors);
        return;
    }
    if (schema.type && !hasType(schema.type, value)) {
        errors.push(`${where} must be ${schema.type}, got ${JSON.stringify(value)}`);
        return;
    }
    if (schema.enum && !schema.enum.includes(value as string)) {
        errors.push(`${where} must be one of ${schema.enum.join(', ')}, got ${JSON.stringify(value)}`);
    }
    if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
        errors.push(`${where} must match ${schema.pattern} (64-bit integers are sent as strings)`);
    }
    if (schema.format === 'date-time' && typeof value === 'string' && !DATE_TIME.test(value)) {
        errors.push(`${where} must be an RFC 3339 date-time, got "${value}"`);
    }
    if (schema.items && Array.isArray(value)) {
        value.forEach((item, i) => validate(spec, schema.items!, item, `${at}/${i}`, errors));
    }
    if (schema.type === 'object' && value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            const property = schema.properties?.[key];
            if (property) {
                validate(spec, property, child, `${at}/${key}`, errors);
            } else if (schema.additionalProperties === false) {
                errors.push(`${where} has undocumented field "${key}"`);
            } else if (schema.additionalProperties) {
                validate(spec, schema.additionalProperties, child, `${at}/${key}`, errors);
            }
        }
    }
}

function hasType(type: string, value: unknown): boolean {
    switch (type) {
    case 'object':
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
        return Array.isArray(value);
    case 'string':
        return typeof value === 'string';
    case 'boolean':
        return typeof value === 'boolean';
    case 'integer':
        return Number.isInteger(value);
    case 'number':
        return typeof value === 'number';
    default:
        return true;
    }
}
