import {act, fireEvent, render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';

import CreateEventForm from './create_event_form';

let mockModalData: Record<string, string> = {};
const mockDispatch = jest.fn();

jest.mock('react-redux', () => ({
    useSelector: (selector: () => unknown) => selector(),
}));
jest.mock('mattermost-redux/selectors/entities/timezone', () => ({
    getCurrentTimezone: () => 'UTC',
}));
jest.mock('@/selectors', () => ({
    getCreateEventModal: () => mockModalData,
}));
jest.mock('@/hooks', () => ({
    useAppDispatch: () => mockDispatch,
}));
jest.mock('@/actions', () => ({
    createCalendarEvent: jest.fn(() => 'create'),
    refreshActiveCalendarView: jest.fn(() => 'refresh'),
}));
jest.mock('@/components/attendee_selector', () => () => null);
jest.mock('../channel_selector', () => () => null);
jest.mock('@/components/time_selector', () => () => null);
jest.mock('@/components/date_input', () => (props: {invalid?: boolean}) => (
    <div data-testid='date-input'>{props.invalid ? 'invalid' : 'valid'}</div>
));

const FUTURE = {date: '2999-01-01', startTime: '10:00', endTime: '10:30'};

describe('CreateEventForm', () => {
    const close = jest.fn();

    const renderForm = () => render(
        <CreateEventForm
            open={true}
            close={close}
        />,
    );

    const typeSubject = (value: string) => {
        fireEvent.change(screen.getByLabelText(/Subject/), {target: {value}});
    };

    const submit = async () => {
        await act(async () => {
            fireEvent.submit(document.getElementById('gcal-create-event-form')!);
        });
    };

    beforeEach(() => {
        mockModalData = {...FUTURE};
        mockDispatch.mockReset();
        mockDispatch.mockImplementation((action: string) => Promise.resolve(action === 'create' ? {data: {}} : {}));
    });

    it('marks required fields with a star', () => {
        renderForm();
        expect(screen.getByText('Subject').parentElement).toHaveTextContent('Subject *');
    });

    it('disables Create until a subject is entered', () => {
        renderForm();
        const create = screen.getByRole('button', {name: 'Create'});
        expect(create).toBeDisabled();

        typeSubject('Planning');
        expect(create).toBeEnabled();
    });

    it('keeps Create disabled when the end time is not after the start time', () => {
        mockModalData = {...FUTURE, endTime: '10:00'};
        renderForm();
        typeSubject('Planning');
        expect(screen.getByRole('button', {name: 'Create'})).toBeDisabled();
    });

    it('flags past dates and disables Create', () => {
        mockModalData = {...FUTURE, date: '2000-01-01'};
        renderForm();
        typeSubject('Planning');
        expect(screen.getByTestId('date-input')).toHaveTextContent('invalid');
        expect(screen.getByRole('button', {name: 'Create'})).toBeDisabled();
    });

    it('closes the modal after a successful submit', async () => {
        renderForm();
        typeSubject('Planning');
        await submit();
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('shows the submit error in a danger notice and stays open', async () => {
        mockDispatch.mockImplementation(() => Promise.resolve({error: 'calendar unavailable'}));
        renderForm();
        typeSubject('Planning');
        await submit();

        const notice = screen.getByRole('alert');
        expect(notice).toHaveTextContent('Calendar unavailable');
        expect(notice.className).toMatch(/section-notice--type-danger/);
        expect(close).not.toHaveBeenCalled();
    });

    it('closes when Cancel is clicked', () => {
        renderForm();
        fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
        expect(close).toHaveBeenCalledTimes(1);
    });
});
