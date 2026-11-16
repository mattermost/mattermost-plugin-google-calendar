import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import {GlobeIcon, LockOutlineIcon} from '@mattermost/compass-icons/components';

import ChannelSelector from './channel_selector';

const mockDispatch = jest.fn();

jest.mock('react-redux', () => ({
    useSelector: (selector: () => unknown) => selector(),
}));
jest.mock('mattermost-redux/selectors/entities/teams', () => ({
    getCurrentTeamId: () => 'team1',
}));
jest.mock('@/hooks', () => ({
    useAppDispatch: () => mockDispatch,
}));
jest.mock('@/actions', () => ({autocompleteUserChannels: jest.fn()}));

const LABEL = 'Link event to channel (optional)';

describe('ChannelSelector', () => {
    const renderSelector = async (value: string | null) => {
        const onChange = jest.fn();
        await act(async () => {
            render(
                <ChannelSelector
                    value={value}
                    onChange={onChange}
                />,
            );
        });
        return onChange;
    };

    beforeEach(() => {
        mockDispatch.mockReset();
        mockDispatch.mockResolvedValue({data: [
            {id: 'c1', display_name: 'Town Square', type: 'O'},
            {id: 'c2', display_name: 'Off-Topic', type: 'O'},
            {id: 'c3', display_name: 'Leads', type: 'P'},
        ]});
    });

    const iconPath = (icon: React.ReactElement) => render(icon, {container: document.createElement('div')}).container.querySelector('path')?.getAttribute('d');

    it('loads channels once on mount', async () => {
        await renderSelector(null);
        expect(mockDispatch).toHaveBeenCalledTimes(1);
    });

    it('marks public channels with a globe and private channels with a lock', async () => {
        await renderSelector(null);
        await userEvent.click(screen.getByRole('combobox', {name: LABEL}));
        const pathOf = (name: string) => screen.getByRole('option', {name}).querySelector('path')?.getAttribute('d');
        expect(pathOf('Town Square')).toBe(iconPath(<GlobeIcon/>));
        expect(pathOf('Leads')).toBe(iconPath(<LockOutlineIcon/>));
    });

    it('shows the selected channel type icon in the field', async () => {
        await renderSelector('c3');
        const paths = Array.from(document.querySelectorAll('path'), (p) => p.getAttribute('d'));
        expect(paths).toContain(iconPath(<LockOutlineIcon/>));
        expect(paths).not.toContain(iconPath(<GlobeIcon/>));
    });

    it('resolves a pre-filled channel id to its label', async () => {
        await renderSelector('c1');
        expect(screen.getByRole('combobox', {name: LABEL})).toHaveValue('Town Square');
    });

    it('reports the selected channel', async () => {
        const onChange = await renderSelector(null);
        await userEvent.click(screen.getByRole('combobox', {name: LABEL}));
        await userEvent.click(await screen.findByRole('option', {name: 'Off-Topic'}));
        expect(onChange).toHaveBeenLastCalledWith('c2');
    });

    it('clears to an empty string', async () => {
        const onChange = await renderSelector('c1');
        await userEvent.click(screen.getByRole('button', {name: /clear/i}));
        expect(onChange).toHaveBeenLastCalledWith('');
    });

    it('marks the field invalid and shows the error when loading fails', async () => {
        mockDispatch.mockResolvedValue({error: 'no access'});
        await renderSelector(null);
        expect(screen.getByRole('combobox', {name: LABEL})).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('alert')).toHaveTextContent('no access');
    });
});
