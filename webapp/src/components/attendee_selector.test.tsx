import {act, render} from '@testing-library/react';

import AttendeeSelector from './attendee_selector';

const mockDispatch = jest.fn().mockResolvedValue({data: [
    {mm_id: 'u1', mm_display_name: 'User One'},
    {mm_id: 'u2', mm_display_name: 'User Two'},
]});
jest.mock('@/hooks', () => ({
    useAppDispatch: () => mockDispatch,
}));
jest.mock('@/actions', () => ({autocompleteConnectedUsers: jest.fn()}));

let comboProps: any;
jest.mock('@mattermost/compass-ui/components/combobox', () => ({
    Combobox: (props: any) => {
        comboProps = props;
        return <div data-testid='combobox'/>;
    },
}));

describe('AttendeeSelector', () => {
    const setup = async (value: string[] = []) => {
        const onChange = jest.fn();
        await act(async () => {
            render(
                <AttendeeSelector
                    value={value}
                    onChange={onChange}
                />,
            );
        });
        return onChange;
    };

    it('hides already selected values from the options', async () => {
        await setup(['u1']);
        expect(comboProps.options.map((o: {value: string}) => o.value)).toEqual(['u2']);
    });

    it('adds a valid email', async () => {
        const onChange = await setup(['u1']);
        comboProps.onCreateOption('new@example.com');
        expect(onChange).toHaveBeenCalledWith(['u1', 'new@example.com']);
    });

    it('rejects invalid and duplicate emails', async () => {
        const onChange = await setup(['a@example.com']);
        comboProps.onCreateOption('not-an-email');
        comboProps.onCreateOption('A@example.com');
        expect(onChange).not.toHaveBeenCalled();
    });
});
