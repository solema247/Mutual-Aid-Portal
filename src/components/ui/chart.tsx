'use client'

import * as React from 'react'
import { ResponsiveContainer, Tooltip } from 'recharts'
import { cn } from '@/lib/utils'

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
    color?: string
    theme?: { light: string; dark: string }
  }
>

const ChartContext = React.createContext<ChartConfig>({})

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />')
  }
  return context
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    config: ChartConfig
    children: React.ReactNode
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = id ?? `chart-${uniqueId.replace(/:/g, '')}`

  return (
    <ChartContext.Provider value={config}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex aspect-video max-h-[300px] w-full flex-col items-center justify-center [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-sector]:outline-none [&_.recharts-sector[stroke='#fff']]:stroke-transparent",
          className
        )}
        {...props}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = 'ChartContainer'

/** Recharts Tooltip; boolean cursor is normalized to undefined so it never reaches the DOM (React warns on non-boolean attribute `cursor`). */
function ChartTooltip<ValueType extends number | string | Array<number | string>, NameType extends number | string>(
  props: React.ComponentProps<typeof Tooltip<ValueType, NameType>>
) {
  const { cursor, ...rest } = props
  return (
    <Tooltip<ValueType, NameType>
      {...rest}
      cursor={typeof cursor === 'boolean' ? undefined : cursor}
    />
  )
}

type TooltipPayloadItem = { value?: number; dataKey?: string; name?: string; color?: string; payload?: Record<string, unknown> }
type ChartTooltipContentProps = React.ComponentProps<'div'> & {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
  hideLabel?: boolean
  hideIndicator?: boolean
  indicator?: 'line' | 'dot' | 'dashed'
  nameKey?: string
  labelKey?: string
  formatter?: (value: number, name: string, item: unknown) => React.ReactNode
  /** Recharts passes these to content; we strip them so they are not spread onto the DOM */
  labelFormatter?: unknown
  cursor?: unknown
  allowEscapeViewBox?: unknown
  animationDuration?: unknown
  viewBox?: unknown
  coordinate?: unknown
  position?: unknown
  wrapperStyle?: unknown
  contentStyle?: unknown
  itemStyle?: unknown
  labelStyle?: unknown
  isAnimationActive?: unknown
  accessibilityLayer?: unknown
  activeIndex?: unknown
  useTranslate3d?: unknown
  reverseDirection?: unknown
  itemSorter?: unknown
  includeHidden?: unknown
  filterNull?: unknown
  axisId?: unknown
  animationEasing?: unknown
}

const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
  (
    {
      active,
      payload,
      label,
      className,
      indicator = 'dot',
      hideLabel = false,
      hideIndicator = false,
      labelKey,
      nameKey,
      formatter,
      labelFormatter: _labelFormatter,
      cursor: _cursor,
      allowEscapeViewBox: _allowEscapeViewBox,
      animationDuration: _animationDuration,
      viewBox: _viewBox,
      coordinate: _coordinate,
      position: _position,
      wrapperStyle: _wrapperStyle,
      contentStyle: _contentStyle,
      itemStyle: _itemStyle,
      labelStyle: _labelStyle,
      isAnimationActive: _isAnimationActive,
      accessibilityLayer: _accessibilityLayer,
      activeIndex: _activeIndex,
      useTranslate3d: _useTranslate3d,
      reverseDirection: _reverseDirection,
      itemSorter: _itemSorter,
      includeHidden: _includeHidden,
      filterNull: _filterNull,
      axisId: _axisId,
      animationEasing: _animationEasing,
      ...divProps
    },
    ref
  ) => {
    const config = useChart()

    if (!active || !payload?.length) {
      return null
    }

    const labelValue = labelKey && payload[0]?.payload
      ? (payload[0].payload as Record<string, unknown>)[labelKey]
      : label

    return (
      <div
        ref={ref}
        className={cn(
          'grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl',
          className
        )}
        {...divProps}
      >
        {!hideLabel && labelValue ? (
          <div className="grid gap-1.5 border-b border-border/50 px-2.5 py-1.5">
            <div className="font-medium text-foreground">
              {String(labelValue)}
            </div>
          </div>
        ) : null}
        <div className="grid gap-1.5 px-2.5 py-1.5">
          {payload.map((item, index) => {
            const key = nameKey ?? item.dataKey ?? item.name
            const configItem = key ? config[key as string] : undefined
            const value = formatter
              ? formatter(
                  Number(item.value),
                  configItem?.label as string ?? String(key),
                  item
                )
              : item.value != null
                ? typeof item.value === 'number'
                  ? item.value.toLocaleString()
                  : String(item.value)
                : '--'
            const indicatorColor = configItem?.color ?? item.color

            return (
              <div
                key={item.dataKey ?? index}
                className="flex w-full flex-wrap items-stretch gap-2 [&>svg]:size-2.5 [&>svg]:text-muted-foreground"
              >
                {!hideIndicator && (
                  <div
                    className="mt-0.5 shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]"
                    style={
                      {
                        '--color-bg': indicatorColor,
                        '--color-border': indicatorColor,
                      } as React.CSSProperties
                    }
                  >
                    {indicator === 'dot' ? (
                      <div
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: indicatorColor }}
                      />
                    ) : null}
                  </div>
                )}
                <div className="flex flex-1 justify-between gap-4 leading-none">
                  <span className="text-muted-foreground">
                    {configItem?.label ?? key}
                  </span>
                  <span className="font-mono font-medium text-foreground">
                    {value}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = 'ChartTooltipContent'

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  useChart,
}
