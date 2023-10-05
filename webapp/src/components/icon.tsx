// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {PureComponent} from 'react';

type Props = {
    image?: string
};

export default class Icon extends PureComponent<Props> {
    static defaultProps = {
        position: 'relative',
        style: {},
    };

    public render() {
        return (
            <i
                className='icon fa'
                style={{
                    width: '18px',
                    height: '18px',
                    backgroundImage: `url(${this.props.image})`,
                    backgroundPosition: '50% 50%',
                    backgroundRepeat: 'no-repeat',
                    verticalAlign: 'middle',
                }}
            />
        );
    }
}
