// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

type Props = {
    inputId?: string;
    label: React.ReactNode;
    children: React.ReactChildren;
    helpText?: React.ReactNode;
    required?: boolean;
    hideRequiredStar?: boolean;
}

export default function Setting(props: Props) {
    const {
        children,
        helpText,
        inputId,
        label,
        required,
        hideRequiredStar,
    } = props;

    return (
        <div className='form-group less'>
            {label &&
                <label
                    className='control-label margin-bottom x2'
                    htmlFor={inputId}
                >
                    {label}
                </label>
            }
            {required && !hideRequiredStar &&
                <span
                    className='error-text'
                    style={{marginLeft: '3px'}}
                >
                    {'*'}
                </span>
            }
            <div>
                {children}
                <div className='help-text'>
                    {helpText}
                </div>
            </div>
        </div>
    );
}
