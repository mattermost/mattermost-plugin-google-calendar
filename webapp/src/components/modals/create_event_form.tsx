// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {useSelector, useDispatch} from 'react-redux';

import {Modal} from 'react-bootstrap';

import {getTheme} from 'mattermost-redux/selectors/entities/preferences';

import {CreateEventPayload} from '@/types/calendar_api_types';

import {getModalStyles} from '@/utils/styles';

import FormButton from '@/components/form_button';
import Loading from '@/components/loading';
import Setting from '@/components/setting';
import AttendeeSelector from '@/components/attendee_selector';
import TimeSelector from '@/components/time_selector';
import ChannelSelector from '../channel_selector';
import {capitalizeFirstCharacter} from '@/utils/text';
import {CreateCalendarEventResponse, createCalendarEvent} from '@/actions';
import {getTodayString} from '@/utils/datetime';

import './create_event_form.scss';

type Props = {
    close: (e?: Event) => void;
};

export default function CreateEventForm(props: Props) {
    const [storedError, setStoredError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(false);

    const dispatch = useDispatch();

    const [formValues, setFormValues] = useState<CreateEventPayload>({
        subject: '',
        all_day: false,
        attendees: [],
        date: getTodayString(),
        start_time: '',
        end_time: '',
        description: '',
        channel_id: '',
        location: '',
    });

    const setFormValue = <Key extends keyof CreateEventPayload>(name: Key, value: CreateEventPayload[Key]) => {
        setFormValues((values: CreateEventPayload) => ({
            ...values,
            [name]: value,
        }));
    };

    const theme = useSelector(getTheme);

    const handleClose = (e?: Event) => {
        if (e && e.preventDefault) {
            e.preventDefault();
        }

        props.close();
    };

    const handleError = (error: string) => {
        const errorMessage = capitalizeFirstCharacter(error);
        setStoredError(errorMessage);
        setSubmitting(false);
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e && e.preventDefault) {
            e.preventDefault();
        }

        // add required field validation

        setSubmitting(true);

        const response = (await dispatch(createCalendarEvent(formValues))) as CreateCalendarEventResponse;
        if (response.error) {
            handleError(response.error);
            return;
        }

        handleClose();
    };

    const style = getModalStyles(theme);

    const disableSubmit = false;
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
                btnClass='btn btn-primary'
                saving={submitting}
                disabled={disableSubmit}
            >
                {'Create'}
            </FormButton>
        </React.Fragment>
    );

    let form;
    if (loading) {
        form = <Loading/>;
    } else {
        form = (
            <ActualForm
                formValues={formValues}
                setFormValue={setFormValue}
            />
        );
    }

    let error;
    if (storedError) {
        error = (
            <p className='alert alert-danger'>
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
            <Modal.Body
                style={style.modalBody}
            >
                {error}
                {form}
            </Modal.Body>
            <Modal.Footer style={style.modalFooter}>
                {footer}
            </Modal.Footer>
        </form>
    );
}

type ActualFormProps = {
    formValues: CreateEventPayload;
    setFormValue: <Key extends keyof CreateEventPayload>(name: Key, value: CreateEventPayload[Key]) => Promise<{ error?: string }>;
}

const ActualForm = (props: ActualFormProps) => {
    const {formValues, setFormValue} = props;

    const theme = useSelector(getTheme);

    const components = [
        {
            label: 'Subject',
            required: true,
            component: (
                <input
                    onChange={(e) => setFormValue('subject', e.target.value)}
                    value={formValues.subject}
                    className='form-control'
                />
            ),
        },
        {
            label: 'Location (optional)',
            required: false,
            component: (
                <input
                    onChange={(e) => setFormValue('location', e.target.value)}
                    value={formValues.location}
                    className='form-control'
                />
            ),
        },
        {
            label: 'Guests (optional)',
            component: (
                <AttendeeSelector
                    onChange={(selected) => setFormValue('attendees', selected)}
                />
            ),
        },
        {
            label: 'Date',
            required: true,
            component: (
                <input
                    onChange={(e) => {
                        setFormValue('date', e.target.value);
                        setFormValue('start_time', '');
                        setFormValue('end_time', '');
                    }}
                    min={getTodayString()}
                    value={formValues.date}
                    className='form-control'
                    type='date'
                />
            ),
        },
        {
            label: 'Start Time',
            required: true,
            component: (
                <TimeSelector
                    value={formValues.start_time}
                    endTime={formValues.end_time}
                    date={formValues.date}
                    onChange={(value) => setFormValue('start_time', value)}
                />
            ),
        },
        {
            label: 'End Time',
            required: true,
            component: (
                <TimeSelector
                    value={formValues.end_time}
                    startTime={formValues.start_time}
                    date={formValues.date}
                    onChange={(value) => setFormValue('end_time', value)}
                />
            ),
        },
        {
            label: 'Description (optional)',
            component: (
                <textarea
                    onChange={(e) => setFormValue('description', e.target.value)}
                    value={formValues.description}
                    className='form-control'
                />
            ),
        },
        {
            label: 'Link event to channel (optional)',
            component: (
                <ChannelSelector
                    onChange={(selected) => setFormValue('channel_id', selected)}
                />
            ),
        },

    ];

    return (
        <div className='mscalendar-create-event-form'>
            {components.map((c) => (
                <Setting
                    key={c.label}
                    label={c.label}
                    inputId={c.label}
                    required={c.required}
                >
                    {c.component}
                </Setting>
            ))}
        </div>
    );
};
