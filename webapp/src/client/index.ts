import {Client4} from 'mattermost-redux/client';
import {ClientError} from '@mattermost/client';
import {Options} from '@mattermost/types/client4';

export const doFetch = async (url: string, options: Options) => {
    const {data} = await doFetchWithResponse(url, options);

    return data;
};

export const doFetchWithResponse = async (url: string, options: Options = {}) => {
    const response = await fetch(url, Client4.getOptions(options));

    let data: any;
    if (response.status !== 204) {
        const text = await response.text();
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }

    if (response.ok) {
        return {
            response,
            data,
        };
    }

    throw new ClientError(Client4.url, {
        message: typeof data === 'string' ? data : (data?.message || data?.error || response.statusText || 'Request failed'),
        status_code: response.status,
        url,
    });
};
