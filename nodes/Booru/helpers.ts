import {
	NodeApiError,
	NodeOperationError,
	sleepWithAbort,
	type DeclarativeRestApiSettings,
	type IDataObject,
	type IExecutePaginationFunctions,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
	type JsonObject,
} from 'n8n-workflow';

export const DEFAULT_BASE_URL = 'https://danbooru.donmai.us';
export const USER_AGENT = 'n8n-nodes-booru/0.1.0 (https://github.com/overworks/n8n-nodes-booru)';
const PAGE_SIZE = 200;
const MAX_RETRIES = 3;
const MAX_PAGES = 1000;

export function validateBaseUrl(value: string): string {
	let url: URL | undefined;
	try {
		url = new URL(value.trim());
	} catch {
		/* Report a validation error below; the caller supplies the n8n node context. */
	}
	if (!url) throw new Error('Base URL must be an absolute HTTP or HTTPS URL');
	if (
		!['https:', 'http:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new Error(
			'Base URL must use HTTP or HTTPS without credentials, query parameters, or a fragment',
		);
	}
	return url.toString().replace(/\/+$/, '');
}

function isRecord(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): number | undefined {
	const number =
		typeof value === 'number'
			? value
			: typeof value === 'string' && /^\d+$/.test(value)
				? Number(value)
				: NaN;
	return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export async function prepareRequest(
	this: IExecuteSingleFunctions,
	options: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const credentials = this.getNode().credentials?.booruApi
		? await this.getCredentials('booruApi')
		: undefined;
	let baseUrl: string;
	try {
		baseUrl = validateBaseUrl(String(credentials?.baseUrl ?? this.getNodeParameter('baseUrl')));
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error);
	}
	const resource = this.getNodeParameter('resource') as string;
	const operation = this.getNodeParameter('operation') as string;
	const userAgent = String(this.getNodeParameter('userAgent')).trim();
	if (!userAgent || /[\r\n]/.test(userAgent)) {
		throw new NodeOperationError(
			this.getNode(),
			'User Agent must be a non-empty, single-line identifier',
		);
	}
	options.headers = { ...options.headers, Accept: 'application/json', 'User-Agent': userAgent };
	options.disableFollowRedirect = true;
	// Handle status codes before host error wrappers can discard Retry-After.
	options.ignoreHttpStatusErrors = true;
	options.qs = { ...options.qs };
	if (resource === 'post' && operation === 'get') {
		const id = positiveInteger(this.getNodeParameter('postId'));
		if (id === undefined) {
			throw new NodeOperationError(this.getNode(), 'Post ID must be a positive integer');
		}
		options.url = `${baseUrl}/posts/${id}.json`;
		return options;
	}
	if (operation !== 'search' || !['post', 'tag'].includes(resource)) {
		throw new NodeOperationError(this.getNode(), 'Unsupported Booru operation');
	}
	options.url = `${baseUrl}/${resource === 'post' ? 'posts' : 'tags'}.json`;
	const page = String(this.getNodeParameter('page', '1')).trim();
	const pageNumber = positiveInteger(page.startsWith('b') ? page.slice(1) : page);
	if (
		pageNumber === undefined ||
		!/^\d+$|^b\d+$/.test(page) ||
		(resource === 'tag' && page.startsWith('b'))
	) {
		throw new NodeOperationError(
			this.getNode(),
			'Page must be a positive integer, or b followed by a post ID for posts',
		);
	}
	options.qs.page = page.startsWith('b') ? `b${pageNumber}` : pageNumber;
	const returnAll = this.getNodeParameter('returnAll', false) as boolean;
	const limit = positiveInteger(this.getNodeParameter('limit', 50));
	if (!returnAll && limit === undefined) {
		throw new NodeOperationError(this.getNode(), 'Limit must be a positive integer');
	}
	options.qs.limit = returnAll ? PAGE_SIZE : Math.min(PAGE_SIZE, limit!);
	if (resource === 'post') {
		const tags = String(this.getNodeParameter('tags', '')).trim();
		options.qs.tags = tags;
		const orders = [...tags.matchAll(/(?:^|\s)order:([^\s]+)/gi)].map((match) =>
			match[1].toLowerCase(),
		);
		if (page.startsWith('b') && orders.some((order) => order !== 'id_desc')) {
			throw new NodeOperationError(
				this.getNode(),
				'ID cursor pagination requires the default post order or order:id_desc',
			);
		}
		if (orders.includes('random') && (returnAll || limit! > PAGE_SIZE)) {
			throw new NodeOperationError(
				this.getNode(),
				'Random searches require Return All to be off and Limit to be at most 200',
			);
		}
	} else {
		options.qs['search[name_matches]'] = String(this.getNodeParameter('nameMatches', '')).trim();
		options.qs['search[order]'] = this.getNodeParameter('tagOrder', 'count') as string;
		const category = this.getNodeParameter('category', 'all');
		if (category !== 'all') options.qs['search[category]'] = category as string;
	}
	return options;
}

