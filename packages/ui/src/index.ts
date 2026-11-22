// Public surface of @studio/ui. Global styles: `import '@studio/ui/styles.css'` once in the root layout.
export { classNames } from './utils/class-names';
export { formatBytes, formatUsd, shortenHash } from './utils/format';

// Base components (design/componentes.md)
export { Button, buttonClassName } from './components/button/Button';
export type { ButtonClassNameOptions, ButtonProps, ButtonSize, ButtonVariant } from './components/button/Button';
export { Spinner } from './components/spinner/Spinner';
export type { SpinnerProps, SpinnerSize } from './components/spinner/Spinner';
export { textLinkClassName } from './components/text-link/TextLink';
export { Label } from './components/form/Label';
export type { LabelProps } from './components/form/Label';
export { FormField } from './components/form/FormField';
export type { FieldControlProps, FormFieldProps } from './components/form/FormField';
export { Input } from './components/form/Input';
export type { InputProps } from './components/form/Input';
export { Textarea } from './components/form/Textarea';
export type { TextareaProps } from './components/form/Textarea';
export { Select } from './components/form/Select';
export type { SelectOption, SelectProps } from './components/form/Select';
export { RadioGroup } from './components/form/RadioGroup';
export type { RadioGroupProps, RadioOption } from './components/form/RadioGroup';
export { Checkbox } from './components/form/Checkbox';
export type { CheckboxProps } from './components/form/Checkbox';
export { SearchField } from './components/form/SearchField';
export type { SearchFieldProps } from './components/form/SearchField';
export { Card } from './components/card/Card';
export type { CardHeadingLevel, CardProps } from './components/card/Card';
export { Badge } from './components/badge/Badge';
export type { BadgeProps, BadgeTone } from './components/badge/Badge';
export { Alert } from './components/alert/Alert';
export type { AlertProps, AlertVariant } from './components/alert/Alert';
export { Table } from './components/table/Table';
export type { TableColumn, TableProps } from './components/table/Table';
export { DescriptionList } from './components/description-list/DescriptionList';
export type { DescriptionItem, DescriptionListProps } from './components/description-list/DescriptionList';
export { Dialog } from './components/dialog/Dialog';
export type { DialogProps } from './components/dialog/Dialog';
export { EmptyState } from './components/feedback/EmptyState';
export type { EmptyStateProps } from './components/feedback/EmptyState';
export { ErrorState } from './components/feedback/ErrorState';
export type { ErrorStateProps } from './components/feedback/ErrorState';
export { AppShell, navLinkClassName } from './components/layout/AppShell';
export type { AppShellProps, NavLinkClassNameOptions } from './components/layout/AppShell';
export { PageHeader } from './components/layout/PageHeader';
export type { PageHeaderProps } from './components/layout/PageHeader';
export { Logo } from './components/layout/Logo';
export type { LogoProps } from './components/layout/Logo';
export { ThemeToggle } from './components/theme/ThemeToggle';
export type { ThemeToggleProps } from './components/theme/ThemeToggle';
export { THEME_COOKIE_NAME, parseThemePreference, themeAttribute } from './components/theme/theme';
export type { ThemePreference } from './components/theme/theme';

// Studio components (design/componentes-estudio.md)
export { StatusBadge } from './components/status/StatusBadge';
export type { StatusBadgeProps } from './components/status/StatusBadge';
export {
  assetStatusAppearance,
  runStatusAppearance,
  sensitivityAppearance,
  stepStatusAppearance,
} from './components/status/status-labels';
export type { StatusAppearance } from './components/status/status-labels';
export type { AssetSensitivity, AssetStatus, RunStatus, StepStatus, WatcherState } from './components/status/status-types';
export { AssetCard } from './components/catalog/AssetCard';
export type { AssetCardProps } from './components/catalog/AssetCard';
export { VersionList } from './components/catalog/VersionList';
export type { VersionListItem, VersionListProps } from './components/catalog/VersionList';
export { UploadDropzone } from './components/catalog/UploadDropzone';
export type { UploadDropzoneProps } from './components/catalog/UploadDropzone';
export { BindingList } from './components/recipes/BindingList';
export type { BindingListItem, BindingListProps } from './components/recipes/BindingList';
export { StepTimeline } from './components/runs/StepTimeline';
export type { StepTimelineProps, TimelinePhase, TimelineStage, TimelineStep } from './components/runs/StepTimeline';
export { CostMeter } from './components/runs/CostMeter';
export type { CostMeterProps } from './components/runs/CostMeter';
export { EventLog } from './components/runs/EventLog';
export type { EventLevel, EventLogItem, EventLogProps } from './components/runs/EventLog';
export { NowPanel } from './components/runs/NowPanel';
export type { NowPanelProps } from './components/runs/NowPanel';
export { RunControls } from './components/runs/RunControls';
export type { RunAction, RunControlsProps } from './components/runs/RunControls';
export { WatcherIndicator } from './components/runs/WatcherIndicator';
export type { WatcherIndicatorProps } from './components/runs/WatcherIndicator';
export { WaitingNotice } from './components/runs/WaitingNotice';
export type { WaitingNoticeProps } from './components/runs/WaitingNotice';
export { VideoPlayer } from './components/review/VideoPlayer';
export type { VideoAspect, VideoPlayerProps } from './components/review/VideoPlayer';
export { RatingInput } from './components/review/RatingInput';
export type { RatingInputProps, RatingValue } from './components/review/RatingInput';
export { Checklist } from './components/review/Checklist';
export type { ChecklistItem, ChecklistProps } from './components/review/Checklist';
export { QaResultList } from './components/review/QaResultList';
export type { QaResult, QaResultItem, QaResultListProps } from './components/review/QaResultList';
