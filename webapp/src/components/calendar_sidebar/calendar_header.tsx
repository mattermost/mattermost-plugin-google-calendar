import {MattermostTheme} from '@/utils/calendar_theme';

interface CalendarHeaderProps {
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
    onRefresh: () => void;
    loading: boolean;
    currentStart: Date;
    currentEnd: Date;
    isWeekView: boolean;
    theme: MattermostTheme;
}

function formatDateLabel(start: Date, end: Date, isWeekView: boolean): string {
    if (!isWeekView) {
        return start.toLocaleDateString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    const lastDay = new Date(end);
    lastDay.setDate(lastDay.getDate() - 1);

    const sameMonth = start.getMonth() === lastDay.getMonth() && start.getFullYear() === lastDay.getFullYear();

    if (sameMonth) {
        const monthYear = start.toLocaleDateString([], {month: 'short', year: 'numeric'});
        return `${start.getDate()} - ${lastDay.getDate()} ${monthYear}`;
    }

    const startStr = start.toLocaleDateString([], {month: 'short', day: 'numeric'});
    const endStr = lastDay.toLocaleDateString([], {month: 'short', day: 'numeric', year: 'numeric'});
    return `${startStr} - ${endStr}`;
}

const CalendarHeader = ({onPrev, onNext, onToday, onRefresh, loading, currentStart, currentEnd, isWeekView, theme}: CalendarHeaderProps) => {
    const label = formatDateLabel(currentStart, currentEnd, isWeekView);

    return (
        <div className='gcal-sidebar__header'>
            <div className='gcal-sidebar__header-nav'>
                <button
                    type='button'
                    className='gcal-sidebar__header-btn'
                    onClick={onPrev}
                    title='Previous'
                    aria-label='Previous'
                    style={{color: theme.centerChannelColor}}
                >
                    <i className='icon icon-chevron-left'/>
                </button>
                <span className='gcal-sidebar__header-label'>{label}</span>
                <button
                    type='button'
                    className='gcal-sidebar__header-btn'
                    onClick={onNext}
                    title='Next'
                    aria-label='Next'
                    style={{color: theme.centerChannelColor}}
                >
                    <i className='icon icon-chevron-right'/>
                </button>
            </div>
            <div className='gcal-sidebar__header-actions'>
                <button
                    type='button'
                    className='gcal-sidebar__header-btn'
                    onClick={onRefresh}
                    disabled={loading}
                    title='Refresh'
                    aria-label='Refresh'
                    style={{color: theme.centerChannelColor}}
                >
                    <i className={`icon icon-refresh${loading ? ' gcal-spin' : ''}`}/>
                </button>
                <button
                    type='button'
                    className='gcal-sidebar__header-today'
                    onClick={onToday}
                    style={{
                        color: theme.buttonBg,
                        borderColor: theme.buttonBg,
                    }}
                >
                    {'Today'}
                </button>
            </div>
        </div>
    );
};

export default CalendarHeader;
