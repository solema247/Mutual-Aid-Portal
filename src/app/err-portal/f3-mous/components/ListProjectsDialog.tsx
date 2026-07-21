'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import type { useListProjectsModal } from '../hooks/useListProjectsModal'

type ListProjectsDialogProps = ReturnType<typeof useListProjectsModal>

export default function ListProjectsDialog(props: ListProjectsDialogProps) {
  const {
    listProjectsModalOpen,
    listProjectsMouCode,
    listProjectsLoading,
    listProjectsMouAssigned,
    listProjectsAddMode,
    listProjectsList,
    listProjectsActionLoading,
    candidatesForAdd,
    selectedCandidates,
    setSelectedCandidates,
    handleListProjectsModalOpenChange,
    removeProject,
    startAddMode,
    addSelectedProjects,
    setListProjectsAddMode,
  } = props

  return (      <Dialog open={listProjectsModalOpen} onOpenChange={handleListProjectsModalOpenChange}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Projects in {listProjectsMouCode || 'MOU'}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            {listProjectsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : listProjectsMouAssigned ? (
              <>
                <p className="text-sm text-muted-foreground">This MOU is assigned to a grant. Projects are read-only.</p>
                <div className="border rounded-md overflow-auto max-h-[50vh]">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="[&>th]:py-1.5 [&>th]:px-2 [&>th]:text-xs">
                        <TableHead className="px-2">ERR ID</TableHead>
                        <TableHead className="px-2">State</TableHead>
                        <TableHead className="px-2">Locality</TableHead>
                        <TableHead className="text-right px-2">USD</TableHead>
                        <TableHead className="px-2">Categories</TableHead>
                        <TableHead className="px-2">Grant ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {listProjectsList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-xs">No projects linked</TableCell>
                        </TableRow>
                      ) : (
                        listProjectsList.map((p) => (
                          <TableRow key={p.id} title={p.project_objectives ?? undefined} className="[&>td]:py-1.5 [&>td]:px-2 [&>td]:text-xs">
                            <TableCell className="font-mono whitespace-nowrap">{p.err_id ?? '-'}</TableCell>
                            <TableCell className="whitespace-nowrap">{p.state || '-'}</TableCell>
                            <TableCell className="max-w-[100px] truncate" title={p.locality ?? ''}>{p.locality ?? '-'}</TableCell>
                            <TableCell className="text-right font-mono whitespace-nowrap">{p.amount_usd != null ? p.amount_usd.toLocaleString() : '—'}</TableCell>
                            <TableCell className="max-w-[120px] truncate" title={p.categories}>{p.categories}</TableCell>
                            <TableCell className="font-mono whitespace-nowrap">{p.grant_id ?? '-'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Add or remove projects before assigning this MOU to a grant.</p>
                {!listProjectsAddMode ? (
                  <>
                    <div className="border rounded-md overflow-auto max-h-[40vh]">
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow className="[&>th]:py-1.5 [&>th]:px-2 [&>th]:text-xs">
                            <TableHead className="px-2">ERR ID</TableHead>
                            <TableHead className="px-2">State</TableHead>
                            <TableHead className="px-2">Locality</TableHead>
                            <TableHead className="text-right px-2">USD</TableHead>
                            <TableHead className="px-2">Categories</TableHead>
                            <TableHead className="w-[70px] px-2">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {listProjectsList.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-xs">No projects linked</TableCell>
                            </TableRow>
                          ) : (
                            listProjectsList.map((p) => (
                              <TableRow key={p.id} title={p.project_objectives ?? undefined} className="[&>td]:py-1.5 [&>td]:px-2 [&>td]:text-xs">
                                <TableCell className="font-mono whitespace-nowrap">{p.err_id ?? '-'}</TableCell>
                                <TableCell className="whitespace-nowrap">{p.state || '-'}</TableCell>
                                <TableCell className="max-w-[100px] truncate" title={p.locality ?? ''}>{p.locality ?? '-'}</TableCell>
                                <TableCell className="text-right font-mono whitespace-nowrap">{p.amount_usd != null ? p.amount_usd.toLocaleString() : '—'}</TableCell>
                                <TableCell className="max-w-[120px] truncate" title={p.categories}>{p.categories}</TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive h-7 text-xs px-2"
                                    disabled={listProjectsActionLoading}
                                    onClick={() => removeProject(p.id)}
                                  >
                                    Remove
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <Button
                      variant="outline"
                      onClick={startAddMode}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add projects
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm">Select committed work plans that are not linked to any MOU:</p>
                    <div className="border rounded-md overflow-auto max-h-[35vh]">
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow className="[&>th]:py-1.5 [&>th]:px-2 [&>th]:text-xs">
                            <TableHead className="w-9 px-2">Add</TableHead>
                            <TableHead className="px-2">ERR ID</TableHead>
                            <TableHead className="px-2">State</TableHead>
                            <TableHead className="px-2">Locality</TableHead>
                            <TableHead className="text-right px-2">USD</TableHead>
                            <TableHead className="px-2">Categories</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {candidatesForAdd.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-4 text-xs">No unlinked committed projects</TableCell>
                            </TableRow>
                          ) : (
                            candidatesForAdd.map((c) => (
                              <TableRow key={c.id} title={c.project_objectives ?? undefined} className="[&>td]:py-1.5 [&>td]:px-2 [&>td]:text-xs">
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    checked={selectedCandidates.has(c.id)}
                                    onChange={(e) => {
                                      setSelectedCandidates((prev) => {
                                        const next = new Set(prev)
                                        if (e.target.checked) next.add(c.id)
                                        else next.delete(c.id)
                                        return next
                                      })
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="font-mono whitespace-nowrap">{c.err_id ?? '-'}</TableCell>
                                <TableCell className="whitespace-nowrap">{c.state || '-'}</TableCell>
                                <TableCell className="max-w-[100px] truncate" title={c.locality ?? ''}>{c.locality ?? '-'}</TableCell>
                                <TableCell className="text-right font-mono whitespace-nowrap">{c.amount_usd != null ? c.amount_usd.toLocaleString() : '—'}</TableCell>
                                <TableCell className="max-w-[120px] truncate" title={c.categories}>{c.categories}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        disabled={selectedCandidates.size === 0 || listProjectsActionLoading}
                        onClick={addSelectedProjects}
                      >
                        Add selected ({selectedCandidates.size})
                      </Button>
                      <Button variant="outline" onClick={() => { setListProjectsAddMode(false); setSelectedCandidates(new Set()) }}>
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
  )
}
