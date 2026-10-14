import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class BooruApi implements ICredentialType {
	name = 'booruApi';
	displayName = 'Booru API';
	documentationUrl = 'https://github.com/overworks/n8n-nodes-booru#credentials';
	icon = { light: 'file:../icons/booru.svg', dark: 'file:../icons/booru.dark.svg' } as const;
	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://danbooru.donmai.us',
			required: true,
			description:
				'URL of your Danbooru-compatible server. Authenticated requests always use this server.',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			auth: {
				username: '={{$credentials.username}}',
				password: '={{$credentials.apiKey}}',
			},
		},
	};
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.trim().replace(/\\/+$/, "")}}',
			url: '/profile.json',
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'User-Agent': '=n8n-nodes-booru/0.1.0 (credential test; user {{$credentials.username}})',
			},
			disableFollowRedirect: true,
		},
	};
}
