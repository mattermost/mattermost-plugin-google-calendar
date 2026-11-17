// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// import '@mattermost/webapp/tests/setup';

// floating-ui probes these top-layer selectors on every position update, and jsdom's selector
// engine evaluates them extremely slowly. Nothing is ever in the top layer under jsdom.
const TOP_LAYER_SELECTORS = new Set([':modal', ':popover-open']);
const nativeMatches = Element.prototype.matches;
Element.prototype.matches = function matches(selector: string) {
    return TOP_LAYER_SELECTORS.has(selector) ? false : nativeMatches.call(this, selector);
};

export {};
