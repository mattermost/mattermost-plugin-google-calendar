// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Trims Google's published Discovery documents down to the methods in operations.json and
// converts their schemas to closed JSON Schema (a field Google does not document fails).
//   node fake-google/contract/update_specs.ts          rewrite specs/*.json from Google
//   node fake-google/contract/update_specs.ts --check  report drift; exit 1 only on breaking drift
//
// Google changes these documents almost daily (revision, etag, descriptions), and most schema
// changes are additions. So the committed copies drop descriptions, and --check fails only on
// changes that can break the fake or the plugin: a removed method, field, parameter or enum value,
// a changed type or path, a parameter's changed location or repeated flag, an object switching
// between closed and map, or a newly required parameter. Additions are reported so they can be
// pulled in.

/* eslint-disable no-console */

import fs from 'node:fs';
import path from 'node:path';

import type {ApiSpec, JsonSchema, MethodSpec, ParameterSpec} from './types.ts';

type DiscoverySchema = {
    $ref?: string;
    type?: string;
    format?: string;
    enum?: string[];
    items?: DiscoverySchema;
    properties?: Record<string, DiscoverySchema>;
    additionalProperties?: DiscoverySchema;
};

type DiscoveryMethod = {
    id: string;
    httpMethod: string;
    flatPath?: string;
    path: string;
    parameters?: Record<string, {type: string; location: string; required?: boolean; enum?: string[]; repeated?: boolean; format?: string}>;
    request?: {$ref: string};
    response?: {$ref: string};
    mediaUpload?: {protocols?: {simple?: {path: string}}};
};

type DiscoveryResource = {methods?: Record<string, DiscoveryMethod>; resources?: Record<string, DiscoveryResource>};

type Discovery = DiscoveryResource & {
    name: string;
    version: string;
    servicePath: string;
    schemas: Record<string, DiscoverySchema>;
};

const dir = import.meta.dirname;
const specsDir = path.join(dir, 'specs');
const check = process.argv.includes('--check');
const manifest: Record<string, {url: string; methods: string[]}> = JSON.parse(fs.readFileSync(path.join(dir, 'operations.json'), 'utf8'));

let breaking = 0;
let additive = 0;

for (const [name, {url, methods}] of Object.entries(manifest)) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status}`);
    }
    const next = trim(await response.json() as Discovery, methods, name);
    const outPath = path.join(specsDir, `${name}.json`);

    if (check) {
        const current: ApiSpec | null = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : null;
        if (!current) {
            console.error(`${name}: no committed spec; run contract:update`);
            breaking++;
            continue;
        }
        const drift = compare(current, next);
        for (const line of drift.breaking) {
            console.error(`${name}: BREAKING ${line}`);
        }
        for (const line of drift.additive) {
            console.log(`${name}: additive ${line}`);
        }
        breaking += drift.breaking.length;
        additive += drift.additive.length;
        continue;
    }

    fs.mkdirSync(specsDir, {recursive: true});
    fs.writeFileSync(outPath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`${name}: ${Object.keys(next.methods).length} methods, ${Object.keys(next.schemas).length} schemas`);
}

if (check) {
    if (breaking > 0) {
        console.error(`\n${breaking} breaking change(s). Run \`npm run contract:update\`, review the diff, and update the fake and the plugin to match.`);
        process.exit(1);
    }
    console.log(additive > 0 ? `\n${additive} additive change(s); run \`npm run contract:update\` to pull them in.` : 'No drift.');
}

function trim(discovery: Discovery, methodIds: string[], name: string): ApiSpec {
    const all = new Map<string, DiscoveryMethod>();
    collectMethods(discovery, all);

    const methods: Record<string, MethodSpec> = {};
    const roots: string[] = [];
    for (const id of methodIds) {
        const method = all.get(id);
        if (!method) {
            throw new Error(`${name}: ${id} is not in the published Discovery document`);
        }
        const parameters: Record<string, ParameterSpec> = {};
        for (const [param, spec] of Object.entries(method.parameters ?? {})) {
            parameters[param] = {
                type: spec.type,
                location: spec.location,
                ...(spec.required ? {required: true} : {}),
                ...(spec.enum ? {enum: spec.enum} : {}),
                ...(spec.repeated ? {repeated: true} : {}),
                ...(spec.format ? {format: spec.format} : {}),
            };
        }
        const uploadPath = method.mediaUpload?.protocols?.simple?.path;
        methods[id] = {
            httpMethod: method.httpMethod,
            path: `/${discovery.servicePath}${method.flatPath ?? method.path}`,
            ...(uploadPath ? {uploadPath} : {}),
            parameters,
            ...(method.request ? {request: method.request.$ref} : {}),
            ...(method.response ? {response: method.response.$ref} : {}),
        };
        roots.push(...[method.request?.$ref, method.response?.$ref].filter((r): r is string => Boolean(r)));
    }

    const schemas: Record<string, JsonSchema> = {};
    const queue = [...roots];
    while (queue.length) {
        const schemaName = queue.pop()!;
        if (schemas[schemaName]) {
            continue;
        }
        const schema = discovery.schemas[schemaName];
        if (!schema) {
            throw new Error(`${name}: schema ${schemaName} is referenced but not defined`);
        }
        schemas[schemaName] = convert(schema);
        queue.push(...refs(schema));
    }

    return {
        api: discovery.name,
        version: discovery.version,
        methods: Object.fromEntries(Object.entries(methods).sort(([a], [b]) => a.localeCompare(b))),
        schemas: Object.fromEntries(Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b))),
    };
}

function collectMethods(resource: DiscoveryResource, out: Map<string, DiscoveryMethod>) {
    for (const method of Object.values(resource.methods ?? {})) {
        out.set(method.id, method);
    }
    for (const child of Object.values(resource.resources ?? {})) {
        collectMethods(child, out);
    }
}

