// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Shape of the trimmed specs in specs/*.json (written by update_specs.ts).

export type JsonSchema = {
    $ref?: string;
    type?: string;
    enum?: string[];
    pattern?: string;
    format?: string;
    items?: JsonSchema;
    properties?: Record<string, JsonSchema>;
    additionalProperties?: JsonSchema | false;
};

export type ParameterSpec = {
    type: string;
    location: string;
    required?: boolean;
    enum?: string[];
    repeated?: boolean;
    format?: string;
};

export type MethodSpec = {
    httpMethod: string;
    /** Full request path, e.g. /drive/v3/files/{fileId}. */
    path: string;
    /** Media upload path, e.g. /upload/drive/v3/files. */
    uploadPath?: string;
    parameters: Record<string, ParameterSpec>;
    request?: string;
    response?: string;
    /** OAuth scopes that authorize the method; Google accepts a token holding any one of them. */
    scopes?: string[];
};

export type ApiSpec = {
    api: string;
    version: string;
    methods: Record<string, MethodSpec>;
    schemas: Record<string, JsonSchema>;
};
