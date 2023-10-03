// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useSelector, useDispatch} from 'react-redux';

import {Modal} from 'react-bootstrap';

import {isCreateEventModalVisible} from '@/selectors';

import {closeCreateEventModal} from '@/actions';

import CreateEventForm from './create_event_form';

type Props = {

    // visible: boolean;
    // close: () => void;
}

export default function CreateEventModal(props: Props) {
    const visible = useSelector(isCreateEventModalVisible);

    const dispatch = useDispatch();
    const close = () => dispatch(closeCreateEventModal());

    if (!visible) {
        return null;
    }

    const content = (
        <CreateEventForm
            {...props}
            close={close}
        />
    );

    return (
        <Modal
            dialogClassName='modal--scroll'
            show={visible}
            onHide={close}
            onExited={close}
            bsSize='large'
            backdrop='static'
        >
            <Modal.Header closeButton={true}>
                <Modal.Title>{'Create Calendar Event'}</Modal.Title>
            </Modal.Header>
            {content}
        </Modal>
    );
}