// Discovery's schema dialect to closed JSON Schema. 64-bit integers travel as strings.
function convert(schema: DiscoverySchema): JsonSchema {
    if (schema.$ref) {
        return {$ref: schema.$ref};
    }
    if (schema.type === 'any') {
        return {};
    }
    const out: JsonSchema = {};
    if (schema.type) {
        out.type = schema.type;
    }
    if (schema.enum) {
        out.enum = schema.enum;
    }
    if (schema.format === 'int64' || schema.format === 'uint64') {
        out.pattern = '^-?[0-9]+$';
    } else if (schema.format === 'date-time' || schema.format === 'google-datetime') {
        out.format = 'date-time';
    }
    if (schema.items) {
        out.items = convert(schema.items);
    }
    if (schema.type === 'object') {
        if (schema.properties) {
            out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, convert(v)]));
        }
        // Closed: a field the fake invents fails. Map-typed objects keep their value schema.
        out.additionalProperties = schema.additionalProperties ? convert(schema.additionalProperties) : false;
    }
    return out;
}

function refs(node: unknown, found: string[] = []): string[] {
    if (Array.isArray(node)) {
        node.forEach((item) => refs(item, found));
    } else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
            if (key === '$ref' && typeof value === 'string') {
                found.push(value);
            } else {
                refs(value, found);
            }
        }
    }
    return found;
}

function compare(current: ApiSpec, next: ApiSpec): {breaking: string[]; additive: string[]} {
    const out = {breaking: [] as string[], additive: [] as string[]};

    for (const [id, method] of Object.entries(current.methods)) {
        const updated = next.methods[id];
        if (!updated) {
            out.breaking.push(`${id} removed`);
            continue;
        }
        for (const key of ['httpMethod', 'path', 'uploadPath', 'request', 'response'] as const) {
            if (method[key] !== updated[key]) {
                out.breaking.push(`${id} ${key} ${method[key]} -> ${updated[key]}`);
            }
        }
        for (const [param, spec] of Object.entries(updated.parameters)) {
            const old = method.parameters[param];
            if (!old) {
                (spec.required ? out.breaking : out.additive).push(`${id} parameter ${param} added${spec.required ? ' (required)' : ''}`);
            } else {
                if (spec.required && !old.required) {
                    out.breaking.push(`${id} parameter ${param} became required`);
                }
                for (const key of ['type', 'location', 'repeated'] as const) {
                    if (old[key] !== spec[key]) {
                        out.breaking.push(`${id} parameter ${param} ${key} ${old[key]} -> ${spec[key]}`);
                    }
                }
                if (old.enum || spec.enum) {
                    const removed = (old.enum ?? []).filter((v) => !(spec.enum ?? []).includes(v));
                    const added = (spec.enum ?? []).filter((v) => !(old.enum ?? []).includes(v));
                    if (removed.length) {
                        out.breaking.push(`${id} parameter ${param} enum values removed: ${removed.join(', ')}`);
                    }
                    if (added.length) {
                        out.additive.push(`${id} parameter ${param} enum values added: ${added.join(', ')}`);
                    }
                }
            }
        }
        for (const param of Object.keys(method.parameters)) {
            if (!updated.parameters[param]) {
                out.breaking.push(`${id} parameter ${param} removed`);
            }
        }
    }

    for (const [schemaName, schema] of Object.entries(current.schemas)) {
        const updated = next.schemas[schemaName];
        if (!updated) {
            out.breaking.push(`schema ${schemaName} removed`);
            continue;
        }
        compareSchema(schema, updated, schemaName, out);
    }
    for (const schemaName of Object.keys(next.schemas)) {
        if (!current.schemas[schemaName]) {
            out.additive.push(`schema ${schemaName} added`);
        }
    }
    return out;
}

function compareSchema(old: JsonSchema, next: JsonSchema, at: string, out: {breaking: string[]; additive: string[]}) {
    for (const key of ['$ref', 'type', 'pattern', 'format'] as const) {
        if (old[key] !== next[key]) {
            out.breaking.push(`${at} ${key} ${old[key]} -> ${next[key]}`);
        }
    }
    if (old.enum || next.enum) {
        const removed = (old.enum ?? []).filter((v) => !(next.enum ?? []).includes(v));
        const added = (next.enum ?? []).filter((v) => !(old.enum ?? []).includes(v));
        if (removed.length) {
            out.breaking.push(`${at} enum values removed: ${removed.join(', ')}`);
        }
        if (added.length) {
            out.additive.push(`${at} enum values added: ${added.join(', ')}`);
        }
    }
    if (old.items || next.items) {
        compareSchema(old.items ?? {}, next.items ?? {}, `${at}[]`, out);
    }
    for (const [prop, schema] of Object.entries(old.properties ?? {})) {
        const updated = next.properties?.[prop];
        if (updated) {
            compareSchema(schema, updated, `${at}.${prop}`, out);
        } else {
            out.breaking.push(`${at}.${prop} removed`);
        }
    }
    for (const prop of Object.keys(next.properties ?? {})) {
        if (!old.properties?.[prop]) {
            out.additive.push(`${at}.${prop} added`);
        }
    }
    if (typeof old.additionalProperties === 'object' && typeof next.additionalProperties === 'object') {
        compareSchema(old.additionalProperties, next.additionalProperties, `${at}{}`, out);
    } else if ((old.additionalProperties === false && typeof next.additionalProperties === 'object') ||
        (typeof old.additionalProperties === 'object' && next.additionalProperties === false)) {
        const shape = (s: JsonSchema) => (s.additionalProperties === false ? 'closed object' : 'map');
        out.breaking.push(`${at} ${shape(old)} -> ${shape(next)}`);
    }
}
