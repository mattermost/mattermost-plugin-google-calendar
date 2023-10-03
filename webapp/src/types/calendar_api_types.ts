export type CreateEventPayload = {
    all_day: boolean;
    attendees: string[]; // list of Mattermost UserIDs or email addresses
    date: string;
    start_time: string;
    end_time: string;
    reminder?: number;
    description?: string;
    subject: string;
    location?: string;
    channel_id?: string;
}
