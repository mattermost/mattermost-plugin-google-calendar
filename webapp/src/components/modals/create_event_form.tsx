import React, {useState} from 'react';
import {useSelector} from 'react-redux';

import {Button} from '@mattermost/compass-ui/components/button';
import {Modal} from '@mattermost/compass-ui/components/modal';
import {SectionNotice} from '@mattermost/compass-ui/components/section-notice';
import {TextArea} from '@mattermost/compass-ui/components/text-area';
import {TextInput} from '@mattermost/compass-ui/components/text-input';

import {getCurrentTimezone} from 'mattermost-redux/selectors/entities/timezone';

import ChannelSelector from '../channel_selector';

import {CreateEventPayload} from '@/types/calendar_api_types';

import AttendeeSelector from '@/components/attendee_selector';
import TimeSelector from '@/components/time_selector';
import DateInput from '@/components/date_input';
import {capitalizeFirstCharacter} from '@/utils/text';
import {useAppDispatch} from '@/hooks';
import {createCalendarEvent, refreshActiveCalendarView} from '@/actions';
import {getEarliestTimeForToday, getTodayString} from '@/utils/datetime';
import {getCreateEventModal} from '@/selectors';

const FORM_ID = 'gcal-create-event-form';

const requiredLabel = (text: string) => (
    <>
        {text}
        <span
            className='gcal-required-star'
            aria-hidden={true}
        >{' *'}</span>
    </>
);

type Props = {
    open: boolean;
    close: (e?: Event) => void;
};

/** Create-event modal: manages field state, validation, and submission. */
export default function CreateEventForm(props: Props) {
    const [storedError, setStoredError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const dispatch = useAppDispatch();
    const modalData = useSelector(getCreateEventModal);
    const timezone = useSelector(getCurrentTimezone);

    const [formValues, setFormValues] = useState<CreateEventPayload>({
        subject: '',
        all_day: false,
        attendees: [],
        date: modalData?.date || getTodayString(),
        start_time: modalData?.startTime || '',
        end_time: modalData?.endTime || '',
        description: modalData?.description || '',
        channel_id: modalData?.channelId || '',
        location: '',
    });

    const setFormValue = <Key extends keyof CreateEventPayload>(name: Key, value: CreateEventPayload[Key]) => {
        setFormValues((values: CreateEventPayload) => ({
            ...values,
            [name]: value,
        }));
    };

    const handleClose = () => {
        props.close();
    };

    const handleError = (error: string) => {
        setStoredError(capitalizeFirstCharacter(error));
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault?.();

        if (submitting) {
            return;
        }

        setSubmitting(true);

        try {
            const response = await dispatch(createCalendarEvent(formValues));
            if (response.error) {
                handleError(response.error);
                setSubmitting(false);
                return;
            }
            handleClose();
            dispatch(refreshActiveCalendarView()).catch(() => { /* best-effort refresh */ });
        } catch (err: unknown) {
            handleError(err instanceof Error ? err.message : 'An unexpected error occurred.');
            setSubmitting(false);
        }
    };

    const dateInPast = Boolean(formValues.date) && formValues.date < getTodayString(timezone);

    const disableSubmit = !formValues.subject.trim() ||
        !formValues.date ||
        dateInPast ||
        (!formValues.all_day && (!formValues.start_time || !formValues.end_time)) ||
        (!formValues.all_day && formValues.start_time >= formValues.end_time);

    const footer = (
        <>
            <Button
                type='button'
                emphasis='tertiary'
                onClick={handleClose}
            >
                {'Cancel'}
            </Button>
            <Button
                id='submit-button'
                type='submit'
                form={FORM_ID}
                loading={submitting}
                disabled={disableSubmit}
            >
                {'Create'}
            </Button>
        </>
    );

    return (
        <Modal
            open={props.open}
            onClose={handleClose}
            title='Create Calendar Event'
            size='medium'
            footer={footer}
        >
            <form
                id={FORM_ID}
                role='form'
                className='gcal-create-event-form'
                onSubmit={handleSubmit}
            >
                {storedError && (
                    <SectionNotice
                        type='danger'
                        title={storedError}
                    />
                )}
                <TextInput
                    id='subject'
                    label={requiredLabel('Subject')}
                    required={true}
                    value={formValues.subject}
                    onChange={(e) => setFormValue('subject', e.target.value)}
                />
                <TextInput
                    id='location'
                    label='Location (optional)'
                    value={formValues.location}
                    onChange={(e) => setFormValue('location', e.target.value)}
                />
                <AttendeeSelector
                    inputId='attendees'
                    value={formValues.attendees}
                    onChange={(selected) => setFormValue('attendees', selected)}
                />
                <DateInput
                    id='date'
                    value={formValues.date}
                    invalid={dateInPast}
                    onChange={(value) => {
                        setFormValue('date', value);

                        // Only clear the times when they become invalid for the new
                        // date (i.e. now in the past when switching to today).
                        const startInPast = value === getTodayString(timezone) &&
                            formValues.start_time !== '' &&
                            formValues.start_time < getEarliestTimeForToday(timezone);
                        if (startInPast) {
                            setFormValue('start_time', '');
                            setFormValue('end_time', '');
                        }
                    }}
                />
                <div className='gcal-create-event-form__times'>
                    <TimeSelector
                        inputId='start_time'
                        name='start_time'
                        label={requiredLabel('Start Time')}
                        value={formValues.start_time}
                        endTime={formValues.end_time}
                        date={formValues.date}
                        onChange={(name: keyof CreateEventPayload, value: string) => setFormValue(name, value)}
                    />
                    <TimeSelector
                        inputId='end_time'
                        name='end_time'
                        label={requiredLabel('End Time')}
                        value={formValues.end_time}
                        startTime={formValues.start_time}
                        date={formValues.date}
                        onChange={(name: keyof CreateEventPayload, value: string) => setFormValue(name, value)}
                    />
                </div>
                <TextArea
                    id='description'
                    label='Description (optional)'
                    value={formValues.description}
                    onChange={(e) => setFormValue('description', e.target.value)}
                />
                <ChannelSelector
                    inputId='channel_id'
                    value={formValues.channel_id || null}
                    onChange={(selected) => setFormValue('channel_id', selected)}
                />
            </form>
        </Modal>
    );
}
