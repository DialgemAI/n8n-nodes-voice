import type {
	IDataObject,
	IHookFunctions,
	IHttpRequestMethods,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { verifySignature } from './signature';

type Stored = { hookId?: string; secret?: string; event?: string; url?: string };

async function call(
	ctx: IHookFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
): Promise<IDataObject> {
	const { baseUrl } = (await ctx.getCredentials('dialgemApi')) as { baseUrl?: string };
	const root = (baseUrl || 'https://api.dialgem.com').replace(/\/+$/, '');
	return (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'dialgemApi', {
		method,
		url: `${root}${path}`,
		body,
		json: true,
	})) as IDataObject;
}

export class DialgemTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Dialgem Trigger',
		name: 'dialgemTrigger',
		icon: 'file:dialgem.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when a Dialgem call starts, ends or has been analyzed',
		defaults: { name: 'Dialgem Trigger' },
		inputs: [],
		outputs: ['main'],
		credentials: [{ name: 'dialgemApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				default: 'call_ended',
				options: [
					{ name: 'Call Started', value: 'call_started', description: 'A call has connected' },
					{ name: 'Call Ended', value: 'call_ended', description: 'A call has finished' },
					{
						name: 'Call Analyzed',
						value: 'call_analyzed',
						description: 'Post-call analysis (summary, extracted data) is ready',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			// Only treat the subscription as live when we hold both its id and its secret. The secret is
			// shown by Dialgem once, so without it we must subscribe again.
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const stored = this.getWorkflowStaticData('node') as Stored;
				const url = this.getNodeWebhookUrl('default');
				const event = this.getNodeParameter('event') as string;
				return Boolean(stored.hookId && stored.secret && stored.url === url && stored.event === event);
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const stored = this.getWorkflowStaticData('node') as Stored;
				const url = this.getNodeWebhookUrl('default') as string;
				const event = this.getNodeParameter('event') as string;

				let made = await call(this, 'POST', '/v1/hooks/subscribe', { target_url: url, event });
				if (!made.secret) {
					// The same address was already subscribed and Dialgem will not show its secret again.
					// Replace it so that we hold one.
					await call(this, 'DELETE', `/v1/hooks/${String(made.id)}`);
					made = await call(this, 'POST', '/v1/hooks/subscribe', { target_url: url, event });
				}
				if (!made.id || !made.secret) {
					throw new NodeOperationError(this.getNode(), 'Dialgem did not return a subscription secret.');
				}
				stored.hookId = String(made.id);
				stored.secret = String(made.secret);
				stored.url = url;
				stored.event = event;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const stored = this.getWorkflowStaticData('node') as Stored;
				if (stored.hookId) {
					try {
						await call(this, 'DELETE', `/v1/hooks/${stored.hookId}`);
					} catch {
						return false;
					}
				}
				delete stored.hookId;
				delete stored.secret;
				delete stored.url;
				delete stored.event;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();
		const stored = this.getWorkflowStaticData('node') as Stored;

		const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
		const body = raw ?? Buffer.from(JSON.stringify(this.getBodyData()), 'utf8');
		const header = req.headers['x-dialgem-signature'];
		const ok = verifySignature({
			secret: stored.secret ?? '',
			body,
			header: Array.isArray(header) ? header[0] : header,
		});
		if (!ok) {
			res.status(401).send('Invalid signature');
			return { noWebhookResponse: true };
		}
		return { workflowData: [this.helpers.returnJsonArray(this.getBodyData() as IDataObject)] };
	}
}
