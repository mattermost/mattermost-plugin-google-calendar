import {ChevronLeftIcon, ChevronRightIcon, RefreshIcon} from '@mattermost/compass-icons/components';
import {Button} from '@mattermost/compass-ui/components/button';
import {Icon} from '@mattermost/compass-ui/components/icon';
import {IconButton} from '@mattermost/compass-ui/components/icon-button';

interface CalendarHeaderProps {
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
    onRefresh: () => void;
    loading: boolean;
    currentStart: Date;
    currentEnd: Date;
    isWeekView: boolean;
}

/** Formats the header's date label: a single day, or a start-end range when in week view. */
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

/** Sidebar header with prev/next/today navigation, a refresh button, and the current date range label. */
const CalendarHeader = ({onPrev, onNext, onToday, onRefresh, loading, currentStart, currentEnd, isWeekView}: CalendarHeaderProps) => {
    const label = formatDateLabel(currentStart, currentEnd, isWeekView);

    return (
        <div className='gcal-sidebar__header'>
            <div className='gcal-sidebar__header-nav'>
                <IconButton
                    size='small'
                    onClick={onPrev}
                    title='Previous'
                    aria-label='Previous'
                    icon={<Icon glyph={<ChevronLeftIcon/>}/>}
                />
                <span className='gcal-sidebar__header-label'>{label}</span>
                <IconButton
                    size='small'
                    onClick={onNext}
                    title='Next'
                    aria-label='Next'
                    icon={<Icon glyph={<ChevronRightIcon/>}/>}
                />
            </div>
            <div className='gcal-sidebar__header-actions'>
                <IconButton
                    size='small'
                    onClick={onRefresh}
                    disabled={loading}
                    loading={loading}
                    title='Refresh'
                    aria-label='Refresh'
                    icon={<Icon glyph={<RefreshIcon/>}/>}
                />
                <Button
                    emphasis='secondary'
                    size='small'
                    onClick={onToday}
                >
                    {'Today'}
                </Button>
            </div>
        </div>
    );
};

export default CalendarHeader;
