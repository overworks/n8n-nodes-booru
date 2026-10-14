import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import {
	DEFAULT_BASE_URL,
	USER_AGENT,
	prepareRequest,
	receiveResponse,
	sendRequest,
} from './helpers';

const routing = {
	send: { preSend: [prepareRequest], paginate: true },
	operations: { pagination: sendRequest },
	output: { postReceive: [receiveResponse] },
};

export class Booru implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Booru',
		name: 'booru',
		icon: { light: 'file:../../icons/booru.svg', dark: 'file:../../icons/booru.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Search posts and tags on Danbooru-compatible servers',
		defaults: { name: 'Booru' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'booruApi', required: false }],
		requestDefaults: {
			baseURL: DEFAULT_BASE_URL,
			method: 'GET',
			url: '/posts.json',
			headers: { Accept: 'application/json' },
			json: true,
			timeout: 30000,
			disableFollowRedirect: true,
		},
		properties: [
			{
				displayName: 'Base URL',
				name: 'baseUrl',
				type: 'string',
				default: DEFAULT_BASE_URL,
				required: true,
				description:
					'Server for anonymous requests. When credentials are selected, their Base URL is used instead.',
			},
			{
				displayName: 'User Agent',
				name: 'userAgent',
				type: 'string',
				default: USER_AGENT,
				required: true,
				description:
					'Identify your integration to the server. Add your account ID, for example: n8n-nodes-booru/0.1.0 (user #1234).',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Post', value: 'post' },
					{ name: 'Tag', value: 'tag' },
				],
				default: 'post',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['post'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						action: 'Get a post',
						description: 'Get a post by ID',
						routing,
					},
					{
						name: 'Search',
						value: 'search',
						action: 'Search posts',
						description: 'Search posts using Danbooru tags',
						routing,
					},
				],
				default: 'search',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['tag'] } },
				options: [
					{
						name: 'Search',
						value: 'search',
						action: 'Search tags',
						description: 'Find tags by name and category',
						routing,
					},
				],
				default: 'search',
			},
			{
				displayName: 'Post ID',
				name: 'postId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['post'], operation: ['get'] } },
				description: 'ID of the post to retrieve',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				placeholder: 'landscape rating:g',
				displayOptions: { show: { resource: ['post'], operation: ['search'] } },
				description:
					'Danbooru search query, including metatags. Account-specific tag limits apply.',
			},
			{
				displayName: 'Name Matches',
				name: 'nameMatches',
				type: 'string',
				default: '',
				placeholder: 'landscape*',
				displayOptions: { show: { resource: ['tag'] } },
				description: 'Tag name or wildcard pattern. Use * for multiple characters.',
			},
			{
				displayName: 'Category',
				name: 'category',
				type: 'options',
				options: [
					{ name: 'All', value: 'all' },
					{ name: 'Artist', value: '1' },
					{ name: 'Character', value: '4' },
					{ name: 'Copyright', value: '3' },
					{ name: 'General', value: '0' },
					{ name: 'Meta', value: '5' },
				],
				default: 'all',
				displayOptions: { show: { resource: ['tag'] } },
			},
			{
				displayName: 'Sort By',
				name: 'tagOrder',
				type: 'options',
				options: [
					{ name: 'Name', value: 'name' },
					{ name: 'Newest', value: 'date' },
					{ name: 'Post Count', value: 'count' },
				],
				default: 'count',
				displayOptions: { show: { resource: ['tag'] } },
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: { show: { operation: ['search'] } },
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, numberPrecision: 0 },
				default: 50,
				displayOptions: { show: { operation: ['search'], returnAll: [false] } },
				description: 'Max number of results to return',
			},
			{
				displayName: 'Page',
				name: 'page',
				type: 'string',
				default: '1',
				displayOptions: { show: { operation: ['search'] } },
				description:
					'Starting page, numbered from 1. For posts in default ID order, use b12345 to start before post 12345.',
			},
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				options: [
					{
						name: 'Raw',
						value: 'raw',
						description: 'Return each post with all original API fields',
					},
					{
						name: 'Normalized',
						value: 'normalized',
						description: 'Return common fields and preserve the original post under raw',
					},
				],
				default: 'raw',
				displayOptions: { show: { resource: ['post'] } },
			},
			{
				displayName: 'Request Interval (Ms)',
				name: 'requestInterval',
				type: 'number',
				typeOptions: { minValue: 1000, maxValue: 60000, numberPrecision: 0 },
				default: 1000,
				description:
					'Minimum time between request starts across input items and pages in this node execution',
			},
		],
	};
}
