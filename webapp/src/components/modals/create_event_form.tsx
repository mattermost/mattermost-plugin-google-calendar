import React, {useState} from 'react';
import {useSelector} from 'react-redux';

import {Modal as BootstrapModal} from 'react-bootstrap';

// react-bootstrap is provided by the Mattermost runtime, not bundled by the
// plugin. The installed @types/react-bootstrap don't match that runtime version,
// so we cast through unknown to a compatible FC type.
type ModalSectionProps = React.PropsWithChildren<{ style?: React.CSSProperties }>;
const ModalBody = BootstrapModal.Body as unknown as React.FC<ModalSectionProps>;
const ModalFooter = BootstrapModal.Footer as unknown as React.FC<ModalSectionProps>;

import {getTheme} from 'mattermost-redux/selectors/entities/preferences';

import ChannelSelector from '../channel_selector';

import {CreateEventPayload} from '@/types/calendar_api_types';

import {getModalStyles} from '@/utils/styles';

import FormButton from '@/components/form_button';
import Setting from '@/components/setting';
import AttendeeSelector from '@/components/attendee_selector';
import TimeSelector from '@/components/time_selector';
import DateInput from '@/components/date_input';
import {capitalizeFirstCharacter} from '@/utils/text';
import {useAppDispatch} from '@/hooks';
import {createCalendarEvent, refreshActiveCalendarView} from '@/actions';
import {getEarliestTimeForToday, getTodayString} from '@/utils/datetime';
import {getCreateEventModal} from '@/selectors';

import './create_event_form.scss';

type Props = {
    close: (e?: Event) => void;
};

export default function CreateEventForm(props: Props) {
    const [storedError, setStoredError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const dispatch = useAppDispatch();
    const modalData = useSelector(getCreateEventModal);

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

    const theme = useSelector(getTheme);

    const handleClose = () => {
        props.close();
    };

    const handleError = (error: string) => {
        const errorMessage = capitalizeFirstCharacter(error);
        setStoredError(errorMessage);
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e && e.preventDefault) {
            e.preventDefault();
        }

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
            const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
            handleError(message);
            setSubmitting(false);
        }
    };

    const style = getModalStyles(theme);

    const disableSubmit = !formValues.subject.trim() ||
        !formValues.date ||
        (!formValues.all_day && (!formValues.start_time || !formValues.end_time)) ||
        (!formValues.all_day && formValues.start_time >= formValues.end_time);
    const footer = (
        <React.Fragment>
            <FormButton
                type='button'
                btnClass='btn-link'
                defaultMessage='Cancel'
                onClick={handleClose}
            />
            <FormButton
                id='submit-button'
                type='submit'
                btnClass='btn-primary'
                saving={submitting}
                disabled={disableSubmit}
            >
                {'Create'}
            </FormButton>
        </React.Fragment>
    );

    const form = (
        <ActualForm
            formValues={formValues}
            setFormValue={setFormValue}
        />
    );

    let error;
    if (storedError) {
        error = (
            <p
                className='alert alert-danger'
                role='alert'
            >
                <i
                    style={{marginRight: '10px'}}
                    className='fa fa-warning'
                    title='Warning Icon'
                />
                <span>{storedError}</span>
            </p>
        );
    }

    return (
        <form
            role='form'
            onSubmit={handleSubmit}
        >
            <ModalBody
                style={style.modalBody}
            >
                {error}
                {form}
            </ModalBody>
            <ModalFooter style={style.modalFooter}>
                {footer}
            </ModalFooter>
        </form>
    );
}

type ActualFormProps = {
    formValues: CreateEventPayload;
    setFormValue: <Key extends keyof CreateEventPayload>(name: Key, value: CreateEventPayload[Key]) => void;
}

const ActualForm = (props: ActualFormProps) => {
    const {formValues, setFormValue} = props;

    const components = [
        {
            id: 'subject',
            label: 'Subject',
            required: true,
            component: (
                <input
                    id='subject'
                    onChange={(e) => setFormValue('subject', e.target.value)}
                    value={formValues.subject}
                    className='form-control'
                />
            ),
        },
        {
            id: 'location',
            label: 'Location (optional)',
            required: false,
            component: (
                <input
                    id='location'
                    onChange={(e) => setFormValue('location', e.target.value)}
                    value={formValues.location}
                    className='form-control'
                />
            ),
        },
        {
            id: 'attendees',
            label: 'Guests (optional)',
            component: (
                <AttendeeSelector
                    inputId='attendees'
                    value={formValues.attendees}
                    onChange={(selected) => setFormValue('attendees', selected)}
                />
            ),
        },
        {
            id: 'date',
            label: 'Date',
            required: true,
            component: (
                <DateInput
                    id='date'
                    value={formValues.date}
                    min={getTodayString()}
                    onChange={(value) => {
                        setFormValue('date', value);

                        // Only clear the times when they become invalid for the new
                        // date (i.e. now in the past when switching to today), so the
                        // form stays submittable after simply changing the date.
                        const startInPast = value === getTodayString() &&
                            formValues.start_time !== '' &&
                            formValues.start_time < getEarliestTimeForToday();
                        if (startInPast) {
                            setFormValue('start_time', '');
                            setFormValue('end_time', '');
                        }
                    }}
                    className='form-control'
                />
            ),
        },
        {
            id: 'start_time',
            label: 'Start Time',
            required: true,
            component: (
                <TimeSelector
                    inputId='start_time'
                    name='start_time'
                    value={formValues.start_time}
                    endTime={formValues.end_time}
                    date={formValues.date}
                    onChange={(name: keyof CreateEventPayload, value: string) => setFormValue(name, value)}
                />
            ),
        },
        {
            id: 'end_time',
            label: 'End Time',
            required: true,
            component: (
                <TimeSelector
                    inputId='end_time'
                    name='end_time'
                    value={formValues.end_time}
                    startTime={formValues.start_time}
                    date={formValues.date}
                    onChange={(name: keyof CreateEventPayload, value: string) => setFormValue(name, value)}
                />
            ),
        },
        {
            id: 'description',
            label: 'Description (optional)',
            component: (
                <textarea
                    id='description'
                    onChange={(e) => setFormValue('description', e.target.value)}
                    value={formValues.description}
                    className='form-control'
                />
            ),
        },
        {
            id: 'channel_id',
            label: 'Link event to channel (optional)',
            component: (
                <ChannelSelector
                    inputId='channel_id'
                    value={formValues.channel_id || null}
                    onChange={(selected) => setFormValue('channel_id', selected)}
                />
            ),
        },

    ];

    return (
        <div className='gcal-create-event-form'>
            {components.map((c) => (
                <Setting
                    key={c.id}
                    label={c.label}
                    inputId={c.id}
                    required={c.required}
                >
                    {c.component}
                </Setting>
            ))}
        </div>
    );
};