export async function receiveResponse(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	if (response.statusCode < 200 || response.statusCode >= 300) {
		const retryAfter = response.headers['retry-after'] ?? response.headers['Retry-After'];
		throw new NodeApiError(this.getNode(), {
			statusCode: response.statusCode,
			response: {
				status: response.statusCode,
				headers: retryAfter === undefined ? {} : { 'retry-after': String(retryAfter) },
			},
		});
	}
	const isSingle = this.getNodeParameter('operation') === 'get';
	const body = response.body;
	if ((isSingle && !isRecord(body)) || (!isSingle && !Array.isArray(body))) {
		throw new NodeOperationError(this.getNode(), 'Expected a Danbooru-compatible JSON response', {
			description:
				'Check the Base URL. Gelbooru, Moebooru, and e621 require different API adapters.',
		});
	}
	const records = isSingle ? [body] : (body as unknown[]);
	if (!records.every((record) => isRecord(record) && positiveInteger(record.id) !== undefined)) {
		throw new NodeOperationError(this.getNode(), 'The API returned a record without a valid ID');
	}
	return (records as IDataObject[]).map((json) => ({ json }));
}

export function retryDetails(error: unknown): { status?: number; retryAfter?: string } {
	const result: { status?: number; retryAfter?: string } = {};
	const pending: unknown[] = [error];
	const visited = new Set<object>();
	while (pending.length && visited.size < 16) {
		const current = pending.shift();
		if (!isRecord(current) || visited.has(current)) continue;
		visited.add(current);
		const response = isRecord(current.response) ? current.response : undefined;
		const headers = isRecord(response?.headers)
			? response.headers
			: isRecord(current.headers)
				? current.headers
				: undefined;
		const status = Number(
			response?.status ??
				response?.statusCode ??
				current.statusCode ??
				current.httpCode ??
				current.status,
		);
		if (Number.isInteger(status) && status >= 100 && status <= 599) result.status ??= status;
		const retryAfter = headers?.['retry-after'] ?? headers?.['Retry-After'];
		if (retryAfter !== undefined) result.retryAfter ??= String(retryAfter);
		// n8n can wrap HTTP errors and keep the response headers below the outer status.
		pending.push(current.cause, current.errorResponse, current.reason);
	}
	return result;
}

export function retryDelay(
	retryAfter: string | undefined,
	attempt: number,
	now = Date.now(),
): number {
	const backoff = 1000 * 2 ** attempt;
	if (!retryAfter) return backoff;
	const seconds = Number(retryAfter);
	const serverDelay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now;
	return Number.isFinite(serverDelay) ? Math.max(backoff, serverDelay) : backoff;
}

async function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
	// Give each sleep its own signal so long searches do not accumulate listeners
	// on n8n's execution signal in host versions whose helper leaves them attached.
	const controller = new AbortController();
	const onAbort = () => controller.abort(signal?.reason);
	if (signal?.aborted) onAbort();
	signal?.addEventListener('abort', onAbort, { once: true });
	try {
		await sleepWithAbort(ms, controller.signal);
	} finally {
		signal?.removeEventListener('abort', onAbort);
		controller.abort();
	}
}

async function waitForRequest(this: IExecutePaginationFunctions): Promise<void> {
	const interval = Number(this.getNodeParameter('requestInterval', 1000));
	if (!Number.isFinite(interval) || interval < 1000 || interval > 60000) {
		throw new NodeOperationError(
			this.getNode(),
			'Request Interval must be between 1000 and 60000 milliseconds',
		);
	}
	// Shared by every input item in this node execution, including subsequent pages.
	const context = this.getContext('node');
	const signal = this.getExecutionCancelSignal();
	for (;;) {
		signal?.throwIfAborted();
		const now = Date.now();
		const start = Math.max(
			now,
			Number(context.booruNextRequestAt ?? 0),
			Number(context.booruPauseUntil ?? 0),
		);
		context.booruNextRequestAt = start + interval;
		if (start > now) await wait(start - now, signal);
		signal?.throwIfAborted();
		// A different input item may have received a 429 while this request was queued.
		if (Date.now() >= Number(context.booruPauseUntil ?? 0)) return;
	}
}

