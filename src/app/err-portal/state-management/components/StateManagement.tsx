'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Flag, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import {
  DEFAULT_STATES_REVIEW_LABEL,
  DEFAULT_STATES_REVIEW_TASK_TYPE,
  GITHUB_PROJECT_TEAM_REQUESTS,
  GITHUB_STATES_REVIEW_LABELS,
  STATES_REVIEW_TASK_TYPES,
  type GithubStatesReviewLabel,
  type StatesReviewTaskType,
} from '@/lib/raiseTicketGithub'
import type { LocalityRow, StateGroup } from '@/lib/stateManagement/types'

type DialogKind =
  | { type: 'add-state' }
  | { type: 'add-locality'; stateName: string }
  | { type: 'edit-locality-ar'; locality: LocalityRow }
  | { type: 'edit-state-ar'; stateName: string; stateNameAr: string | null }
  | { type: 'review'; stateName: string; locality: LocalityRow }

function apiError (payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const message = (payload as { error?: unknown }).error
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export default function StateManagement() {
  const { t, i18n } = useTranslation(['states', 'err'])
  const { can } = useAllowedFunctions()
  const canCreate = can('states_create_locality')
  const canEditLabels = can('states_edit_labels')
  const canFlag = can('states_flag_review')

  const [states, setStates] = useState<StateGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('all')
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false)
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [newStateName, setNewStateName] = useState('')
  const [newStateNameAr, setNewStateNameAr] = useState('')
  const [newStateShort, setNewStateShort] = useState('')
  const [newStateLocality, setNewStateLocality] = useState('')
  const [newStateLocalityAr, setNewStateLocalityAr] = useState('')
  const [newLocality, setNewLocality] = useState('')
  const [newLocalityAr, setNewLocalityAr] = useState('')
  const [labelAr, setLabelAr] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [reviewLabel, setReviewLabel] = useState(DEFAULT_STATES_REVIEW_LABEL)
  const [reviewTaskType, setReviewTaskType] = useState(DEFAULT_STATES_REVIEW_TASK_TYPE)
  const [reviewTeamRequest, setReviewTeamRequest] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/states/management')
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(apiError(payload, t('states:load_error')))
      setStates(payload.states ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('states:load_error'))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const closeDialog = () => {
    setDialog(null)
    setFormError(null)
    setBusy(false)
    setNewStateName('')
    setNewStateNameAr('')
    setNewStateShort('')
    setNewStateLocality('')
    setNewStateLocalityAr('')
    setNewLocality('')
    setNewLocalityAr('')
    setLabelAr('')
    setReviewComment('')
    setReviewLabel(DEFAULT_STATES_REVIEW_LABEL)
    setReviewTaskType(DEFAULT_STATES_REVIEW_TASK_TYPE)
    setReviewTeamRequest('')
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return states
      .filter((group) => stateFilter === 'all' || group.state_name === stateFilter)
      .map((group) => {
        const localities = group.localities.filter((row) => {
          if (needsReviewOnly && !row.review) return false
          if (!q) return true
          const hay = [
            group.state_name,
            group.state_name_ar,
            group.state_short,
            row.locality,
            row.locality_ar,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return hay.includes(q)
        })
        return {
          ...group,
          localities,
          locality_count: localities.length,
          review_count: localities.filter((row) => row.review).length,
        }
      })
      .filter((group) => group.localities.length > 0)
  }, [needsReviewOnly, search, stateFilter, states])

  const toggleExpanded = (stateName: string) => {
    setExpandedStates((prev) => {
      const next = new Set(prev)
      if (next.has(stateName)) next.delete(stateName)
      else next.add(stateName)
      return next
    })
  }

  useEffect(() => {
    const q = search.trim().toLowerCase()
    const names = new Set<string>()
    if (stateFilter !== 'all') names.add(stateFilter)
    if (needsReviewOnly || q) {
      for (const group of states) {
        if (stateFilter !== 'all' && group.state_name !== stateFilter) continue
        const hasMatch = group.localities.some((row) => {
          if (needsReviewOnly && !row.review) return false
          if (!q) return true
          const hay = [group.state_name, group.state_name_ar, group.state_short, row.locality, row.locality_ar]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return hay.includes(q)
        })
        if (hasMatch) names.add(group.state_name)
      }
    }
    if (names.size === 0) return
    setExpandedStates((prev) => {
      const next = new Set(prev)
      names.forEach((name) => next.add(name))
      return next
    })
  }, [needsReviewOnly, search, stateFilter, states])

  const displayStateName = (group: StateGroup) =>
    i18n.language === 'ar' && group.state_name_ar ? group.state_name_ar : group.state_name

  const displayLocality = (row: LocalityRow) =>
    i18n.language === 'ar' && row.locality_ar ? row.locality_ar : (row.locality || t('states:none'))

  const handleSubmit = async () => {
    if (!dialog) return
    setBusy(true)
    setFormError(null)
    try {
      if (dialog.type === 'add-state') {
        const res = await fetch('/api/states/management', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state_name: newStateName,
            state_name_ar: newStateNameAr,
            state_short: newStateShort,
            locality: newStateLocality || null,
            locality_ar: newStateLocalityAr || null,
          }),
        })
        const payload = await res.json().catch(() => null)
        if (!res.ok) throw new Error(apiError(payload, 'Failed to create state'))
      } else if (dialog.type === 'add-locality') {
        const res = await fetch('/api/states/management/localities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state_name: dialog.stateName,
            locality: newLocality,
            locality_ar: newLocalityAr || null,
          }),
        })
        const payload = await res.json().catch(() => null)
        if (!res.ok) throw new Error(apiError(payload, 'Failed to create locality'))
      } else if (dialog.type === 'edit-locality-ar') {
        const res = await fetch(`/api/states/management/localities/${dialog.locality.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locality_ar: labelAr || null }),
        })
        const payload = await res.json().catch(() => null)
        if (!res.ok) throw new Error(apiError(payload, 'Failed to update locality'))
      } else if (dialog.type === 'edit-state-ar') {
        const res = await fetch('/api/states/management/state-arabic', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state_name: dialog.stateName,
            state_name_ar: labelAr,
          }),
        })
        const payload = await res.json().catch(() => null)
        if (!res.ok) throw new Error(apiError(payload, 'Failed to update state'))
      } else if (dialog.type === 'review') {
        const res = await fetch('/api/states/management/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state_id: dialog.locality.id,
            comment: reviewComment,
            label: reviewLabel,
            type_of_task: reviewTaskType,
            team_request: reviewTeamRequest,
          }),
        })
        const payload = await res.json().catch(() => null)
        if (!res.ok) throw new Error(apiError(payload, 'Failed to mark for review'))
      }
      closeDialog()
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Request failed')
      setBusy(false)
    }
  }

  const handleClearReview = async (reviewId: string) => {
    if (!confirm(t('states:clear_review_confirm'))) return
    try {
      const res = await fetch(`/api/states/management/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cleared' }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(apiError(payload, 'Failed to clear review'))
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear review')
    }
  }

  const iconBtn = 'h-6 w-6 p-0 rounded-none'
  const sharpControl = 'rounded-none'

  return (
    <div className="space-y-3">
      <div className="w-full text-xs text-muted-foreground">
        <p className="mb-1.5 font-medium text-foreground">{t('states:page_intro')}</p>
        <ul className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {(Array.isArray(t('states:page_bullets', { returnObjects: true }))
            ? (t('states:page_bullets', { returnObjects: true }) as string[])
            : []
          ).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{t('err:state_management')}</CardTitle>
              {canCreate && (
                <Button
                  type="button"
                  size="sm"
                  className={sharpControl}
                  onClick={() => setDialog({ type: 'add-state' })}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('states:add_state')}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('states:search_placeholder')}
                className={`h-8 min-h-8 w-[220px] px-3 py-0 text-xs leading-none ${sharpControl}`}
              />
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger
                  size="sm"
                  className={`h-8 min-h-8 w-[180px] px-3 py-0 text-xs leading-none ${sharpControl}`}
                >
                  <SelectValue placeholder={t('states:filter_by_state')} />
                </SelectTrigger>
                <SelectContent className={sharpControl}>
                  <SelectItem value="all">{t('states:all_states')}</SelectItem>
                  {states.map((group) => (
                    <SelectItem key={group.state_name} value={group.state_name}>
                      {displayStateName(group)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant={needsReviewOnly ? 'default' : 'outline'}
                size="sm"
                className={`h-8 min-h-8 px-3 py-0 text-xs leading-none ${sharpControl}`}
                onClick={() => setNeedsReviewOnly((v) => !v)}
              >
                {t('states:needs_review_only')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-xs text-muted-foreground">{t('states:drill_hint')}</div>
          {isLoading && (
            <div className="py-8 text-center text-muted-foreground">{t('states:loading')}</div>
          )}
          {error && <div className="text-destructive text-xs">{error}</div>}
          {!isLoading && !error && filtered.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">{t('states:no_states')}</div>
          )}
          {!isLoading && !error && filtered.length > 0 && (
            <div className="w-full overflow-x-auto">
              <Table className="w-full text-[11px] [&_th]:px-1 [&_td]:px-1 [&_th]:py-1 [&_td]:py-0.5 [&_th]:leading-tight">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t('states:state')} / {t('states:locality')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('states:short')} / {t('states:locality_ar')}</TableHead>
                    <TableHead className="text-right whitespace-nowrap">{t('states:localities')}</TableHead>
                    <TableHead className="text-right whitespace-nowrap">{t('states:rooms')}</TableHead>
                    <TableHead className="text-right whitespace-nowrap">{t('states:projects')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('states:reviews')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('states:actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((group) => {
                    const isOpen = expandedStates.has(group.state_name)
                    return (
                      <Fragment key={group.state_name}>
                        <TableRow
                          className="cursor-pointer bg-muted/50 font-semibold hover:bg-muted/50"
                          onClick={() => toggleExpanded(group.state_name)}
                        >
                          <TableCell>
                            <span className="inline-flex items-center gap-1">
                              {isOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                              {displayStateName(group)}
                            </span>
                          </TableCell>
                          <TableCell>{group.state_short || t('states:none')}</TableCell>
                          <TableCell className="text-right tabular-nums">{group.locality_count}</TableCell>
                          <TableCell className="text-right tabular-nums">{group.room_count}</TableCell>
                          <TableCell className="text-right tabular-nums">{group.project_count}</TableCell>
                          <TableCell>
                            {group.review_count > 0 ? (
                              <span className="inline-flex rounded-none bg-amber-100 px-1 py-0 text-[10px] font-medium text-amber-900">
                                {group.review_count}
                              </span>
                            ) : (
                              t('states:none')
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap gap-1">
                              {canCreate && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={iconBtn}
                                  title={t('states:add_locality')}
                                  onClick={() => setDialog({ type: 'add-locality', stateName: group.state_name })}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {canEditLabels && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={iconBtn}
                                  title={t('states:edit_state_arabic')}
                                  onClick={() => {
                                    setLabelAr(group.state_name_ar || '')
                                    setDialog({
                                      type: 'edit-state-ar',
                                      stateName: group.state_name,
                                      stateNameAr: group.state_name_ar,
                                    })
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {isOpen && group.localities.map((row) => (
                          <TableRow key={row.id} className="cursor-default hover:bg-muted/50">
                            <TableCell className="ps-6">{displayLocality(row)}</TableCell>
                            <TableCell>{row.locality_ar || t('states:none')}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{t('states:none')}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.room_count}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.project_count}</TableCell>
                            <TableCell>
                              {row.review ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex rounded-none bg-amber-100 px-1 py-0 text-[10px] font-medium text-amber-900">
                                    {t('states:needs_review')}
                                  </span>
                                  <p className="truncate text-muted-foreground" title={row.review.comment}>
                                    {row.review.comment}
                                  </p>
                                  {row.review.github_issue_url && (
                                    <a
                                      href={row.review.github_issue_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary underline"
                                    >
                                      {t('states:open_ticket')}
                                      {row.review.github_issue_number ? ` #${row.review.github_issue_number}` : ''}
                                    </a>
                                  )}
                                </div>
                              ) : (
                                t('states:none')
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {canEditLabels && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={iconBtn}
                                    title={t('states:edit_arabic')}
                                    onClick={() => {
                                      setLabelAr(row.locality_ar || '')
                                      setDialog({ type: 'edit-locality-ar', locality: row })
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {canFlag && !row.review && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={iconBtn}
                                    title={t('states:mark_review')}
                                    onClick={() => setDialog({
                                      type: 'review',
                                      stateName: group.state_name,
                                      locality: row,
                                    })}
                                  >
                                    <Flag className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {canFlag && row.review && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 rounded-none px-1.5 text-[10px]"
                                    title={t('states:clear_review')}
                                    onClick={() => void handleClearReview(row.review!.id)}
                                  >
                                    {t('states:clear_review')}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog != null} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="w-[min(calc(100%-2rem),28rem)] max-w-md gap-3 rounded-none p-4 sm:rounded-none">
          {dialog?.type === 'add-state' && (
            <>
              <DialogHeader>
                <DialogTitle>{t('states:add_state_title')}</DialogTitle>
                <DialogDescription>{t('states:add_state_description')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{t('states:state_name')} *</Label>
                  <Input className="rounded-none" value={newStateName} onChange={(e) => setNewStateName(e.target.value)} disabled={busy} />
                </div>
                <div>
                  <Label>{t('states:state_name_ar')} *</Label>
                  <Input className="rounded-none" value={newStateNameAr} onChange={(e) => setNewStateNameAr(e.target.value)} disabled={busy} />
                </div>
                <div>
                  <Label>{t('states:state_short')} *</Label>
                  <Input
                    className="rounded-none"
                    value={newStateShort}
                    onChange={(e) => setNewStateShort(e.target.value.toUpperCase())}
                    maxLength={4}
                    disabled={busy}
                    placeholder="KH"
                  />
                </div>
                <div>
                  <Label>{t('states:first_locality')}</Label>
                  <Input className="rounded-none" value={newStateLocality} onChange={(e) => setNewStateLocality(e.target.value)} disabled={busy} />
                </div>
                <div>
                  <Label>{t('states:first_locality_ar')}</Label>
                  <Input className="rounded-none" value={newStateLocalityAr} onChange={(e) => setNewStateLocalityAr(e.target.value)} disabled={busy} />
                </div>
              </div>
            </>
          )}

          {dialog?.type === 'add-locality' && (
            <>
              <DialogHeader>
                <DialogTitle>{t('states:add_locality_title', { state: dialog.stateName })}</DialogTitle>
                <DialogDescription>{t('states:add_locality_description')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{t('states:locality')} *</Label>
                  <Input className="rounded-none" value={newLocality} onChange={(e) => setNewLocality(e.target.value)} disabled={busy} />
                </div>
                <div>
                  <Label>{t('states:locality_ar')}</Label>
                  <Input className="rounded-none" value={newLocalityAr} onChange={(e) => setNewLocalityAr(e.target.value)} disabled={busy} />
                </div>
              </div>
            </>
          )}

          {dialog?.type === 'edit-locality-ar' && (
            <>
              <DialogHeader>
                <DialogTitle>{t('states:edit_locality_ar_title')}</DialogTitle>
              </DialogHeader>
              <div>
                <Label>{t('states:locality_ar')}</Label>
                <Input className="rounded-none" value={labelAr} onChange={(e) => setLabelAr(e.target.value)} disabled={busy} />
              </div>
            </>
          )}

          {dialog?.type === 'edit-state-ar' && (
            <>
              <DialogHeader>
                <DialogTitle>{t('states:edit_state_ar_title', { state: dialog.stateName })}</DialogTitle>
                <DialogDescription>{t('states:edit_state_ar_description')}</DialogDescription>
              </DialogHeader>
              <div>
                <Label>{t('states:state_name_ar')} *</Label>
                <Input className="rounded-none" value={labelAr} onChange={(e) => setLabelAr(e.target.value)} disabled={busy} />
              </div>
            </>
          )}

          {dialog?.type === 'review' && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t('states:review_title', { locality: dialog.locality.locality || t('states:none') })}
                </DialogTitle>
                <DialogDescription>{t('states:review_description')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{t('states:review_label')} *</Label>
                  <Select
                    value={reviewLabel}
                    onValueChange={(value) => {
                      if ((GITHUB_STATES_REVIEW_LABELS as readonly string[]).includes(value)) {
                        setReviewLabel(value as GithubStatesReviewLabel)
                      }
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-8 w-full rounded-none text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {GITHUB_STATES_REVIEW_LABELS.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('states:review_type_of_task')} *</Label>
                  <Select
                    value={reviewTaskType}
                    onValueChange={(value) => {
                      if ((STATES_REVIEW_TASK_TYPES as readonly string[]).includes(value)) {
                        setReviewTaskType(value as StatesReviewTaskType)
                      }
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-8 w-full rounded-none text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {STATES_REVIEW_TASK_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('states:review_team_request')} *</Label>
                  <Select
                    value={reviewTeamRequest}
                    onValueChange={(value) => {
                      if ((GITHUB_PROJECT_TEAM_REQUESTS as readonly string[]).includes(value)) {
                        setReviewTeamRequest(value)
                      }
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-8 w-full rounded-none text-xs">
                      <SelectValue placeholder={t('states:review_select')} />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {GITHUB_PROJECT_TEAM_REQUESTS.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('states:review_comment')} *</Label>
                  <Textarea
                    className="rounded-none"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder={t('states:review_comment_placeholder')}
                    disabled={busy}
                    rows={4}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t('states:review_comment_hint')}</p>
                </div>
              </div>
            </>
          )}

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-none" onClick={closeDialog} disabled={busy}>
              {t('states:cancel')}
            </Button>
            <Button
              type="button"
              className="rounded-none"
              onClick={() => void handleSubmit()}
              disabled={
                busy ||
                (dialog?.type === 'add-state' && (!newStateName.trim() || !newStateNameAr.trim() || !newStateShort.trim())) ||
                (dialog?.type === 'add-locality' && !newLocality.trim()) ||
                (dialog?.type === 'edit-state-ar' && !labelAr.trim()) ||
                (dialog?.type === 'review' && (reviewComment.trim().length < 10 || !reviewTeamRequest))
              }
            >
              {busy
                ? (dialog?.type === 'review' ? t('states:submitting') : t('states:saving'))
                : (dialog?.type === 'review' ? t('states:submit') : t('states:save'))}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
