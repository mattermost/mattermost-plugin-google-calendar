import {connect} from 'react-redux';
import {bindActionCreators, Dispatch} from 'redux';
import {GlobalState} from '@mattermost/types/store';
import {getCurrentTimezone} from 'mattermost-redux/selectors/entities/timezone';

import {fetchCalendarEvents, refreshCalendarEvents, getConnected, sendEphemeralPost, openCreateEventModal} from '@/actions';
import {getCalendarEvents, getCalendarEventsLoading, getCalendarEventsError, isUserConnected, getPluginServerRoute} from '@/selectors';

import CalendarSidebar from './calendar_sidebar';

function mapStateToProps(state: GlobalState) {
    return {
        events: getCalendarEvents(state),
        loading: getCalendarEventsLoading(state),
        error: getCalendarEventsError(state),
        timezone: getCurrentTimezone(state),
        connected: isUserConnected(state),
        pluginServerRoute: getPluginServerRoute(state),
    };
}

function mapDispatchToProps(dispatch: Dispatch) {
    return {
        actions: bindActionCreators({
            fetchCalendarEvents,
            refreshCalendarEvents,
            getConnected,
            sendEphemeralPost,
            openCreateEventModal,
        }, dispatch),
    };
}

export default connect(mapStateToProps, mapDispatchToProps)(CalendarSidebar);
