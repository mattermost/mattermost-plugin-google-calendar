import {Client4} from 'mattermost-redux/client';
import {ClientError} from '@mattermost/client';
import {Options} from '@mattermost/types/client4';

export const doFetch = async (url: string, options: Options) => {
    const {data} = await doFetchWithResponse(url, options);

    return data;
};

export const doFetchWithResponse = async (url: string, options: Options = {}) => {
    const response = await fetch(url, Client4.getOptions(options));

    const data = await response.json();

    if (response.ok) {
        return {
            response,
            data,
        };
    }

    throw new ClientError(Client4.url, {
        message: data || '',
        status_code: response.status,
        url,
    });
};
