export interface RemoteDateTime {
    dateTime: string;
    timeZone?: string;
}

export interface RemoteLocation {
    displayName?: string;
    locationType?: string;
}

export interface RemoteConference {
    application: string;
    url: string;
}

export interface RemoteAttendee {
    remoteId?: string;
    emailAddress?: {
        address: string;
        name?: string;
    };
    status?: {
        response?: string;
        time?: string;
    };
    type?: string;
}

export interface RemoteEventResponseStatus {
    response?: string;
    time?: string;
}

export interface RemoteEvent {
    id: string;
    subject: string;
    start?: RemoteDateTime;
    end?: RemoteDateTime;
    location?: RemoteLocation;
    conference?: RemoteConference;
    organizer?: RemoteAttendee;
    attendees?: RemoteAttendee[];
    responseStatus?: RemoteEventResponseStatus;
    importance?: string;
    iCalUId?: string;
    bodyPreview?: string;
    showAs?: string;
    weblink?: string;
    reminderMinutesBeforeStart?: number;
    isOrganizer?: boolean;
    isCancelled?: boolean;
    isAllDay?: boolean;
    responseRequested?: boolean;
}