async function requestWithRetry(
	this: IExecutePaginationFunctions,
	request: DeclarativeRestApiSettings.ResultOptions,
): Promise<INodeExecutionData[]> {
	for (let attempt = 0; ; attempt++) {
		await waitForRequest.call(this);
		try {
			return await this.makeRoutingRequest(request);
		} catch (error) {
			const { status, retryAfter } = retryDetails(error);
			if (status === 410) {
				throw new NodeOperationError(this.getNode(), 'The server pagination limit was reached', {
					description:
						'For posts in default ID order, start a new search using Page b<last-post-id>. Account and server limits still apply.',
				});
			}
			if (status !== 429 || attempt >= MAX_RETRIES) {
				throw error instanceof NodeOperationError
					? error
					: new NodeApiError(this.getNode(), error as JsonObject, { httpCode: status?.toString() });
			}
			const delay = retryDelay(retryAfter, attempt);
			if (delay > 60000) {
				throw new NodeOperationError(this.getNode(), 'The server requested a longer retry delay', {
					description: `Wait at least ${Math.ceil(delay / 1000)} seconds before running this node again.`,
				});
			}
			const context = this.getContext('node');
			context.booruPauseUntil = Math.max(Number(context.booruPauseUntil ?? 0), Date.now() + delay);
		}
	}
}

export function normalizePost(post: IDataObject, baseUrl: string): IDataObject {
	const splitTags = (value: unknown) =>
		typeof value === 'string' && value.trim() ? value.trim().split(/\s+/) : [];
	return {
		id: post.id,
		postUrl: `${baseUrl}/posts/${post.id}`,
		fileUrl: post.file_url ?? null,
		previewUrl: post.preview_file_url ?? null,
		sampleUrl: post.large_file_url ?? null,
		width: post.image_width ?? null,
		height: post.image_height ?? null,
		rating: post.rating ?? null,
		score: post.score ?? null,
		source: post.source ?? null,
		tags: splitTags(post.tag_string),
		tagCategories: {
			general: splitTags(post.tag_string_general),
			artist: splitTags(post.tag_string_artist),
			copyright: splitTags(post.tag_string_copyright),
			character: splitTags(post.tag_string_character),
			meta: splitTags(post.tag_string_meta),
		},
		raw: post,
	};
}

export async function sendRequest(
	this: IExecutePaginationFunctions,
	request: DeclarativeRestApiSettings.ResultOptions,
): Promise<INodeExecutionData[]> {
	const resource = this.getNodeParameter('resource') as string;
	const operation = this.getNodeParameter('operation') as string;
	const returnAll =
		operation === 'search' && (this.getNodeParameter('returnAll', false) as boolean);
	const limit =
		operation === 'get' ? 1 : returnAll ? Infinity : Number(this.getNodeParameter('limit', 50));
	const result: INodeExecutionData[] = [];
	const seen = new Set<number>();
	const qs = { ...request.options.qs } as IDataObject;
	const random = resource === 'post' && /(?:^|\s)order:random(?:\s|$)/i.test(String(qs.tags ?? ''));
	let complete = false;
	for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
		if (operation === 'search') qs.limit = Math.min(PAGE_SIZE, limit - result.length);
		const page = await requestWithRetry.call(this, {
			...request,
			options: { ...request.options, qs: { ...qs } },
		});
		if (page.length === 0) {
			complete = true;
			break;
		}
		let added = 0;
		for (const item of page) {
			const id = positiveInteger(item.json.id)!;
			if (!seen.has(id)) {
				seen.add(id);
				result.push(item);
				added++;
				if (result.length >= limit) break;
			}
		}
		if (operation === 'get' || result.length >= limit || random) {
			complete = true;
			break;
		}
		if (added === 0) {
			throw new NodeOperationError(this.getNode(), 'The server returned a repeated page', {
				description:
					'The server may not support these pagination parameters. Narrow the search or use a compatible ID cursor.',
			});
		}
		if (String(qs.page).startsWith('b')) {
			const nextId = Math.min(...page.map((item) => Number(item.json.id)));
			if (nextId >= Number(String(qs.page).slice(1))) {
				throw new NodeOperationError(this.getNode(), 'The server did not advance the ID cursor');
			}
			qs.page = `b${nextId}`;
		} else {
			qs.page = Number(qs.page) + 1;
		}
	}
	if (!complete) {
		throw new NodeOperationError(
			this.getNode(),
			'Search exceeded 1000 pages. Narrow the search or resume from an ID cursor.',
		);
	}
	if (resource === 'post' && this.getNodeParameter('outputFormat', 'raw') === 'normalized') {
		const baseUrl = String(request.options.url).replace(/\/posts(?:\/\d+)?\.json$/, '');
		return result.map((item) => ({ ...item, json: normalizePost(item.json, baseUrl) }));
	}
	return result;
}
