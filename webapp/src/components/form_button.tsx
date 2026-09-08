import React, {memo, useRef} from 'react';

let buttonIdCounter = 0;

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    id?: string;
    executing?: boolean;
    disabled?: boolean;
    executingMessage?: React.ReactNode;
    defaultMessage?: React.ReactNode;
    btnClass?: string;
    extraClasses?: string;
    saving?: boolean;
    savingMessage?: React.ReactNode;
    type?: 'button' | 'submit' | 'reset';
};

function FormButton({
    id,
    executing = false,
    disabled = false,
    executingMessage,
    defaultMessage = 'Create',
    btnClass = 'btn-primary',
    extraClasses = '',
    saving = false,
    savingMessage = 'Creating',
    type = 'button',
    children,
    ...rest
}: Props) {
    const generatedIdRef = useRef(`gcal-btn-${++buttonIdCounter}`);
    const buttonId = id || generatedIdRef.current;

    const spinner = (message: React.ReactNode) => (
        <span>
            <span
                className='fa fa-spin fa-spinner'
                title={'Loading Icon'}
                aria-hidden={true}
            />
            {' '}
            {message}
        </span>
    );

    let contents: React.ReactNode;
    if (executing) {
        contents = spinner(executingMessage ?? savingMessage);
    } else if (saving) {
        contents = spinner(savingMessage);
    } else {
        contents = children ?? defaultMessage;
    }

    let className = 'save-button btn ' + btnClass;
    if (extraClasses) {
        className += ' ' + extraClasses;
    }
    if (rest.className) {
        className += ' ' + rest.className;
    }

    return (
        <button
            {...rest}
            id={buttonId}
            className={className}
            disabled={disabled || saving || executing}
            aria-busy={saving || executing}
            type={type}
        >
            {contents}
        </button>
    );
}

export default memo(FormButton);
