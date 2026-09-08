import React from 'react';

type Props = {
    inputId?: string;
    label: React.ReactNode;
    children: React.ReactNode;
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
                    {required && !hideRequiredStar &&
                        <span
                            className='error-text'
                            style={{marginLeft: '6px'}}
                        >
                            {'*'}
                        </span>
                    }
                </label>
            }
            <div>
                {children}
                {helpText && (
                    <div className='help-text'>
                        {helpText}
                    </div>
                )}
            </div>
        </div>
    );
}
