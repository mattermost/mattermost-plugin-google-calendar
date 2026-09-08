import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('react-redux', () => ({
    useSelector: jest.fn(),
    useDispatch: jest.fn(() => jest.fn()),
}));

jest.mock('./create_event_form', () => {
    return {
        __esModule: true,
        default: (props: {close: () => void}) => (
            <div data-testid='create-event-form'>
                <button onClick={props.close}>{'mock-close'}</button>
            </div>
        ),
    };
});

import {useSelector} from 'react-redux';

import CreateEventModal from './create_event_modal';

const mockUseSelector = useSelector as jest.MockedFunction<typeof useSelector>;

describe('CreateEventModal', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('returns null when modal is not visible', () => {
        mockUseSelector.mockReturnValue(false);
        const {container} = render(<CreateEventModal/>);
        expect(container.firstChild).toBeNull();
    });

    it('renders modal with title when visible', () => {
        mockUseSelector.mockReturnValue(true);
        render(<CreateEventModal/>);
        expect(screen.getByText('Create Calendar Event')).toBeInTheDocument();
    });

    it('renders CreateEventForm inside the modal', () => {
        mockUseSelector.mockReturnValue(true);
        render(<CreateEventModal/>);
        expect(screen.getByTestId('create-event-form')).toBeInTheDocument();
    });
});
