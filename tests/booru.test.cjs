const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
	prepareRequest,
	receiveResponse,
	sendRequest,
	validateBaseUrl,
	normalizePost,
	retryDetails,
	retryDelay,
} = require('../dist/nodes/Booru/helpers.js');

function harness(parameters = {}, options = {}) {
	const values = {
		resource: 'post',
		operation: 'search',
		baseUrl: 'https://clone.example/board/',
		userAgent: 'BooruTest/1.0 (user #123)',
		tags: 'landscape rating:g',
		page: '1',
		limit: 50,
		returnAll: false,
		requestInterval: 1000,
		outputFormat: 'raw',
		...parameters,
	};
	const node = {
		id: 'booru',
		name: 'Booru',
		type: '@overworks/n8n-nodes-booru.booru',
		typeVersion: 1,
		position: [0, 0],
		parameters: values,
		...(options.credentials ? { credentials: { booruApi: { id: 'test', name: 'Test' } } } : {}),
	};
	const requests = [];
	const state = options.state ?? {};
	const context = {
		getNode: () => node,
		getNodeParameter: (key, fallback) => values[key] ?? fallback,
		getCredentials: async () => options.credentials,
		getContext: () => state,
		getExecutionCancelSignal: () => options.signal,
		makeRoutingRequest: async (request) => {
			requests.push({ options: structuredClone(request.options), at: Date.now() });
			if (options.reply) {
				return receiveResponse.call(
					context,
					[],
					await options.reply(request.options, requests.length),
				);
			}
			const body = await options.respond?.(request.options, requests.length);
			return receiveResponse.call(context, [], { body: body ?? [], headers: {}, statusCode: 200 });
		},
	};
	const prepare = async () => ({
		options: await prepareRequest.call(context, {
			url: 'https://danbooru.donmai.us/posts.json',
			method: 'GET',
		}),
		preSend: [],
		postReceive: [],
		requestOperations: {},
	});
	return { context, requests, prepare, state };
}

async function finish(t, pending) {
	let settled = false;
	let value;
	let failure;
	pending.then(
		(result) => {
			value = result;
			settled = true;
		},
		(error) => {
			failure = error;
			settled = true;
		},
	);
	for (let i = 0; i < 100 && !settled; i++) {
		await new Promise(setImmediate);
		if (!settled) t.mock.timers.tick(1000);
	}
	assert.ok(settled, 'Request loop must terminate');
	if (failure) throw failure;
	return value;
}

function clock(t) {
	t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
}

test('custom base URLs retain path prefixes and reject embedded secrets or non-HTTP schemes', () => {
	assert.equal(validateBaseUrl(' https://clone.example/board/// '), 'https://clone.example/board');
	assert.equal(validateBaseUrl('http://localhost:3000'), 'http://localhost:3000');
	for (const value of [
		'file:///etc/passwd',
		'ftp://example.com',
		'/relative',
		'https://u:p@example.com',
		'https://example.com/?api_key=x',
		'https://example.com/#posts',
	]) {
		assert.throws(() => validateBaseUrl(value));
	}
});

test('anonymous requests preserve the search query and use the custom server', async () => {
	const h = harness({ tags: 'landscape -animated order:score', limit: 350 });
	const { options } = await h.prepare();
	assert.equal(options.url, 'https://clone.example/board/posts.json');
	assert.deepEqual(options.qs, { page: 1, limit: 200, tags: 'landscape -animated order:score' });
	assert.equal(options.headers['User-Agent'], 'BooruTest/1.0 (user #123)');
	assert.equal(options.auth, undefined);
	assert.equal(options.disableFollowRedirect, true);
});

test('credentials bind authenticated requests to their own server', async () => {
	const h = harness(
		{ operation: 'get', postId: '42', baseUrl: 'https://wrong.example' },
		{
			credentials: {
				baseUrl: 'https://private.example/booru/',
				username: 'user',
				apiKey: 'secret',
			},
		},
	);
	const { options } = await h.prepare();
	assert.equal(options.url, 'https://private.example/booru/posts/42.json');
	assert.ok(
		!JSON.stringify(options).includes('secret'),
		'Authentication is delegated to the n8n credential helper',
	);
});

test('invalid post IDs, page values, and header injection fail before any request', async () => {
	for (const postId of ['0', '-1', '1.5', '../profile', '9007199254740992']) {
		await assert.rejects(harness({ operation: 'get', postId }).prepare(), /positive integer/);
	}
	for (const page of ['0', '-1', 'a100', 'b0', '1.5', 'not-a-page']) {
		await assert.rejects(harness({ page }).prepare(), /Page must/);
	}
	await assert.rejects(
		harness({ userAgent: 'bad\r\nAuthorization: fake' }).prepare(),
		/single-line/,
	);
});

