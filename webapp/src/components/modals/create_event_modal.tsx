import React from 'react';
import {useSelector, useDispatch} from 'react-redux';

import {ModalOverlay} from '@mattermost/compass-ui/components/modal';

import {isCreateEventModalVisible} from '@/selectors';
import {closeCreateEventModal} from '@/actions';
import {Z_INDEX_BACKDROP} from '@/utils/styles';

import CreateEventForm from './create_event_form';

import './create_event_modal.scss';

/** Overlay for the create-event modal; the backdrop is static, so only Cancel, close, or Escape dismiss it. */
export default function CreateEventModal() {
    const visible = useSelector(isCreateEventModalVisible);
    const dispatch = useDispatch();
    const close = () => dispatch(closeCreateEventModal());

    return (
        <ModalOverlay
            open={visible}
            zIndex={Z_INDEX_BACKDROP}
        >
            <CreateEventForm
                open={visible}
                close={close}
            />
        </ModalOverlay>
    );
}
