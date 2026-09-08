import React, {CSSProperties, memo} from 'react';

type Props = {
    position?: 'absolute' | 'fixed' | 'relative' | 'static' | 'inherit';
    style?: CSSProperties;
};

function Loading({position = 'relative', style = {}}: Props) {
    return (
        <div
            className='loading-screen'
            style={{...style, position}}
            role='status'
            aria-live='polite'
            aria-busy='true'
        >
            <div className='loading__content'>
                <h3>{'Loading'}</h3>
                <div className='round round-1'/>
                <div className='round round-2'/>
                <div className='round round-3'/>
            </div>
        </div>
    );
}

export default memo(Loading);
