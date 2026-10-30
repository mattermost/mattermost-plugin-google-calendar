import {act, render} from '@testing-library/react';

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

let comboProps: any;
jest.mock('@mattermost/compass-ui/components/combobox', () => ({
    Combobox: (props: any) => {
        comboProps = props;
        return null;
    },
}));

describe('ChannelSelector', () => {
    const renderSelector = async (value: string | null, onChange = jest.fn()) => {
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
            {id: 'c1', display_name: 'Town Square'},
            {id: 'c2', display_name: 'Off-Topic'},
        ]});
    });

    it('resolves a pre-filled channel id to its label', async () => {
        await renderSelector('c1');
        expect(comboProps.selectedOptions).toEqual([{label: 'Town Square', value: 'c1'}]);
    });

    it('reports the selected channel and clears to an empty string', async () => {
        const onChange = await renderSelector(null);

        act(() => comboProps.onChange('c2'));
        expect(onChange).toHaveBeenLastCalledWith('c2');

        act(() => comboProps.onChange(null));
        expect(onChange).toHaveBeenLastCalledWith('');
    });

    it('marks the field invalid and shows the error when loading fails', async () => {
        mockDispatch.mockResolvedValue({error: 'no access'});
        await renderSelector(null);
        expect(comboProps.invalid).toBe(true);
    });
});