test('tag requests use Danbooru names, category zero, and sorting parameters', async () => {
	const h = harness({
		resource: 'tag',
		nameMatches: 'landscape*',
		category: '0',
		tagOrder: 'name',
		page: '2',
	});
	const { options } = await h.prepare();
	assert.equal(options.url, 'https://clone.example/board/tags.json');
	assert.deepEqual(options.qs, {
		page: 2,
		limit: 50,
		'search[name_matches]': 'landscape*',
		'search[order]': 'name',
		'search[category]': '0',
	});
});

test('response validation rejects HTML, incompatible API envelopes, and missing IDs', async () => {
	const h = harness();
	for (const body of [
		'<html>Access denied</html>',
		{ posts: [{ id: 1 }] },
		[{ error: 'not a post' }],
	]) {
		await assert.rejects(
			receiveResponse.call(h.context, [], { body, headers: {}, statusCode: 200 }),
		);
	}
	const posts = [{ id: 1, rating: 's', custom_field: true }];
	assert.deepEqual(
		await receiveResponse.call(h.context, [], { body: posts, headers: {}, statusCode: 200 }),
		[{ json: posts[0] }],
	);
});

test('pagination handles smaller server page sizes, overlaps, and the exact requested limit', async (t) => {
	clock(t);
	const pages = [[{ id: 9 }, { id: 8 }], [{ id: 8 }, { id: 7 }], [{ id: 6 }]];
	const h = harness({ limit: 4 }, { respond: (_request, call) => pages[call - 1] });
	const request = await h.prepare();
	const original = structuredClone(request);
	const result = await finish(t, sendRequest.call(h.context, request));
	assert.deepEqual(
		result.map((item) => item.json.id),
		[9, 8, 7, 6],
	);
	assert.deepEqual(
		h.requests.map((r) => [r.options.qs.page, r.options.qs.limit]),
		[
			[1, 4],
			[2, 2],
			[3, 1],
		],
	);
	assert.deepEqual(request, original);
});

test('Return All continues after a short page until the server returns an empty page', async (t) => {
	clock(t);
	const h = harness(
		{ returnAll: true },
		{ respond: (_request, call) => (call <= 2 ? [{ id: 10 - call }] : []) },
	);
	const result = await finish(t, sendRequest.call(h.context, await h.prepare()));
	assert.equal(result.length, 2);
	assert.deepEqual(
		h.requests.map((r) => r.options.qs.page),
		[1, 2, 3],
	);
	assert.ok(h.requests.every((r) => r.options.qs.limit === 200));
});

test('before-ID cursors advance using the lowest returned ID', async (t) => {
	clock(t);
	const pages = [[{ id: 95 }, { id: 88 }], [{ id: 75 }], []];
	const h = harness(
		{ page: 'b100', returnAll: true },
		{ respond: (_request, call) => pages[call - 1] },
	);
	const result = await finish(t, sendRequest.call(h.context, await h.prepare()));
	assert.deepEqual(
		result.map((item) => item.json.id),
		[95, 88, 75],
	);
	assert.deepEqual(
		h.requests.map((r) => r.options.qs.page),
		['b100', 'b88', 'b75'],
	);
	await assert.rejects(
		harness({ page: 'b100', tags: 'order:score' }).prepare(),
		/default post order/,
	);
});

test('repeated pages and stalled cursors fail rather than looping indefinitely', async (t) => {
	clock(t);
	const h = harness({ returnAll: true }, { respond: () => [{ id: 10 }] });
	await assert.rejects(finish(t, sendRequest.call(h.context, await h.prepare())), /repeated page/);
	assert.equal(h.requests.length, 2);
	const stalled = harness({ page: 'b10', returnAll: true }, { respond: () => [{ id: 11 }] });
	await assert.rejects(
		finish(t, sendRequest.call(stalled.context, await stalled.prepare())),
		/advance the ID cursor/,
	);
});

test('random searches are limited to one request and cannot request all results', async (t) => {
	clock(t);
	await assert.rejects(
		harness({ tags: 'order:random', returnAll: true }).prepare(),
		/Random searches/,
	);
	await assert.rejects(harness({ tags: 'order:random', limit: 201 }).prepare(), /Random searches/);
	const h = harness({ tags: 'order:random', limit: 50 }, { respond: () => [{ id: 1 }] });
	assert.equal((await finish(t, sendRequest.call(h.context, await h.prepare()))).length, 1);
	assert.equal(h.requests.length, 1);
});

