import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class DialgemApi implements ICredentialType {
	name = 'dialgemApi';

	displayName = 'Dialgem API';

	documentationUrl = 'https://docs.dialgem.com';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Create a key in the Dialgem dashboard under Settings, API keys. It needs the webhooks permission.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.dialgem.com',
			description: 'Only change this for a self-hosted Dialgem.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: { Authorization: '=Bearer {{$credentials.apiKey}}' },
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/v1/hooks/me',
		},
	};
}
