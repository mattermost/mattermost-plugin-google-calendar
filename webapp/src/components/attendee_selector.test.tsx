import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import AttendeeSelector from './attendee_selector';

const mockDispatch = jest.fn();
jest.mock('react-redux', () => ({
    useSelector: (selector: () => unknown) => selector(),
}));
jest.mock('@/selectors', () => ({getSiteURL: () => 'http://mm.test'}));
jest.mock('@/hooks', () => ({
    useAppDispatch: () => mockDispatch,
}));
jest.mock('@/actions', () => ({autocompleteConnectedUsers: jest.fn()}));

const USERS = {data: [
    {mm_id: 'u1', mm_display_name: 'User One'},
    {mm_id: 'u2', mm_display_name: 'User Two'},
]};

describe('AttendeeSelector', () => {
    const setup = async (value: string[] = []) => {
        const onChange = jest.fn();
        await act(async () => {
            render(
                <AttendeeSelector
                    inputId='attendees'
                    value={value}
                    onChange={onChange}
                />,
            );
        });
        return onChange;
    };

    beforeEach(() => {
        mockDispatch.mockReset();
        mockDispatch.mockResolvedValue(USERS);
    });

    it('selects a connected user from the list', async () => {
        const onChange = await setup();
        await userEvent.click(screen.getByRole('combobox', {name: 'Guests (optional)'}));
        await userEvent.click(await screen.findByRole('option', {name: 'User Two'}));
        expect(onChange).toHaveBeenLastCalledWith(['u2']);
    });

    it('hides already selected users from the list', async () => {
        await setup(['u1']);
        await userEvent.click(screen.getByRole('combobox', {name: 'Guests (optional)'}));
        expect(await screen.findByRole('option', {name: 'User Two'})).toBeInTheDocument();
        expect(screen.queryByRole('option', {name: 'User One'})).not.toBeInTheDocument();
    });

    it('adds a typed email address', async () => {
        const onChange = await setup(['u1']);
        await userEvent.type(screen.getByRole('combobox', {name: 'Guests (optional)'}), 'new@example.com');
        await userEvent.click(await screen.findByRole('option', {name: /new@example\.com/}));
        expect(onChange).toHaveBeenLastCalledWith(['u1', 'new@example.com']);
    });

    it('shows connected users with their avatar in the list', async () => {
        const onChange = await setup();
        await userEvent.click(screen.getByRole('combobox', {name: 'Guests (optional)'}));
        const option = await screen.findByRole('option', {name: 'User One'});
        expect(option.querySelector('img')).toHaveAttribute('src', 'http://mm.test/api/v4/users/u1/image');
        await userEvent.click(option);
        expect(onChange).toHaveBeenLastCalledWith(['u1']);
    });

    it('renders chips with the user avatar, or a person icon for an email guest', async () => {
        await setup(['u1', 'guest@example.com']);
        const avatars = document.querySelectorAll('img[src="http://mm.test/api/v4/users/u1/image"]');
        expect(avatars).toHaveLength(1);
        expect(screen.getByText('guest@example.com').closest('[data-chip]')?.querySelector('svg')).toBeInTheDocument();
    });

    it('ignores invalid email addresses', async () => {
        const onChange = await setup();
        await userEvent.type(screen.getByRole('combobox', {name: 'Guests (optional)'}), 'not-an-email');
        await userEvent.click(await screen.findByRole('option', {name: /not-an-email/}));
        expect(onChange).not.toHaveBeenCalled();
    });

    it('does not offer an already added email address', async () => {
        await setup(['a@example.com']);
        await userEvent.type(screen.getByRole('combobox', {name: 'Guests (optional)'}), 'A@example.com');
        expect(screen.queryByRole('option', {name: /A@example\.com/i})).not.toBeInTheDocument();
    });

    it('shows the load error and stops loading when the request fails', async () => {
        mockDispatch.mockRejectedValue(new Error('network down'));
        await setup();
        expect(screen.getByRole('alert')).toHaveTextContent('network down');
        await userEvent.click(screen.getByRole('combobox', {name: 'Guests (optional)'}));
        expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument();
    });
});