test('a 429 retries the current page, respects Retry-After, and does not replay previous pages', async (t) => {
	clock(t);
	const h = harness(
		{ returnAll: true },
		{
			respond: (request, call) => {
				if (call === 2) throw { response: { status: 429, headers: { 'retry-after': '3' } } };
				return request.qs.page < 3 ? [{ id: 10 - request.qs.page }] : [];
			},
		},
	);
	const result = await finish(t, sendRequest.call(h.context, await h.prepare()));
	assert.deepEqual(
		result.map((item) => item.json.id),
		[9, 8],
	);
	assert.deepEqual(
		h.requests.map((r) => r.options.qs.page),
		[1, 2, 2, 3],
	);
	assert.ok(h.requests[2].at - h.requests[1].at >= 3000);
});

test('429 retries are bounded and ordinary authentication failures are not retried', async (t) => {
	clock(t);
	const throttled = harness(
		{},
		{
			respond: () => {
				throw Object.assign(new Error('Throttled'), { statusCode: 429 });
			},
		},
	);
	await assert.rejects(
		finish(t, sendRequest.call(throttled.context, await throttled.prepare())),
		(error) => error.name === 'NodeApiError' && error.httpCode === '429',
	);
	assert.equal(throttled.requests.length, 4);
	const denied = harness(
		{},
		{
			respond: () => {
				throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
			},
		},
	);
	await assert.rejects(
		finish(t, sendRequest.call(denied.context, await denied.prepare())),
		(error) => error.name === 'NodeApiError' && error.httpCode === '401',
	);
	assert.equal(denied.requests.length, 1);
});

test('long Retry-After values and exhausted server pagination produce actionable errors', async (t) => {
	clock(t);
	for (const [status, retryAfter, message] of [
		[429, '120', /Wait at least 120 seconds/],
		[410, undefined, /pagination limit/],
	]) {
		const h = harness(
			{},
			{
				respond: () => {
					throw { response: { status, headers: { 'retry-after': retryAfter } } };
				},
			},
		);
		await assert.rejects(finish(t, sendRequest.call(h.context, await h.prepare())), (error) =>
			message.test(`${error.message} ${error.description}`),
		);
		assert.equal(h.requests.length, 1);
	}
});

test('rate limiting is shared between concurrent input items', async (t) => {
	clock(t);
	const state = {};
	const first = harness({ operation: 'get', postId: '1' }, { state, respond: () => ({ id: 1 }) });
	const second = harness({ operation: 'get', postId: '2' }, { state, respond: () => ({ id: 2 }) });
	const requests = await Promise.all([first.prepare(), second.prepare()]);
	await finish(
		t,
		Promise.all([
			sendRequest.call(first.context, requests[0]),
			sendRequest.call(second.context, requests[1]),
		]),
	);
	assert.ok(second.requests[0].at - first.requests[0].at >= 1000);
});

test('a 429 pauses input items that were already waiting for a request slot', async (t) => {
	clock(t);
	const state = {};
	const first = harness(
		{ operation: 'get', postId: '1' },
		{
			state,
			respond: (_request, call) => {
				if (call === 1) throw { response: { status: 429, headers: { 'retry-after': '3' } } };
				return { id: 1 };
			},
		},
	);
	const second = harness({ operation: 'get', postId: '2' }, { state, respond: () => ({ id: 2 }) });
	const requests = await Promise.all([first.prepare(), second.prepare()]);
	await finish(
		t,
		Promise.all([
			sendRequest.call(first.context, requests[0]),
			sendRequest.call(second.context, requests[1]),
		]),
	);
	assert.ok(first.requests[1].at - first.requests[0].at >= 3000);
	assert.ok(second.requests[0].at - first.requests[0].at >= 3000);
	const times = [...first.requests, ...second.requests]
		.map((request) => request.at)
		.sort((a, b) => a - b);
	assert.ok(times.slice(1).every((time, index) => time - times[index] >= 1000));
});

test('cancelling an execution interrupts a queued request', async (t) => {
	clock(t);
	const controller = new AbortController();
	const h = harness(
		{ operation: 'get', postId: '1' },
		{
			signal: controller.signal,
			state: { booruNextRequestAt: Date.now() + 60000 },
			respond: () => ({ id: 1 }),
		},
	);
	const pending = sendRequest.call(h.context, await h.prepare());
	const rejected = assert.rejects(pending, /cancel/i);
	await new Promise(setImmediate);
	controller.abort();
	await rejected;
	assert.equal(h.requests.length, 0);
});

