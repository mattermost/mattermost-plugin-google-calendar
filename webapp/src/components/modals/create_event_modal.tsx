import React from 'react';
import {useSelector, useDispatch} from 'react-redux';

import {Modal as BootstrapModal} from 'react-bootstrap';

import {isCreateEventModalVisible} from '@/selectors';

import {closeCreateEventModal} from '@/actions';

import CreateEventForm from './create_event_form';

type ModalRootProps = React.PropsWithChildren<{
    dialogClassName?: string;
    show?: boolean;
    onHide?: () => void;
    onExited?: () => void;
    size?: 'sm' | 'lg' | 'xl';
    backdrop?: string | boolean;
}>;

const Modal = BootstrapModal as unknown as React.FC<ModalRootProps> & {
    Header: React.FC<React.PropsWithChildren<{closeButton?: boolean}>>;
    Title: React.FC<React.PropsWithChildren<Record<string, unknown>>>;
};

export default function CreateEventModal() {
    const visible = useSelector(isCreateEventModalVisible);

    const dispatch = useDispatch();
    const close = () => dispatch(closeCreateEventModal());

    if (!visible) {
        return null;
    }

    const content = (
        <CreateEventForm
            close={close}
        />
    );

    return (
        <Modal
            dialogClassName='modal--scroll'
            show={visible}
            onHide={close}
            size='lg'
            backdrop='static'
        >
            <Modal.Header closeButton={true}>
                <Modal.Title>{'Create Calendar Event'}</Modal.Title>
            </Modal.Header>
            {content}
        </Modal>
    );
}
