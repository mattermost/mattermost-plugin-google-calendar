import {useDispatch} from 'react-redux';
import {AnyAction} from 'redux';
import {ThunkDispatch} from 'redux-thunk';
import {GlobalState} from '@mattermost/types/store';

export type AppDispatch = ThunkDispatch<GlobalState, undefined, AnyAction>;

/** Typed alternative to react-redux's useDispatch that knows about thunk actions. */
export const useAppDispatch = () => useDispatch<AppDispatch>();