test('the built package exposes its node, credential, metadata, and both icon variants', () => {
	const { existsSync } = require('node:fs');
	const { resolve, dirname } = require('node:path');
	const pkg = require('../package.json');
	assert.equal(pkg.name, '@overworks/n8n-nodes-booru');
	assert.deepEqual(pkg.dependencies ?? {}, {});
	for (const entry of [...pkg.n8n.nodes, ...pkg.n8n.credentials]) {
		const absolute = resolve(__dirname, '..', entry);
		const exported = Object.values(require(absolute))[0];
		const instance = new exported();
		const icon = instance.description?.icon ?? instance.icon;
		for (const file of Object.values(icon)) {
			assert.ok(existsSync(resolve(dirname(absolute), file.slice('file:'.length))));
		}
		if (entry.endsWith('.node.js')) {
			assert.equal(
				require(absolute.replace(/\.js$/, '.json')).node,
				`${pkg.name}.${instance.description.name}`,
			);
		}
	}
});

test('Retry-After supports seconds, HTTP dates, malformed values, and exponential backoff', () => {
	assert.equal(retryDelay('3', 0, 0), 3000);
	assert.equal(retryDelay('Thu, 01 Jan 1970 00:00:05 GMT', 0, 0), 5000);
	assert.equal(retryDelay('invalid', 2, 0), 4000);
	assert.equal(retryDelay('-1', 0, 0), 1000);
});

test('Retry-After survives n8n error wrapping, including cyclic causes', () => {
	const { NodeApiError } = require('n8n-workflow');
	const node = harness().context.getNode();
	const response = { status: 429, headers: { 'retry-after': '7' } };
	const wrapped = new NodeApiError(node, { response }, { httpCode: '429' });
	assert.deepEqual(retryDetails(wrapped), { status: 429, retryAfter: '7' });
	const raw = Object.assign(new Error('Rate limited'), { response });
	assert.deepEqual(retryDetails(raw), { status: 429, retryAfter: '7' });
	const cyclic = { httpCode: '429' };
	cyclic.cause = { cause: cyclic, response };
	assert.deepEqual(retryDetails(cyclic), { status: 429, retryAfter: '7' });
});

test('full HTTP responses retain Retry-After through the actual n8n error class', async (t) => {
	clock(t);
	const h = harness(
		{ operation: 'get', postId: '42' },
		{
			reply: (_request, call) =>
				call === 1
					? { statusCode: 429, headers: { 'retry-after': '4' }, body: 'Too many requests' }
					: { statusCode: 200, headers: {}, body: { id: 42 } },
		},
	);
	const request = await h.prepare();
	assert.equal(request.options.ignoreHttpStatusErrors, true);
	const result = await finish(t, sendRequest.call(h.context, request));
	assert.equal(result[0].json.id, 42);
	assert.ok(h.requests[1].at - h.requests[0].at >= 4000);
	for (const statusCode of [301, 401, 403, 500]) {
		await assert.rejects(
			receiveResponse.call(h.context, [], {
				statusCode,
				headers: {},
				body: { id: 42 },
			}),
			(error) => error.name === 'NodeApiError' && error.httpCode === String(statusCode),
		);
	}
});

test('normalization preserves ratings and original data, including unavailable files', () => {
	for (const rating of ['g', 's', 'q', 'e']) {
		const raw = {
			id: 42,
			rating,
			tag_string: 'landscape blue_sky',
			tag_string_artist: 'example_artist',
			score: 0,
		};
		const normalized = normalizePost(raw, 'https://clone.example/board');
		assert.equal(normalized.rating, rating);
		assert.equal(normalized.raw, raw);
		assert.equal(normalized.score, 0);
		assert.equal(normalized.fileUrl, null);
		assert.equal(normalized.postUrl, 'https://clone.example/board/posts/42');
		assert.deepEqual(normalized.tags, ['landscape', 'blue_sky']);
		assert.deepEqual(normalized.tagCategories.artist, ['example_artist']);
	}
});

test('single-post retrieval supports normalized output and retains raw fields', async (t) => {
	clock(t);
	const raw = { id: 42, rating: 's', custom_field: 'retained' };
	const h = harness(
		{ operation: 'get', postId: '42', outputFormat: 'normalized' },
		{ respond: () => raw },
	);
	const result = await finish(t, sendRequest.call(h.context, await h.prepare()));
	assert.equal(result.length, 1);
	assert.equal(result[0].json.raw.custom_field, 'retained');
	assert.equal(result[0].json.postUrl, 'https://clone.example/board/posts/42');
});
